import { LatLon } from './map_service';

/**
 * Enlaces de Google Maps (Maps URLs, api=1) para navegar el plan de visitas.
 * Solo llevan coordenadas: ningún nombre de usuaria sale en la URL.
 * https://developers.google.com/maps/documentation/urls/get-started#directions-action
 */

/** Máximo de paradas intermedias que acepta un enlace de Google Maps */
export const MAX_GOOGLE_MAPS_WAYPOINTS = 9;

function formatCoord(point: LatLon): string {
  return `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`;
}

function buildDirectionsUrl(origin: LatLon, destination: LatLon, waypoints: LatLon[]): string {
  const params = new URLSearchParams({
    api: '1',
    origin: formatCoord(origin),
    destination: formatCoord(destination),
    travelmode: 'driving',
  });
  if (waypoints.length > 0) {
    params.set('waypoints', waypoints.map(formatCoord).join('|'));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Recorrido completo en orden (partida, visitas y, si hay, llegada o vuelta)
 * partido en enlaces de como mucho MAX_GOOGLE_MAPS_WAYPOINTS paradas intermedias.
 * Cada tramo empieza donde acaba el anterior.
 * @returns lista vacía si el recorrido tiene menos de 2 puntos
 */
export function buildGoogleMapsLinks(route: LatLon[]): string[] {
  if (route.length < 2) return [];
  const step = MAX_GOOGLE_MAPS_WAYPOINTS + 1;
  const links: string[] = [];
  for (let from = 0; from < route.length - 1; from += step) {
    const to = Math.min(from + step, route.length - 1);
    links.push(buildDirectionsUrl(route[from], route[to], route.slice(from + 1, to)));
  }
  return links;
}
