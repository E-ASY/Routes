import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { Deck } from '@deck.gl/core';
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { CircularProgress, Backdrop, Paper, Typography } from '@mui/material';

import { MapPoint } from '../services/map_service';

interface MapProps {
  workers: string[];
  points: MapPoint[] | null;
  routes: any[] | null;
  isLoading?: boolean;
}

const Map: React.FC<MapProps> = ({ workers, points, routes, isLoading = false }) => {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const deckRef = useRef<Deck | null>(null);

  const WORKER_COLORS = [
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
    [179, 179, 179]
  ];

  const getWorkerColor = (workerId: string | number): [number, number, number] => {
    const index = workers.indexOf(String(workerId));
    return index >= 0
      ? WORKER_COLORS[index % WORKER_COLORS.length] as [number, number, number]
      : [128, 128, 128];
  };

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

  useEffect(() => {
    if (!deckRef.current || !mapRef.current) return;

    const layers = [];

    if (points && points.length > 0) {
      layers.push(
        new ScatterplotLayer({
          id: 'worker-points',
          data: points,
          getPosition: (d: MapPoint) => [d.lon, d.lat],
          getFillColor: (d: MapPoint) => getWorkerColor(d.id),
          getRadius: 120,
          radiusUnits: 'meters',
          radiusMinPixels: 6,
          radiusMaxPixels: 15,
          pickable: true,
          onClick: () => {},
          updateTriggers: {
            getFillColor: workers
          }
        })
      );
    }

    if (routes && routes.length > 0) {
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
          onClick: () => {},
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
  }, [points, routes, workers]);

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
