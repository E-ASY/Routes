import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import Map from './components/map';
import WorkerSelector from './components/worker_selector';
import MunicipalitySelector from './components/municipality_selector';
import Legend from './components/legend';
import AuthGuard from './components/auth/guard';
import { mapsService, MapPoint, Worker } from './services/map_service';

const App: React.FC = () => {
  const [municipalities, setMunicipalities] = useState<string[]>([]);
  const [workers, setWorkers] = useState<string[]>([]);
  const [points, setPoints] = useState<MapPoint[] | null>(null);
  const [routes, setRoutes] = useState<any[] | null>(null);
  const [legendWorkers, setLegendWorkers] = useState<Worker[]>([]);
  const [viewportLoading, setViewportLoading] = useState(false);

  // PERF-006: una sola petición para mapa + leyenda
  useEffect(() => {
    let cancelled = false;
    if (workers.length === 0) {
      setPoints(null);
      setRoutes(null);
      setLegendWorkers([]);
      setViewportLoading(false);
      return;
    }

    setViewportLoading(true);
    mapsService
      .getViewport(workers)
      .then((data) => {
        if (cancelled) return;
        setPoints(data.points);
        setRoutes(data.routes);
        setLegendWorkers(data.workers);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Error al cargar viewport:', error);
        setPoints(null);
        setRoutes(null);
        setLegendWorkers([]);
      })
      .finally(() => {
        if (!cancelled) setViewportLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [workers]);

  return (
    <div className="App">
      <AuthGuard>
        <MunicipalitySelector
          onFilterChange={setMunicipalities}
        />
        <WorkerSelector
          onFilterChange={setWorkers}
          municipalities={municipalities}
        />
        <Legend workersInfo={legendWorkers} />
        <Map
          workers={workers}
          points={points}
          routes={routes}
          isLoading={viewportLoading}
        />
      </AuthGuard>
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);
