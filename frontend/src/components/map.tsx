import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { Deck } from '@deck.gl/core';
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { CircularProgress, Backdrop, Paper, Typography } from '@mui/material';

import { mapsService } from '../services/map_service';
import { MapPoint } from '../services/map_service';

interface MapProps {
  workers: string[];
  clearCache?: boolean;
}

const Map: React.FC<MapProps> = ({ workers }) => {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const deckRef = useRef<Deck | null>(null);
  const [pointsByWorker, setPointsByWorker] = useState<MapPoint[] | null>(null);
  const [routes, setRoutes] = useState<any[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Paleta de colores para trabajadores
  const WORKER_COLORS = [
    [102, 197, 204], // #66C5CC
    [246, 207, 113], // #F6CF71
    [248, 156, 116], // #F89C74
    [220, 176, 242], // #DCB0F2
    [135, 197, 95],  // #87C55F
    [158, 185, 243], // #9EB9F3
    [254, 136, 177], // #FE88B1
    [201, 219, 116], // #C9DB74
    [139, 224, 164], // #8BE0A4
    [180, 151, 231], // #B497E7
    [211, 180, 132], // #D3B484
    [179, 179, 179]  // #B3B3B3
  ];

  // Función para asignar colores a trabajadores
  const getWorkerColor = (workerId: string | number): [number, number, number] => {
    const index = workers.indexOf(String(workerId));
    return index >= 0 ? WORKER_COLORS[index % WORKER_COLORS.length] as [number, number, number] : [128, 128, 128];
  };

  // Inicializar el mapa
  useEffect(() => {
    const initializeMap = async () => {
      const INITIAL_VIEW_STATE = {
        // Coordenadas iniciales del mapa (centro de Canarias)
        latitude: 28.203178,
        longitude: -16.196414,
        zoom: 9.25,
        bearing: 0,
        pitch: 30
      };
      
      // Estilo base de MapLibre
      // Update the map style specification to match what maplibregl expects
      const MAPLIBRE_STYLE: maplibregl.StyleSpecification = {
        version: 8,
        sources: {
          'carto-voyager': {
            type: 'raster',
            tiles: ['https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'],
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
        // Adding required properties to satisfy the StyleSpecification type
        name: "Carto Voyager",
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
          layers: [],
          onViewStateChange: ({ viewState }) => {
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
  }, []);

  // Cargar datos cuando cambian los trabajadores seleccionados
  useEffect(() => {
    const updateLayers = async () => {
      if (workers.length > 0) {
        setIsLoading(true);
        try {
          console.log("Obteniendo puntos para:", workers);
          const points = await mapsService.getPoints(workers);
          console.log("Puntos recibidos:", points);
          setPointsByWorker(points);
          
          try {
            console.log("Obteniendo rutas para:", workers);
            const routesData = await mapsService.getRoutes(workers);
            console.log("Rutas recibidas:", routesData);
            setRoutes(routesData.routes);
          } catch (routeError) {
            console.error("Error al obtener rutas:", routeError);
            // Continuar sin rutas, al menos mostrar los puntos
          }
        } catch (error) {
          console.error("Error al actualizar capas:", error);
        } finally {
          setIsLoading(false);
        }
      } else {
        setPointsByWorker(null);
        setRoutes(null);
      }
    };

    updateLayers();
  }, [workers]);

  // Actualizar capas del mapa
  useEffect(() => {
    if (!deckRef.current || !mapRef.current) return;

    const layers = [];
    
    // Capa de puntos (si hay puntos disponibles)
    if (pointsByWorker && pointsByWorker.length > 0) {
      layers.push(
        new ScatterplotLayer({
          id: 'worker-points',
          data: pointsByWorker,
          getPosition: (d: MapPoint) => [d.lon, d.lat],
          getFillColor: (d: MapPoint) => {
            return getWorkerColor(d.id);
          },
          getRadius: 120,
          radiusUnits: 'meters',
          radiusMinPixels: 6,
          radiusMaxPixels: 15,
          pickable: true,
          onClick: (info) => {
            console.log('Punto seleccionado:', info.object);
          },
          updateTriggers: {
            getFillColor: workers // Actualizar colores cuando cambien los trabajadores
          }
        })
      );
    }
    
    // Capa de rutas (si hay rutas disponibles)
    if (routes && routes.length > 0) {
      console.log("Añadiendo capa de rutas con", routes.length, "rutas");
      
      layers.push(
        new PathLayer({
          id: 'worker-routes',
          data: routes,
          getPath: (d) => d.polyline,
          getColor: (d) => getWorkerColor(d.worker_id),
          getWidth: 4,
          widthUnits: 'meters',
          widthMinPixels: 2,
          pickable: true,
          onClick: (info) => {
            console.log('Ruta seleccionada:', info.object);
          },
          updateTriggers: {
            getColor: workers
          }
        })
      );
    }
    
    deckRef.current.setProps({
      layers,
      canvas: mapRef.current.getCanvas()
    });
  }, [pointsByWorker, routes, workers]);

return (
    <div id="map" style={{ width: '100%', height: '100vh', position: 'relative' }}>
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