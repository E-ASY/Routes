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
  PlanFinish,
  PlanOptimization,
  VisitPlanPoint,
  Worker,
  mapsService,
} from './services/map_service';
import { Box, Typography } from '@mui/material';

function formatWorkerName(point: MapPoint): string {
  return [point.workerName, point.workerApe1, point.workerApe2].filter(Boolean).join(' ') || 'Trabajadora';
}

function formatMapPointLabel(point: MapPoint): string {
  if (point.kind === 'worker') {
    return formatWorkerName(point);
  }
  const name = [point.userName, point.userApe1, point.userApe2].filter(Boolean).join(' ');
  return name || `Usuaria ${point.userId ?? ''}`;
}

/** Plan guardado de una trabajadora mientras se planifica a otra */
interface SavedPlan {
  origin: VisitPlanPoint | null;
  stops: VisitPlanPoint[];
  end: VisitPlanPoint | null;
  finish: PlanFinish;
}

function formatWorkerFullName(worker: Worker): string {
  return [worker.name, worker.ape_1, worker.ape_2].filter(Boolean).join(' ') || `Trabajadora ${worker.id}`;
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
  // Por defecto la trabajadora vuelve a la partida al terminar (circuito): cuenta el tramo de vuelta.
  // Con 'custom' acaba en otro sitio (planEnd), que no se reordena al optimizar.
  const [planFinish, setPlanFinish] = useState<PlanFinish>('start');
  const [planEnd, setPlanEnd] = useState<VisitPlanPoint | null>(null);
  const planReturnToStart = planFinish === 'start';
  const activeEnd = planFinish === 'custom' ? planEnd : null;
  // Con 'custom', la llegada se elige al final: tras la primera visita, tocar el mapa o la
  // trabajadora fija la llegada y volver a tocar la mueve (las usuarias siguen siendo visitas)
  const endEditable = planningMode && planFinish === 'custom' && planOrigin != null && planStops.length > 0;
  const [optimizeLoading, setOptimizeLoading] = useState(false);
  const [optimizeError, setOptimizeError] = useState<string | null>(null);
  const [optimization, setOptimization] = useState<PlanOptimization | null>(null);
  const planOriginRef = React.useRef<VisitPlanPoint | null>(null);
  planOriginRef.current = planOrigin;
  const planEndRef = React.useRef<VisitPlanPoint | null>(null);
  planEndRef.current = activeEnd;
  const endEditableRef = React.useRef(false);
  endEditableRef.current = endEditable;
  // La partida se puede mover hasta tocar la primera usuaria (visita 1)
  const originEditable = planOrigin != null && planStops.length === 0;
  const originEditableRef = React.useRef(false);
  originEditableRef.current = originEditable;
  // Se planifica a una trabajadora cada vez; los planes de las demás seleccionadas se guardan
  const [planWorkerId, setPlanWorkerId] = useState<string | null>(null);
  const [savedPlans, setSavedPlans] = useState<Record<string, SavedPlan>>({});
  const planWorker = legendWorkers.find((w) => String(w.id) === planWorkerId) ?? null;
  const planWorkerLabel = planWorker ? formatWorkerFullName(planWorker) : null;
  const planWorkerIdRef = React.useRef<string | null>(null);
  planWorkerIdRef.current = planWorkerId;
  const planWorkerLabelRef = React.useRef<string | null>(null);
  planWorkerLabelRef.current = planWorkerLabel;
  const pointsRef = React.useRef<MapPoint[] | null>(null);
  pointsRef.current = points;
  const [planNotice, setPlanNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!planNotice) return;
    const timer = window.setTimeout(() => setPlanNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [planNotice]);

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
      const ordered = [planOrigin, ...planStops, ...(activeEnd ? [activeEnd] : [])].map((p) => ({
        lat: p.lat,
        lon: p.lon,
      }));
      try {
        const result = await mapsService.computeLegs(ordered, planReturnToStart);
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
  }, [planningMode, planOrigin, planStops, planReturnToStart, activeEnd]);

  // PERF-013: reordena las visitas (partida y llegada fijas) y guarda los km Google previos
  // para mostrar "Antes → Ahora" cuando /legs recalcule el nuevo orden.
  const handleOptimizeOrder = useCallback(async () => {
    if (!planOrigin || planStops.length < 2) return;
    setOptimizeLoading(true);
    setOptimizeError(null);
    try {
      const points = [planOrigin, ...planStops, ...(activeEnd ? [activeEnd] : [])].map((p) => ({
        lat: p.lat,
        lon: p.lon,
      }));
      const result = await mapsService.optimizeOrder(points, {
        returnToStart: planReturnToStart,
        endAtLast: activeEnd != null,
      });
      // Quitar partida (primero) y llegada (último) del orden: solo se reordenan las visitas
      const visitOrder = result.order.slice(1, activeEnd ? -1 : undefined);
      const reordered = result.changed ? visitOrder.map((i) => planStops[i - 1]) : planStops;
      // Solo comparar con km Google ya calculados para este mismo orden y modo
      const legsMatchCurrent =
        !legsLoading &&
        planLegs != null &&
        planLegs.points_count === points.length &&
        Boolean(planLegs.return_to_start) === planReturnToStart;
      setOptimization({
        stops: reordered,
        finish: planFinish,
        end: activeEnd,
        changed: result.changed,
        kmBefore: legsMatchCurrent ? planLegs.total_distance_km : null,
        straightKmBefore: result.straight_km_before,
        straightKmAfter: result.straight_km_after,
      });
      if (result.changed) setPlanStops(reordered);
    } catch (err) {
      setOptimizeError(err instanceof Error ? err.message : 'Error al optimizar el orden');
    } finally {
      setOptimizeLoading(false);
    }
  }, [planOrigin, planStops, planLegs, legsLoading, planReturnToStart, planFinish, activeEnd]);

  const clearPlan = useCallback(() => {
    setPlanOrigin(null);
    setPlanStops([]);
    setPlanEnd(null);
    setPlanLegs(null);
    setLegsError(null);
    setOptimization(null);
    setOptimizeError(null);
    setPlanNotice(null);
  }, []);

  /** Activa el plan de otra trabajadora; guarda el actual si su trabajadora sigue seleccionada */
  const activatePlanWorker = useCallback(
    (nextId: string | null, { saveCurrent = true }: { saveCurrent?: boolean } = {}) => {
      if (nextId === planWorkerId) return;
      const current: SavedPlan = { origin: planOrigin, stops: planStops, end: planEnd, finish: planFinish };
      const hasContent = current.origin != null || current.stops.length > 0 || current.end != null;
      const next = nextId != null ? savedPlans[nextId] : undefined;
      setSavedPlans((prev) => {
        const updated = { ...prev };
        if (planWorkerId != null) {
          if (saveCurrent && hasContent) updated[planWorkerId] = current;
          else delete updated[planWorkerId];
        }
        if (nextId != null) delete updated[nextId];
        return updated;
      });
      clearPlan();
      setPlanOrigin(next?.origin ?? null);
      setPlanStops(next?.stops ?? []);
      setPlanEnd(next?.end ?? null);
      setPlanFinish(next?.finish ?? 'start');
      setPlanWorkerId(nextId);
    },
    [planWorkerId, planOrigin, planStops, planEnd, planFinish, savedPlans, clearPlan]
  );

  // Selección de trabajadoras cambiada: descartar planes de las quitadas y, si solo queda una, elegirla
  useEffect(() => {
    const selected = new Set(workers.map(String));
    setSavedPlans((prev) => {
      const kept = Object.fromEntries(Object.entries(prev).filter(([id]) => selected.has(id)));
      return Object.keys(kept).length === Object.keys(prev).length ? prev : kept;
    });
    const activeRemoved = planWorkerId != null && !selected.has(planWorkerId);
    if (activeRemoved || planWorkerId == null) {
      const fallback = workers.length === 1 ? String(workers[0]) : null;
      if (fallback !== planWorkerId) activatePlanWorker(fallback, { saveCurrent: false });
    }
  }, [workers, planWorkerId, activatePlanWorker]);

  // Desactivar el modo solo oculta los planes; se conservan al volver a activarlo
  const handlePlanningModeChange = (enabled: boolean) => {
    setPlanningMode(enabled);
    setPlanNotice(null);
  };

  const handlePlanPointClick = useCallback((point: MapPoint) => {
    if (planWorkerIdRef.current == null) {
      setPlanNotice('Elige primero a qué trabajadora planificar.');
      return;
    }
    const visit: VisitPlanPoint = {
      lat: point.lat,
      lon: point.lon,
      label: formatMapPointLabel(point),
      sourceKind: point.kind === 'worker' ? 'worker' : 'user',
      userId: point.userId,
      mapPointId: point.id,
      workerId: point.id,
    };

    const currentOrigin = planOriginRef.current;
    if (!currentOrigin) {
      setPlanOrigin(visit);
      return;
    }

    const pointKind = point.kind === 'worker' ? 'worker' : 'user';
    const isSamePlace = (a: VisitPlanPoint) =>
      (a.sourceKind === pointKind && a.userId != null && String(a.userId) === String(point.userId)) ||
      (a.lat === point.lat && a.lon === point.lon);

    // Tras partida: solo usuarias como visitas. La trabajadora mueve la partida si aún no hay
    // visitas, o fija/mueve la llegada si ya las hay (con "Otro sitio")
    if (point.kind === 'worker') {
      if (isSamePlace(currentOrigin)) return;
      if (originEditableRef.current) setPlanOrigin(visit);
      else if (endEditableRef.current) setPlanEnd(visit);
      return;
    }

    const originIsSameUser =
      currentOrigin.sourceKind === 'user' &&
      currentOrigin.userId != null &&
      String(currentOrigin.userId) === String(point.userId);
    if (originIsSameUser) {
      return;
    }
    const currentEnd = planEndRef.current;
    if (currentEnd && isSamePlace(currentEnd)) {
      return;
    }

    // Usuaria de otra trabajadora: vale si también la atiende la de la ruta (puntos superpuestos)
    let stop = visit;
    const lockedWorker = planWorkerIdRef.current;
    if (lockedWorker != null && String(point.id) !== String(lockedWorker)) {
      const ownCopy = pointsRef.current?.find(
        (p) =>
          p.kind !== 'worker' &&
          String(p.id) === String(lockedWorker) &&
          String(p.userId) === String(point.userId)
      );
      if (!ownCopy) {
        setPlanNotice(
          `${visit.label} no es usuaria de ${planWorkerLabelRef.current ?? 'la trabajadora de esta ruta'}. ` +
            'Cambia de trabajadora en "Planificar a" para añadirla a su ruta.'
        );
        return;
      }
      stop = { ...visit, workerId: ownCopy.id };
    }
    setPlanNotice(null);

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
      return [...prev, stop];
    });
  }, []);

  const handlePlanMapClick = useCallback((lat: number, lon: number) => {
    const mapPoint: VisitPlanPoint = {
      lat,
      lon,
      label: `Mapa (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
      sourceKind: 'map',
    };
    if (planWorkerIdRef.current == null) {
      setPlanNotice('Elige primero a qué trabajadora planificar.');
      return;
    }
    if (!planOriginRef.current || originEditableRef.current) {
      setPlanOrigin(mapPoint);
    } else if (endEditableRef.current) {
      setPlanEnd(mapPoint);
    }
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
              finish={planFinish}
              onFinishChange={setPlanFinish}
              end={activeEnd}
              endEditable={endEditable}
              originEditable={originEditable}
              planWorkerLabel={planWorkerLabel}
              planWorkerId={planWorkerId}
              workerOptions={legendWorkers
                .filter((w) => workers.includes(String(w.id)))
                .map((w) => ({
                  id: String(w.id),
                  label: formatWorkerFullName(w),
                  stopsCount:
                    String(w.id) === planWorkerId
                      ? planStops.length
                      : savedPlans[String(w.id)]?.stops.length ?? 0,
                }))}
              onPlanWorkerChange={(id) => activatePlanWorker(id)}
              notice={planNotice}
              onClearEnd={() => setPlanEnd(null)}
              // Solo vale mientras las visitas sigan en el orden optimizado y con el mismo final
              optimization={
                optimization?.stops === planStops &&
                optimization.finish === planFinish &&
                optimization.end === activeEnd
                  ? optimization
                  : null
              }
              optimizeLoading={optimizeLoading}
              optimizeError={optimizeError}
              onOptimize={handleOptimizeOrder}
              onRemoveStop={(index) => setPlanStops((prev) => prev.filter((_, i) => i !== index))}
              onRemoveLast={() => setPlanStops((prev) => prev.slice(0, -1))}
              onClear={clearPlan}
              onClearOrigin={() => {
                setPlanOrigin(null);
                setPlanStops([]);
                setPlanEnd(null);
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
            planEnd={activeEnd}
            planWorkerId={planWorkerId}
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
