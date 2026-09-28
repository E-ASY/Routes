import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import Map from './components/map';
import WorkerSelector from './components/worker_selector';
import Legend from './components/legend';
import DataRefresh from './components/data_refresh';
import VisitPlanPanel from './components/visit_plan_panel';
import AppChrome from './components/app_chrome';
import AuthGuard from './components/auth/guard';
import {
  LegsResult,
  MapPoint,
  MileageByWorker,
  VisitPlanPoint,
  Worker,
  mapsService,
} from './services/map_service';
import { Box, Typography } from '@mui/material';

function formatMapPointLabel(point: MapPoint): string {
  if (point.kind === 'worker') {
    return [point.workerName, point.workerApe1, point.workerApe2].filter(Boolean).join(' ') || 'Trabajadora';
  }
  const name = [point.userName, point.userApe1, point.userApe2].filter(Boolean).join(' ');
  return name || `Usuaria ${point.userId ?? ''}`;
}

const App: React.FC = () => {
  const [workers, setWorkers] = useState<string[]>([]);
  const [points, setPoints] = useState<MapPoint[] | null>(null);
  const [routes, setRoutes] = useState<any[] | null>(null);
  const [legendWorkers, setLegendWorkers] = useState<Worker[]>([]);
  const [mileageByWorker, setMileageByWorker] = useState<MileageByWorker | null>(null);
  const [viewportLoading, setViewportLoading] = useState(false);
  const [viewportKey, setViewportKey] = useState(0);

  const [planningMode, setPlanningMode] = useState(false);
  const [planOrigin, setPlanOrigin] = useState<VisitPlanPoint | null>(null);
  const [planStops, setPlanStops] = useState<VisitPlanPoint[]>([]);
  const [planLegs, setPlanLegs] = useState<LegsResult | null>(null);
  const [legsLoading, setLegsLoading] = useState(false);
  const [legsError, setLegsError] = useState<string | null>(null);
  const planOriginRef = React.useRef<VisitPlanPoint | null>(null);
  planOriginRef.current = planOrigin;

  useEffect(() => {
    let cancelled = false;
    if (workers.length === 0) {
      setPoints(null);
      setRoutes(null);
      setLegendWorkers([]);
      setMileageByWorker(null);
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
        setMileageByWorker(data.mileage_by_worker || null);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Error al cargar viewport:', error);
        setPoints(null);
        setRoutes(null);
        setLegendWorkers([]);
        setMileageByWorker(null);
      })
      .finally(() => {
        if (!cancelled) setViewportLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [workers, viewportKey]);

  // Recalcular tramos del plan
  useEffect(() => {
    if (!planningMode || !planOrigin || planStops.length === 0) {
      setPlanLegs(null);
      setLegsError(null);
      setLegsLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLegsLoading(true);
      setLegsError(null);
      const ordered = [planOrigin, ...planStops].map((p) => ({ lat: p.lat, lon: p.lon }));
      try {
        const result = await mapsService.computeLegs(ordered);
        if (!cancelled) setPlanLegs(result);
      } catch (err) {
        if (!cancelled) {
          setPlanLegs(null);
          setLegsError(err instanceof Error ? err.message : 'Error al calcular km');
        }
      } finally {
        if (!cancelled) setLegsLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [planningMode, planOrigin, planStops]);

  const clearPlan = useCallback(() => {
    setPlanOrigin(null);
    setPlanStops([]);
    setPlanLegs(null);
    setLegsError(null);
  }, []);

  const handlePlanningModeChange = (enabled: boolean) => {
    setPlanningMode(enabled);
    if (!enabled) clearPlan();
  };

  const handlePlanPointClick = useCallback((point: MapPoint) => {
    const visit: VisitPlanPoint = {
      lat: point.lat,
      lon: point.lon,
      label: formatMapPointLabel(point),
      sourceKind: point.kind === 'worker' ? 'worker' : 'user',
      userId: point.userId,
      mapPointId: point.id,
    };

    const currentOrigin = planOriginRef.current;
    if (!currentOrigin) {
      setPlanOrigin(visit);
      return;
    }

    // Tras partida: solo usuarias como visitas
    if (point.kind === 'worker') {
      return;
    }

    const originIsSameUser =
      currentOrigin.sourceKind === 'user' &&
      currentOrigin.userId != null &&
      String(currentOrigin.userId) === String(point.userId);
    if (originIsSameUser) {
      return;
    }

    setPlanStops((prev) => {
      if (prev.some((s) => s.userId != null && String(s.userId) === String(point.userId))) {
        return prev;
      }
      if (prev.some((s) => s.lat === point.lat && s.lon === point.lon)) {
        return prev;
      }
      if (prev.length >= 14) {
        return prev;
      }
      return [...prev, visit];
    });
  }, []);

  const handlePlanMapClick = useCallback((lat: number, lon: number) => {
    if (planOriginRef.current) return;
    setPlanOrigin({
      lat,
      lon,
      label: `Mapa (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
      sourceKind: 'map',
    });
  }, []);

  return (
    <div className="App">
      <AuthGuard>
        <AppChrome
          planningActive={planningMode}
          filters={
            <Box className="AppChrome-filters" sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              <WorkerSelector selectedIds={workers} onFilterChange={setWorkers} />
            </Box>
          }
          plan={
            <VisitPlanPanel
              planningMode={planningMode}
              onPlanningModeChange={handlePlanningModeChange}
              origin={planOrigin}
              stops={planStops}
              legs={planLegs}
              legsLoading={legsLoading}
              legsError={legsError}
              onRemoveStop={(index) => setPlanStops((prev) => prev.filter((_, i) => i !== index))}
              onRemoveLast={() => setPlanStops((prev) => prev.slice(0, -1))}
              onClear={clearPlan}
              onClearOrigin={() => {
                setPlanOrigin(null);
                setPlanStops([]);
                setPlanLegs(null);
              }}
            />
          }
          legend={
            legendWorkers.length > 0 ? (
              <Legend workersInfo={legendWorkers} mileageByWorker={mileageByWorker} />
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.45 }}>
                Selecciona trabajadoras en Filtros para ver la leyenda.
              </Typography>
            )
          }
          data={
            <DataRefresh
              onRefreshed={() => {
                setViewportKey((k) => k + 1);
              }}
            />
          }
        >
          <Map
            workers={workers}
            points={points}
            routes={routes}
            isLoading={viewportLoading}
            planningMode={planningMode}
            planOrigin={planOrigin}
            planStops={planStops}
            planLegs={planLegs}
            onPlanPointClick={handlePlanPointClick}
            onPlanMapClick={handlePlanMapClick}
          />
        </AppChrome>
      </AuthGuard>
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);
