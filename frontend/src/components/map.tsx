import React, { useCallback, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { Deck, FlyToInterpolator } from '@deck.gl/core';
import { IconLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';

const ORIGIN_ICON_URL = `${import.meta.env.BASE_URL}icons/origin-person.svg`;
const WORKER_HOME_ICON_URL = `${import.meta.env.BASE_URL}icons/worker-home.svg`;
const END_ICON_URL = `${import.meta.env.BASE_URL}icons/end-flag.svg`;
import { CircularProgress, Backdrop, Paper, Typography } from '@mui/material';

import { LegsResult, MapPoint, VisitPlanPoint, WorkerRoute } from '../services/map_service';
import { formatMinutes } from '../services/time_ranges';
import { formatPersonName } from '../services/person_name';

interface MapProps {
  workers: string[];
  points: MapPoint[] | null;
  routes: WorkerRoute[] | null;
  isLoading?: boolean;
  planningMode?: boolean;
  planOrigin?: VisitPlanPoint | null;
  planStops?: VisitPlanPoint[];
  /** Llegada distinta de la partida (acabar en otro sitio) */
  planEnd?: VisitPlanPoint | null;
  /** Trabajadora de la ruta en planificación: las usuarias de las demás se atenúan */
  planWorkerId?: string | number | null;
  planLegs?: LegsResult | null;
  /** Hora de inicio de cada visita (minutos desde medianoche), si hay horario */
  planStopTimes?: number[] | null;
  /** Visita resaltada (tocada en el mapa o en su tarjeta) */
  planSelectedIndex?: number | null;
  /** Centrar el mapa aquí; `nonce` distinto repite el vuelo al mismo sitio */
  focus?: { lat: number; lon: number; nonce: number } | null;
  onPlanPointClick?: (point: MapPoint) => void;
  onPlanMapClick?: (lat: number, lon: number) => void;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTooltipName(name?: string, ape1?: string, ape2?: string): string {
  return formatPersonName(name, ape1, ape2) || '—';
}

function pointTooltipHtml(point: MapPoint): string {
  if (point.kind === 'worker') {
    const workerFull = formatTooltipName(point.workerName, point.workerApe1, point.workerApe2);
    const cif = point.workerCif ? escapeHtml(point.workerCif) : '—';
    return `
      <div style="font-family:system-ui,sans-serif;font-size:12px;line-height:1.45;max-width:260px">
        <div style="font-weight:700;margin-bottom:4px;letter-spacing:0.02em">TRABAJADORA</div>
        <div style="font-weight:600">${escapeHtml(workerFull)}</div>
        <div>CIF: ${cif}</div>
      </div>
    `;
  }

  const userFull = formatTooltipName(point.userName, point.userApe1, point.userApe2);
  const workerFull = formatTooltipName(point.workerName, point.workerApe1, point.workerApe2);
  const cif = point.userCif ? escapeHtml(point.userCif) : '—';
  const mun = point.userMunId != null && point.userMunId !== ''
    ? escapeHtml(point.userMunId)
    : '—';
  const userId = point.userId != null ? escapeHtml(point.userId) : '—';

  return `
    <div style="font-family:system-ui,sans-serif;font-size:12px;line-height:1.45;max-width:260px">
      <div style="font-weight:600;margin-bottom:4px">${escapeHtml(userFull)}</div>
      <div>ID: ${userId}</div>
      <div>CIF: ${cif}</div>
      <div>Municipio: ${mun}</div>
      <div style="margin-top:6px;opacity:0.9">Trabajadora: ${escapeHtml(workerFull)}</div>
    </div>
  `;
}

/**
 * Distancia aproximada en grados; umbral ~0.008 ≈ 800–900 m en Canarias.
 * Con `workerId`, solo cuentan las usuarias de esa trabajadora (la del plan).
 */
function findNearestUserPoint(
  points: MapPoint[],
  lat: number,
  lon: number,
  maxDist: number,
  workerId: string | null = null
): MapPoint | null {
  let best: MapPoint | null = null;
  let bestD = maxDist;
  for (const p of points) {
    if (p.kind === 'worker') continue;
    if (workerId != null && String(p.id) !== workerId) continue;
    const d = Math.hypot(Number(p.lat) - lat, Number(p.lon) - lon);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

const WORKER_COLORS: [number, number, number][] = [
  [102, 197, 204],
  [246, 207, 113],
  [248, 156, 116],
  [220, 176, 242],
  [135, 197, 95],
  [158, 185, 243],
  [254, 136, 177],
  [201, 219, 116],
  [139, 224, 164],
  [180, 151, 231],
  [211, 180, 132],
  [179, 179, 179],
];

const Map: React.FC<MapProps> = ({
  workers,
  points,
  routes,
  isLoading = false,
  planningMode = false,
  planOrigin = null,
  planStops = [],
  planEnd = null,
  planWorkerId = null,
  planLegs = null,
  planStopTimes = null,
  planSelectedIndex = null,
  focus = null,
  onPlanPointClick,
  onPlanMapClick,
}) => {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const deckRef = useRef<Deck | null>(null);
  const planningModeRef = useRef(planningMode);
  const onPlanPointClickRef = useRef(onPlanPointClick);
  const onPlanMapClickRef = useRef(onPlanMapClick);
  const pointsRef = useRef(points);
  const hasOriginRef = useRef(Boolean(planOrigin));
  const planWorkerIdRef = useRef(planWorkerId);
  // Última vista del mapa, para volar a una visita sin perder giro ni inclinación
  const viewStateRef = useRef<Record<string, unknown> | null>(null);

  useEffect(() => {
    planningModeRef.current = planningMode;
  }, [planningMode]);
  useEffect(() => {
    onPlanPointClickRef.current = onPlanPointClick;
  }, [onPlanPointClick]);
  useEffect(() => {
    onPlanMapClickRef.current = onPlanMapClick;
  }, [onPlanMapClick]);
  useEffect(() => {
    pointsRef.current = points;
  }, [points]);
  useEffect(() => {
    hasOriginRef.current = Boolean(planOrigin);
  }, [planOrigin]);
  useEffect(() => {
    planWorkerIdRef.current = planWorkerId;
  }, [planWorkerId]);

  // Color de cada trabajadora según su posición en la selección (mismo orden que la leyenda)
  const getWorkerColor = useCallback(
    (workerId: string | number): [number, number, number] => {
      const index = workers.indexOf(String(workerId));
      return index >= 0 ? WORKER_COLORS[index % WORKER_COLORS.length] : [128, 128, 128];
    },
    [workers]
  );

  useEffect(() => {
    const initializeMap = async () => {
      const INITIAL_VIEW_STATE = {
        latitude: 28.203178,
        longitude: -16.196414,
        zoom: 9.25,
        bearing: 0,
        pitch: 30
      };

      const cartoApiKey = import.meta.env.VITE_CARTO_API_KEY;
      if (!cartoApiKey) {
        console.warn('Falta VITE_CARTO_API_KEY en frontend/.env.local');
      }
      const cartoTileUrl = cartoApiKey
        ? `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${cartoApiKey}`
        : 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';

      const MAPLIBRE_STYLE: maplibregl.StyleSpecification = {
        version: 8,
        sources: {
          'carto-voyager': {
            type: 'raster',
            tiles: [cartoTileUrl],
            tileSize: 256,
            attribution: '© CARTO, © OpenStreetMap contributors'
          }
        },
        layers: [
          {
            id: 'carto-voyager',
            type: 'raster',
            source: 'carto-voyager',
            minzoom: 0,
            maxzoom: 19
          }
        ],
        name: 'Carto Voyager',
        metadata: {},
        center: [INITIAL_VIEW_STATE.longitude, INITIAL_VIEW_STATE.latitude],
        zoom: INITIAL_VIEW_STATE.zoom,
        bearing: INITIAL_VIEW_STATE.bearing,
        pitch: INITIAL_VIEW_STATE.pitch
      };

      if (!mapRef.current) {
        mapRef.current = new maplibregl.Map({
          container: 'map',
          style: MAPLIBRE_STYLE,
          interactive: true,
          center: [INITIAL_VIEW_STATE.longitude, INITIAL_VIEW_STATE.latitude],
          zoom: INITIAL_VIEW_STATE.zoom,
          pitch: INITIAL_VIEW_STATE.pitch,
          bearing: INITIAL_VIEW_STATE.bearing
        });

        mapRef.current.on('load', () => {
          if (deckRef.current) {
            deckRef.current.setProps({ canvas: mapRef.current?.getCanvas() });
          }
        });
      }

      if (!deckRef.current) {
        deckRef.current = new Deck({
          initialViewState: INITIAL_VIEW_STATE,
          controller: true,
          pickingRadius: 12,
          layers: [],
          getTooltip: ({ object, layer }) => {
            if (!object || (layer?.id !== 'user-points' && layer?.id !== 'worker-homes')) {
              return null;
            }
            const point = object as MapPoint;
            if (point.kind === 'worker') {
              return {
                html: pointTooltipHtml(point),
                style: {
                  backgroundColor: 'rgba(20, 24, 28, 0.94)',
                  color: '#f5f5f5',
                  padding: '8px 10px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  border: '2px solid #dc2626',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                },
              };
            }
            if (point.userId == null && !point.userName) {
              return null;
            }
            return {
              html: pointTooltipHtml(point),
              style: {
                backgroundColor: 'rgba(20, 24, 28, 0.92)',
                color: '#f5f5f5',
                padding: '8px 10px',
                borderRadius: '4px',
                fontSize: '12px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
              },
            };
          },
          onClick: (info) => {
            if (!planningModeRef.current) return;

            if (info.object && (info.layer?.id === 'user-points' || info.layer?.id === 'worker-homes')) {
              let point = info.object as MapPoint;
              // Puntos superpuestos de varias trabajadoras: elegir el de la trabajadora del plan
              const planWorker = planWorkerIdRef.current != null ? String(planWorkerIdRef.current) : null;
              if (point.kind !== 'worker' && planWorker != null && String(point.id) !== planWorker) {
                const own = deckRef.current
                  ?.pickMultipleObjects({ x: info.x, y: info.y, radius: 12, layerIds: ['user-points'], depth: 20 })
                  .map((picked) => picked.object as MapPoint)
                  .find((candidate) => candidate && String(candidate.id) === planWorker);
                if (own) point = own;
              }
              onPlanPointClickRef.current?.(point);
              return;
            }

            // Fallback: tras fijar partida, un click cerca de una usuaria cuenta aunque el picking falle
            if (
              hasOriginRef.current &&
              info.coordinate &&
              info.coordinate.length >= 2 &&
              pointsRef.current
            ) {
              const [lon, lat] = info.coordinate;
              const planWorker = planWorkerIdRef.current != null ? String(planWorkerIdRef.current) : null;
              const nearest = findNearestUserPoint(pointsRef.current, lat, lon, 0.008, planWorker);
              if (nearest) {
                onPlanPointClickRef.current?.(nearest);
                return;
              }
            }

            // Zona vacía: App decide si fija/mueve la partida, fija la llegada o lo ignora
            if (info.coordinate && info.coordinate.length >= 2) {
              const [lon, lat] = info.coordinate;
              onPlanMapClickRef.current?.(lat, lon);
            }
          },
          onViewStateChange: ({ viewState }) => {
            viewStateRef.current = viewState as Record<string, unknown>;
            if (mapRef.current) {
              mapRef.current.jumpTo({
                center: [viewState.longitude, viewState.latitude],
                zoom: viewState.zoom,
                bearing: viewState.bearing,
                pitch: viewState.pitch
              });
            }
          }
        });
      }
    };

    initializeMap();

    const mapEl = document.getElementById('map');
    const resizeObserver =
      mapEl && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            mapRef.current?.resize();
            deckRef.current?.setProps({
              width: mapEl.clientWidth,
              height: mapEl.clientHeight,
            });
          })
        : null;
    if (mapEl && resizeObserver) resizeObserver.observe(mapEl);

    return () => {
      resizeObserver?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!deckRef.current || !mapRef.current) return;

    const layers = [];

    // Rutas automáticas solo fuera del modo planificar
    if (!planningMode && routes && routes.length > 0) {
      layers.push(
        new PathLayer({
          id: 'worker-routes',
          data: routes.filter((r) => Array.isArray(r.polyline) && r.polyline.length > 0),
          getPath: (d: WorkerRoute) => d.polyline ?? [],
          getColor: (d: WorkerRoute) => getWorkerColor(d.worker_id),
          getWidth: 4,
          widthUnits: 'meters',
          widthMinPixels: 2,
          pickable: false,
          updateTriggers: {
            getColor: workers
          }
        })
      );
    }

    // Puntos pickables debajo; marcadores del plan encima (pickable:false → el clic atraviesa)
    if (points && points.length > 0) {
      const userPoints = points.filter((p) => p.kind !== 'worker');
      const workerHomes = points.filter((p) => p.kind === 'worker');

      if (userPoints.length > 0) {
        layers.push(
          new ScatterplotLayer({
            id: 'user-points',
            data: userPoints,
            getPosition: (d: MapPoint) => [d.lon, d.lat],
            getFillColor: (d: MapPoint): [number, number, number, number] => {
              const dimmed =
                planningMode && planWorkerId != null && String(d.id) !== String(planWorkerId);
              return [...getWorkerColor(d.id), dimmed ? 55 : 255];
            },
            getRadius: 120,
            radiusUnits: 'meters',
            radiusMinPixels: 6,
            radiusMaxPixels: 15,
            pickable: true,
            updateTriggers: {
              getFillColor: [workers, planningMode, planWorkerId]
            }
          })
        );
      }

      if (workerHomes.length > 0) {
        layers.push(
          // Domicilio de cada trabajadora seleccionada: icono de casa centrado en el punto
          new IconLayer({
            id: 'worker-homes',
            data: workerHomes,
            getPosition: (d: MapPoint) => [d.lon, d.lat],
            getIcon: () => ({
              url: WORKER_HOME_ICON_URL,
              width: 64,
              height: 64,
              anchorY: 32,
            }),
            getSize: 36,
            sizeUnits: 'pixels',
            pickable: true,
          })
        );
      }
    }

    if (planningMode) {
      const planPaths = (planLegs?.legs || [])
        .filter((leg) => Array.isArray(leg.polyline) && leg.polyline.length > 0)
        .map((leg) => ({ polyline: leg.polyline }));
      if (planPaths.length > 0) {
        layers.push(
          new PathLayer({
            id: 'plan-routes',
            data: planPaths,
            getPath: (d) => d.polyline,
            getColor: [22, 163, 74],
            getWidth: 5,
            widthUnits: 'meters',
            widthMinPixels: 3,
            pickable: false,
          })
        );
      }

      const selectedStop = planSelectedIndex != null ? planStops[planSelectedIndex] : undefined;
      if (selectedStop) {
        // Halo ámbar bajo el número de la visita resaltada
        layers.push(
          new ScatterplotLayer({
            id: 'plan-selected',
            data: [selectedStop],
            getPosition: (d: VisitPlanPoint) => [d.lon, d.lat],
            getFillColor: [245, 158, 11, 90],
            getLineColor: [245, 158, 11, 255],
            radiusUnits: 'pixels',
            getRadius: 30,
            lineWidthMinPixels: 3,
            stroked: true,
            filled: true,
            pickable: false,
          })
        );
      }

      if (planStops.length > 0) {
        const numbered = planStops.map((stop, index) => ({
          ...stop,
          visitNumber: String(index + 1),
        }));
        // Disco azul opaco que tapa el punto de usuaria debajo
        layers.push(
          new ScatterplotLayer({
            id: 'plan-stops',
            data: numbered,
            getPosition: (d: VisitPlanPoint) => [d.lon, d.lat],
            getFillColor: [30, 64, 175],
            getLineColor: [255, 255, 255],
            radiusUnits: 'pixels',
            getRadius: 18,
            radiusMinPixels: 18,
            radiusMaxPixels: 22,
            lineWidthMinPixels: 3,
            stroked: true,
            filled: true,
            pickable: false,
          })
        );
        layers.push(
          new TextLayer({
            id: 'plan-stop-labels',
            data: numbered,
            getPosition: (d: VisitPlanPoint & { visitNumber: string }) => [d.lon, d.lat],
            getText: (d: { visitNumber: string }) => d.visitNumber,
            getSize: 18,
            sizeUnits: 'pixels',
            sizeMinPixels: 16,
            sizeMaxPixels: 22,
            getColor: [255, 255, 255],
            getAngle: 0,
            getTextAnchor: 'middle',
            getAlignmentBaseline: 'center',
            billboard: true,
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontWeight: 700,
            fontSettings: { sdf: true, radius: 12, cutoff: 0.25 },
            outlineWidth: 4,
            outlineColor: [30, 64, 175],
            characterSet: '0123456789',
            pickable: false,
            parameters: { depthTest: false },
          })
        );
        if (planStopTimes && planStopTimes.length === planStops.length) {
          // Hora de la visita en una etiqueta bajo el número
          const timed = planStops.map((stop, index) => ({
            ...stop,
            timeLabel: formatMinutes(planStopTimes[index]),
          }));
          layers.push(
            new TextLayer({
              id: 'plan-stop-times',
              data: timed,
              getPosition: (d: VisitPlanPoint & { timeLabel: string }) => [d.lon, d.lat],
              getText: (d: { timeLabel: string }) => d.timeLabel,
              getSize: 12,
              sizeUnits: 'pixels',
              getPixelOffset: [0, 30],
              getColor: [20, 50, 60],
              getTextAnchor: 'middle',
              getAlignmentBaseline: 'center',
              fontFamily: 'Arial, Helvetica, sans-serif',
              fontWeight: 700,
              characterSet: '0123456789:',
              background: true,
              getBackgroundColor: [255, 255, 255, 235],
              getBorderColor: [30, 64, 175],
              getBorderWidth: 1,
              backgroundPadding: [5, 2, 5, 2],
              pickable: false,
              parameters: { depthTest: false },
            })
          );
        }
      }

      if (planOrigin) {
        layers.push(
          new IconLayer({
            id: 'plan-origin',
            data: [planOrigin],
            getPosition: (d: VisitPlanPoint) => [d.lon, d.lat],
            getIcon: () => ({
              url: ORIGIN_ICON_URL,
              width: 64,
              height: 80,
              anchorY: 80,
            }),
            getSize: 48,
            sizeUnits: 'pixels',
            pickable: false,
            parameters: { depthTest: false },
          })
        );
      }

      if (planEnd) {
        layers.push(
          new IconLayer({
            id: 'plan-end',
            data: [planEnd],
            getPosition: (d: VisitPlanPoint) => [d.lon, d.lat],
            getIcon: () => ({
              url: END_ICON_URL,
              width: 64,
              height: 80,
              anchorY: 80,
            }),
            getSize: 48,
            sizeUnits: 'pixels',
            pickable: false,
            parameters: { depthTest: false },
          })
        );
      }
    }

    deckRef.current.setProps({
      layers,
      canvas: mapRef.current.getCanvas()
    });
  }, [
    points,
    routes,
    workers,
    planningMode,
    planOrigin,
    planStops,
    planEnd,
    planLegs,
    planWorkerId,
    planStopTimes,
    planSelectedIndex,
    getWorkerColor,
  ]);

  // Volar a la visita elegida desde su tarjeta
  useEffect(() => {
    if (!focus || !deckRef.current) return;
    const current = viewStateRef.current ?? {};
    const zoom = typeof current.zoom === 'number' ? Math.max(current.zoom, 13) : 13;
    deckRef.current.setProps({
      initialViewState: {
        bearing: 0,
        pitch: 30,
        ...current,
        latitude: focus.lat,
        longitude: focus.lon,
        zoom,
        transitionDuration: 700,
        transitionInterpolator: new FlyToInterpolator(),
      },
    });
  }, [focus]);

  return (
    <div id="map" style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Backdrop
        sx={{
          color: '#fff',
          zIndex: 1000,
          backgroundColor: 'rgba(0, 0, 0, 0.7)'
        }}
        open={isLoading}
      >
        <Paper
          elevation={4}
          sx={{
            padding: '20px 40px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2
          }}
        >
          <CircularProgress color="primary" />
          <Typography variant="subtitle1">
            Cargando datos...
          </Typography>
        </Paper>
      </Backdrop>
    </div>
  );
};

export default Map;
