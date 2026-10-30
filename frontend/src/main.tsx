import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import Map from './components/map';
import WorkerSelector from './components/worker_selector';
import Legend from './components/legend';
import DataRefresh from './components/data_refresh';
import VisitPlanPanel, { PlanSchedule } from './components/visit_plan_panel';
import AppChrome, { ChromeSheet } from './components/app_chrome';
import ErrorBoundary from './components/error_boundary';
import MapStrip from './components/map_strip';
import AuthGuard from './components/auth/guard';
import {
  LegsResult,
  MapPoint,
  MileageByWorker,
  PlanFinish,
  ManualScheduleResult,
  ScheduleGoal,
  ScheduleResult,
  TimeRange,
  VisitPlanPoint,
  Worker,
  mapsService,
} from './services/map_service';
import { formatMinutes, isValidRange } from './services/time_ranges';
import { planHint } from './services/plan_hint';
import { moveItem, optionMatchesOrder, sameVisits, stopKey } from './services/plan_order';
import { formatPersonName } from './services/person_name';
import {
  SavedPlan,
  loadAvailability,
  loadDurations,
  loadDayDraft,
  saveAvailability,
  saveDurations,
  saveDayDraft,
} from './services/plan_storage';
import { Box, Button, Snackbar, Typography } from '@mui/material';

function formatWorkerName(point: MapPoint): string {
  return formatPersonName(point.workerName, point.workerApe1, point.workerApe2) || 'Trabajadora';
}

function formatMapPointLabel(point: MapPoint): string {
  if (point.kind === 'worker') {
    return formatWorkerName(point);
  }
  const name = formatPersonName(point.userName, point.userApe1, point.userApe2);
  return name || `Usuaria ${point.userId ?? ''}`;
}

/** Jornada por defecto: 08:00–15:00 (minutos desde medianoche) */
const DEFAULT_SHIFT: TimeRange = { start: 8 * 60, end: 15 * 60 };
/** Duración de la visita si no se ha puesto otra para esa usuaria */
const VISIT_MINUTES = 60;

/** Última vez que se pulsó "Organizar horario" y la opción elegida */
interface ScheduleRun {
  result: ScheduleResult;
  /** Visitas enviadas: los índices del resultado se refieren a esta lista */
  stops: VisitPlanPoint[];
  finish: PlanFinish;
  end: VisitPlanPoint | null;
  shift: TimeRange;
  /** Franjas enviadas (JSON) para saber si se han editado después */
  windowsKey: string;
  selected: number | null;
  /** Visitas tal como quedaron al aplicar la opción elegida */
  appliedStops: VisitPlanPoint[] | null;
  /** "Tu orden": el último orden puesto a mano, con las mismas visitas que `stops` */
  ownStops: VisitPlanPoint[];
  /** Horario de `ownStops`; null si no se pudo calcular */
  own: ManualScheduleResult | null;
}

function formatWorkerFullName(worker: Worker): string {
  return formatPersonName(worker.name, worker.ape_1, worker.ape_2) || `Trabajadora ${worker.id}`;
}

const App: React.FC = () => {
  // Plan de hoy guardado en el navegador (por si el móvil cerró la pestaña)
  const [initialDraft] = useState(loadDayDraft);
  const [workers, setWorkers] = useState<string[]>(initialDraft?.workers ?? []);
  const [points, setPoints] = useState<MapPoint[] | null>(null);
  const [routes, setRoutes] = useState<any[] | null>(null);
  const [legendWorkers, setLegendWorkers] = useState<Worker[]>([]);
  const [mileageByWorker, setMileageByWorker] = useState<MileageByWorker | null>(null);
  const [viewportLoading, setViewportLoading] = useState(false);
  const [viewportKey, setViewportKey] = useState(0);

  const [planningMode, setPlanningMode] = useState(initialDraft?.planningMode ?? false);
  const [planOrigin, setPlanOrigin] = useState<VisitPlanPoint | null>(initialDraft?.current.origin ?? null);
  const [planStops, setPlanStops] = useState<VisitPlanPoint[]>(initialDraft?.current.stops ?? []);
  const planStopsRef = React.useRef<VisitPlanPoint[]>(planStops);
  planStopsRef.current = planStops;
  // "Tu orden": el último orden de visitas puesto a mano (no el de aplicar una opción)
  const [ownStops, setOwnStops] = useState<VisitPlanPoint[]>(initialDraft?.ownStops ?? planStops);
  const [initialAppliedOrders] = useState(() => {
    // Plan recuperado con una opción aplicada: su orden no es el de la trabajadora
    const applied = new WeakSet<VisitPlanPoint[]>();
    if (initialDraft?.ownStops) applied.add(planStops);
    return applied;
  });
  const appliedOrdersRef = React.useRef(initialAppliedOrders);
  useEffect(() => {
    if (!appliedOrdersRef.current.has(planStops)) setOwnStops(planStops);
  }, [planStops]);
  const [planLegs, setPlanLegs] = useState<LegsResult | null>(null);
  const [legsLoading, setLegsLoading] = useState(false);
  const [legsError, setLegsError] = useState<string | null>(null);
  // Por defecto la trabajadora vuelve a la partida al terminar (circuito): cuenta el tramo de vuelta.
  // Con 'custom' acaba en otro sitio (planEnd), que no se reordena al organizar.
  const [planFinish, setPlanFinish] = useState<PlanFinish>(initialDraft?.current.finish ?? 'start');
  const [planEnd, setPlanEnd] = useState<VisitPlanPoint | null>(initialDraft?.current.end ?? null);
  const planReturnToStart = planFinish === 'start';
  const activeEnd = planFinish === 'custom' ? planEnd : null;
  // Con 'custom', la llegada se elige al final: tras la primera visita, tocar el mapa o la
  // trabajadora fija la llegada y volver a tocar la mueve (las usuarias siguen siendo visitas)
  const endEditable = planningMode && planFinish === 'custom' && planOrigin != null && planStops.length > 0;
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
  const [planWorkerId, setPlanWorkerId] = useState<string | null>(initialDraft?.planWorkerId ?? null);
  const [savedPlans, setSavedPlans] = useState<Record<string, SavedPlan>>(initialDraft?.savedPlans ?? {});
  const planWorker = legendWorkers.find((w) => String(w.id) === planWorkerId) ?? null;
  const planWorkerLabel = planWorker ? formatWorkerFullName(planWorker) : null;
  const planWorkerIdRef = React.useRef<string | null>(null);
  planWorkerIdRef.current = planWorkerId;
  const planWorkerLabelRef = React.useRef<string | null>(null);
  planWorkerLabelRef.current = planWorkerLabel;
  const pointsRef = React.useRef<MapPoint[] | null>(null);
  pointsRef.current = points;
  const [planNotice, setPlanNotice] = useState<string | null>(null);
  // Panel abierto (controlado aquí para poder abrirlo o cerrarlo desde el plan y la franja)
  const [sheet, setSheet] = useState<ChromeSheet>(null);
  // Visita resaltada en el mapa y en la agenda (tocada en el mapa o en su tarjeta)
  const [selectedStopKey, setSelectedStopKey] = useState<string | null>(null);
  const [mapFocus, setMapFocus] = useState<{ lat: number; lon: number; nonce: number } | null>(null);
  const [cardScrollNonce, setCardScrollNonce] = useState(0);

  // PERF-013: horario del día. La disponibilidad es de la usuaria (vale para cualquier trabajadora)
  const [planShift, setPlanShift] = useState<TimeRange>(initialDraft?.current.shift ?? DEFAULT_SHIFT);
  const [availability, setAvailability] = useState<Record<string, TimeRange[]>>(loadAvailability);
  const [postponed, setPostponed] = useState<VisitPlanPoint[]>(initialDraft?.current.postponed ?? []);
  const [scheduleRun, setScheduleRun] = useState<ScheduleRun | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const rangesFor = useCallback(
    (stops: VisitPlanPoint[]) => stops.map((stop) => availability[stopKey(stop)] ?? []),
    [availability]
  );
  // Duración de la visita de cada usuaria (se mantiene de un día para otro, como sus franjas)
  const [durations, setDurations] = useState<Record<string, number>>(loadDurations);
  const durationsFor = useCallback(
    (stops: VisitPlanPoint[]) => stops.map((stop) => durations[stopKey(stop)] ?? VISIT_MINUTES),
    [durations]
  );
  // Hora fija elegida a mano para una usuaria (manda sobre sus franjas)
  const [fixedStarts, setFixedStarts] = useState<Record<string, number>>(initialDraft?.fixedStarts ?? {});
  const fixedFor = useCallback(
    (stops: VisitPlanPoint[]) => stops.map((stop) => fixedStarts[stopKey(stop)] ?? null),
    [fixedStarts]
  );
  // Criterio de la última opción elegida; se usa al recalcular un orden cambiado a mano
  const [scheduleGoal, setScheduleGoal] = useState<ScheduleGoal>('finish');
  const [manualSchedule, setManualSchedule] = useState<{ key: string; result: ManualScheduleResult } | null>(
    null
  );
  const [manualLoading, setManualLoading] = useState(false);
  // Plan recuperado que ya estaba organizado: recalcular sus horas sin volver a pulsar Organizar
  const [resumeTimes, setResumeTimes] = useState(initialDraft?.scheduled ?? false);

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

  const handleSchedule = useCallback(async () => {
    if (!planOrigin || planStops.length === 0) return;
    if (planFinish === 'custom' && !activeEnd) return;
    const stops = planStops;
    const windows = rangesFor(stops);
    const fixed = fixedFor(stops);
    const minutes = durationsFor(stops);
    // Si se aplicó una opción, "Tu orden" sigue siendo el que puso la trabajadora
    const ownOrder = sameVisits(ownStops, stops) ? ownStops : stops;
    setScheduleLoading(true);
    setScheduleError(null);
    try {
      const toPoints = (visits: VisitPlanPoint[]) =>
        [planOrigin, ...visits, ...(activeEnd ? [activeEnd] : [])].map((p) => ({ lat: p.lat, lon: p.lon }));
      const request = { finish: planFinish, shift: planShift };
      // A la vez, el horario de "Tu orden" para poder compararlo y volver a él
      const [result, own] = await Promise.all([
        mapsService.scheduleVisits(toPoints(stops), { ...request, windows, fixedStarts: fixed, serviceMinutes: minutes }),
        mapsService
          .evaluateSchedule(toPoints(ownOrder), {
            ...request,
            windows: rangesFor(ownOrder),
            fixedStarts: fixedFor(ownOrder),
            serviceMinutes: durationsFor(ownOrder),
            goal: scheduleGoal,
          })
          .catch(() => null),
      ]);
      setScheduleRun({
        result,
        stops,
        finish: planFinish,
        end: activeEnd,
        shift: planShift,
        windowsKey: JSON.stringify([windows, fixed, minutes]),
        selected: null,
        appliedStops: null,
        ownStops: ownOrder,
        own,
      });
    } catch (err) {
      setScheduleRun(null);
      setScheduleError(err instanceof Error ? err.message : 'Error al organizar el horario');
    } finally {
      setScheduleLoading(false);
    }
  }, [
    planOrigin,
    planStops,
    ownStops,
    planFinish,
    activeEnd,
    planShift,
    rangesFor,
    fixedFor,
    durationsFor,
    scheduleGoal,
  ]);

  // El resultado solo vale con las mismas visitas (antes o después de aplicarlo), final, jornada,
  // franjas, horas fijas y duraciones
  const scheduleFresh =
    scheduleRun != null &&
    (planStops === scheduleRun.stops ||
      planStops === scheduleRun.appliedStops ||
      planStops === scheduleRun.ownStops) &&
    scheduleRun.finish === planFinish &&
    scheduleRun.end === activeEnd &&
    scheduleRun.shift === planShift &&
    scheduleRun.windowsKey ===
      JSON.stringify([rangesFor(scheduleRun.stops), fixedFor(scheduleRun.stops), durationsFor(scheduleRun.stops)]);
  const freshRun = scheduleFresh ? scheduleRun : null;
  const appliedOption =
    freshRun && freshRun.selected != null && planStops === freshRun.appliedStops
      ? freshRun.result.options[freshRun.selected]
      : null;
  const shownOption = freshRun ? freshRun.result.options[freshRun.selected ?? 0] : undefined;
  // "Tu orden": si coincide con una opción, se marca esa opción en vez de repetirla
  const ownMatchIndex = freshRun
    ? freshRun.result.options.findIndex((option) => optionMatchesOrder(option, freshRun.stops, freshRun.ownStops))
    : -1;
  const onOwnOrder = freshRun != null && planStops === freshRun.ownStops;

  /** Aplica una opción: reordena las visitas y aparta para otro día las que no caben */
  const handleSelectScheduleOption = useCallback(
    (index: number) => {
      const run = scheduleRun;
      const option = run?.result.options[index];
      if (!run || !option) return;
      const applied = option.order.map((i) => run.stops[i]);
      const left = option.unscheduled.map((u) => run.stops[u.visit]);
      // No es un orden puesto a mano: "Tu orden" no cambia
      appliedOrdersRef.current.add(applied);
      setPlanStops(applied);
      setPostponed((prev) => [...prev.filter((p) => !run.stops.includes(p)), ...left]);
      setScheduleRun({ ...run, selected: index, appliedStops: applied });
      setScheduleGoal(option.goals[0]);
    },
    [scheduleRun]
  );

  /** Vuelve a "Tu orden"; las visitas que apartó la opción vuelven a la ruta */
  const handleSelectOwnOrder = useCallback(() => {
    const run = scheduleRun;
    if (!run) return;
    setPlanStops(run.ownStops);
    setPostponed((prev) => prev.filter((p) => !run.stops.includes(p)));
    setScheduleRun({ ...run, selected: null, appliedStops: null });
  }, [scheduleRun]);

  // Cambios a mano (orden u horas fijas): recalcular el horario de ese orden, con conflictos.
  // Solo si ya se organizó el horario o hay alguna hora fija, para no gastar llamadas a Google.
  const manualWindows = rangesFor(planStops);
  const manualFixed = fixedFor(planStops);
  const manualDurations = durationsFor(planStops);
  const manualInputsValid =
    isValidRange(planShift) && manualWindows.every((ranges) => ranges.every(isValidRange));
  const manualEnabled =
    planningMode &&
    planOrigin != null &&
    planStops.length > 0 &&
    !(planFinish === 'custom' && !activeEnd) &&
    manualInputsValid &&
    (scheduleRun != null || resumeTimes || manualFixed.some((t) => t != null));
  const manualKey = manualEnabled
    ? JSON.stringify([
        [planOrigin, ...planStops, ...(activeEnd ? [activeEnd] : [])].map((p) => [p?.lat, p?.lon]),
        planFinish,
        planShift,
        manualWindows,
        manualFixed,
        manualDurations,
        scheduleGoal,
      ])
    : null;

  useEffect(() => {
    if (!manualKey || !planOrigin) {
      setManualLoading(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setManualLoading(true);
      try {
        const points = [planOrigin, ...planStops, ...(activeEnd ? [activeEnd] : [])].map((p) => ({
          lat: p.lat,
          lon: p.lon,
        }));
        const result = await mapsService.evaluateSchedule(points, {
          finish: planFinish,
          shift: planShift,
          windows: manualWindows,
          fixedStarts: manualFixed,
          serviceMinutes: manualDurations,
          goal: scheduleGoal,
        });
        if (!cancelled) setManualSchedule({ key: manualKey, result });
      } catch (err) {
        if (!cancelled) {
          setManualSchedule(null);
          setScheduleError(err instanceof Error ? err.message : 'Error al calcular el horario');
        }
      } finally {
        if (!cancelled) setManualLoading(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // manualKey resume todas las entradas; las demás dependencias van dentro de él
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualKey]);

  const manualResult = manualSchedule && manualSchedule.key === manualKey ? manualSchedule.result : null;

  /** Arrastrar en la agenda: lleva la visita de `from` a la posición `to` */
  const handleReorderStop = useCallback((from: number, to: number) => {
    setPlanStops((prev) => moveItem(prev, from, to));
  }, []);

  /** Mueve una visita arriba (−1) o abajo (+1) en el orden */
  const handleMoveStop = useCallback((index: number, delta: number) => {
    setPlanStops((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const handleRestorePostponed = useCallback(
    (index: number) => {
      const stop = postponed[index];
      if (!stop) return;
      setPostponed((prev) => prev.filter((_, i) => i !== index));
      setPlanStops((prev) =>
        prev.length >= 14 || prev.some((s) => stopKey(s) === stopKey(stop)) ? prev : [...prev, stop]
      );
    },
    [postponed]
  );

  const clearPlan = useCallback(() => {
    setPlanOrigin(null);
    setPlanStops([]);
    setPlanEnd(null);
    setPlanLegs(null);
    setLegsError(null);
    setPlanNotice(null);
    setPostponed([]);
    setScheduleRun(null);
    setResumeTimes(false);
    setScheduleError(null);
  }, []);

  // Guardar el plan en el navegador tras cada cambio
  useEffect(() => {
    saveDayDraft({
      workers,
      planningMode,
      planWorkerId,
      current: {
        origin: planOrigin,
        stops: planStops,
        end: planEnd,
        finish: planFinish,
        shift: planShift,
        postponed,
      },
      savedPlans,
      fixedStarts,
      ownStops: ownStops !== planStops ? ownStops : undefined,
      scheduled: scheduleRun != null || resumeTimes,
    });
  }, [
    workers,
    planningMode,
    planWorkerId,
    planOrigin,
    planStops,
    planEnd,
    planFinish,
    planShift,
    postponed,
    savedPlans,
    fixedStarts,
    scheduleRun,
    resumeTimes,
    ownStops,
  ]);
  useEffect(() => saveAvailability(availability), [availability]);
  useEffect(() => saveDurations(durations), [durations]);

  // "Limpiar" y quitar una visita se pueden deshacer durante unos segundos
  const [undo, setUndo] = useState<{ message: string; restore: () => void } | null>(null);
  const clearPlanWithUndo = useCallback(() => {
    const before = {
      origin: planOrigin,
      stops: planStops,
      end: planEnd,
      finish: planFinish,
      shift: planShift,
      postponed,
      run: scheduleRun,
      resume: resumeTimes,
    };
    setUndo({
      message: 'Plan borrado',
      restore: () => {
        setPlanOrigin(before.origin);
        setPlanStops(before.stops);
        setPlanEnd(before.end);
        setPlanFinish(before.finish);
        setPlanShift(before.shift);
        setPostponed(before.postponed);
        setScheduleRun(before.run);
        setResumeTimes(before.resume);
      },
    });
    clearPlan();
  }, [planOrigin, planStops, planEnd, planFinish, planShift, postponed, scheduleRun, resumeTimes, clearPlan]);

  const handleRemoveStop = useCallback(
    (index: number) => {
      const stop = planStops[index];
      if (!stop) return;
      const before = planStops;
      const after = planStops.filter((_, i) => i !== index);
      setPlanStops(after);
      setUndo({
        message: `${stop.label} quitada de la ruta`,
        // Sin otros cambios se recupera la lista tal cual (y sigue valiendo el horario organizado)
        restore: () =>
          setPlanStops((prev) => {
            if (prev === after) return before;
            if (prev.length >= 14 || prev.some((s) => stopKey(s) === stopKey(stop))) return prev;
            const next = prev.slice();
            next.splice(Math.min(index, next.length), 0, stop);
            return next;
          }),
      });
    },
    [planStops]
  );

  /** Activa el plan de otra trabajadora; guarda el actual si su trabajadora sigue seleccionada */
  const activatePlanWorker = useCallback(
    (nextId: string | null, { saveCurrent = true }: { saveCurrent?: boolean } = {}) => {
      if (nextId === planWorkerId) return;
      setUndo(null);
      const current: SavedPlan = {
        origin: planOrigin,
        stops: planStops,
        end: planEnd,
        finish: planFinish,
        shift: planShift,
        postponed,
      };
      const hasContent =
        current.origin != null ||
        current.stops.length > 0 ||
        current.end != null ||
        current.postponed.length > 0 ||
        current.shift.start !== DEFAULT_SHIFT.start ||
        current.shift.end !== DEFAULT_SHIFT.end;
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
      setPlanShift(next?.shift ?? DEFAULT_SHIFT);
      setPostponed(next?.postponed ?? []);
      setPlanWorkerId(nextId);
    },
    [planWorkerId, planOrigin, planStops, planEnd, planFinish, planShift, postponed, savedPlans, clearPlan]
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
    if (!enabled) setSelectedStopKey(null);
  };

  // Abrir Plan con trabajadoras elegidas activa la planificación (el interruptor sirve para salir)
  const handleSheetChange = (next: ChromeSheet) => {
    if (next === 'plan' && !planningMode && workers.length > 0) handlePlanningModeChange(true);
    setSheet(next);
  };

  /** Tarjeta de la agenda → cerrar el panel, centrar el mapa en la visita y resaltarla */
  const handleLocateStop = (index: number) => {
    const stop = planStops[index];
    if (!stop) return;
    setSelectedStopKey(stopKey(stop));
    setMapFocus({ lat: stop.lat, lon: stop.lon, nonce: Date.now() });
    setSheet(null);
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
    // Ya está en la ruta: se resalta y la franja ofrece quitarla o ver su tarjeta
    const existing = planStopsRef.current.find(
      (s) => s.userId != null && String(s.userId) === String(point.userId)
    );
    if (existing) {
      setSelectedStopKey(stopKey(existing));
      return;
    }
    setSelectedStopKey(null);
    // Si estaba apartada para otro día, vuelve a la ruta
    setPostponed((prev) => {
      const kept = prev.filter((p) => p.userId == null || String(p.userId) !== String(point.userId));
      return kept.length === prev.length ? prev : kept;
    });

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
    setSelectedStopKey(null);
    if (!planOriginRef.current || originEditableRef.current) {
      setPlanOrigin(mapPoint);
    } else if (endEditableRef.current) {
      setPlanEnd(mapPoint);
    }
  }, []);

  const schedule: PlanSchedule = {
    shift: planShift,
    onShiftChange: setPlanShift,
    stopRanges: rangesFor(planStops),
    onStopRangesChange: (index, ranges) => {
      const stop = planStops[index];
      if (stop) setAvailability((prev) => ({ ...prev, [stopKey(stop)]: ranges }));
    },
    defaultMinutes: VISIT_MINUTES,
    stopDurations: manualDurations,
    onStopDurationChange: (index, minutes) => {
      const stop = planStops[index];
      if (!stop) return;
      setDurations((prev) => {
        const next = { ...prev };
        // Solo se guardan las que no usan la duración por defecto
        if (minutes === VISIT_MINUTES) delete next[stopKey(stop)];
        else next[stopKey(stop)] = minutes;
        return next;
      });
    },
    loading: scheduleLoading,
    error: scheduleError,
    onSchedule: handleSchedule,
    options: freshRun ? freshRun.result.options : null,
    selectedOption: onOwnOrder ? (ownMatchIndex >= 0 ? ownMatchIndex : null) : freshRun?.selected ?? null,
    ownOrder:
      freshRun && ownMatchIndex < 0
        ? { option: freshRun.own?.option ?? null, selected: onOwnOrder, onSelect: handleSelectOwnOrder }
        : null,
    ownMatchIndex: ownMatchIndex >= 0 ? ownMatchIndex : null,
    onSelectOption: handleSelectScheduleOption,
    unscheduled:
      freshRun && shownOption
        ? shownOption.unscheduled.map((u) => ({ stop: freshRun.stops[u.visit], reason: u.reason }))
        : [],
    estimatedTravel:
      (freshRun != null && freshRun.result.travel_source !== 'google') ||
      (manualResult != null && manualResult.travel_source !== 'google'),
    // Recién aplicada una opción se ve al instante; después manda el recálculo del orden actual
    stopTimes: manualResult?.option.visits ?? appliedOption?.visits ?? null,
    departure: manualResult?.option.departure ?? appliedOption?.departure ?? null,
    finishTime: manualResult?.option.finish_time ?? appliedOption?.finish_time ?? null,
    postponed,
    onRestorePostponed: handleRestorePostponed,
    fixedStarts: manualFixed,
    onFixedStartChange: (index, minutes) => {
      const stop = planStops[index];
      if (!stop) return;
      setFixedStarts((prev) => {
        const next = { ...prev };
        if (minutes == null) delete next[stopKey(stop)];
        else next[stopKey(stop)] = minutes;
        return next;
      });
    },
    onMoveStop: handleMoveStop,
    conflicts: manualResult?.conflicts ?? [],
    afterShiftMin: manualResult?.after_shift_min ?? 0,
    manualLoading,
    // Horario de un orden que no es una de las opciones calculadas
    isManual: manualResult != null && appliedOption == null,
  };

  const hint = planHint({
    planningMode,
    workerCount: workers.length,
    hasPlanWorker: planWorkerId != null,
    hasOrigin: planOrigin != null,
    originEditable,
    endPending: endEditable && !planEnd,
    stopsCount: planStops.length,
  });
  const stripTitle =
    planWorkerLabel && planStops.length > 0
      ? [
          planWorkerLabel,
          `${planStops.length} ${planStops.length === 1 ? 'visita' : 'visitas'}`,
          planLegs && !legsLoading ? `${planLegs.total_distance_km.toFixed(1)} km` : null,
          schedule.finishTime != null ? `acaba ${formatMinutes(schedule.finishTime)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : planWorkerLabel;

  const selectedIndex =
    selectedStopKey != null ? planStops.findIndex((stop) => stopKey(stop) === selectedStopKey) : -1;
  const selectedStop = selectedIndex >= 0 ? planStops[selectedIndex] : null;
  const selectedTime = selectedIndex >= 0 ? schedule.stopTimes?.[selectedIndex] : undefined;

  const scheduleStopTimes = schedule.stopTimes;
  const planStopStarts = useMemo(
    () => scheduleStopTimes?.map((t) => t.start) ?? null,
    [scheduleStopTimes]
  );

  return (
    <div className="App">
      <AuthGuard>
        <AppChrome
          sheet={sheet}
          onSheetChange={handleSheetChange}
          planningActive={planningMode}
          statusBar={(openSheet) =>
            workers.length === 0 ? (
              <MapStrip
                message="Elige trabajadoras para ver sus usuarias en el mapa."
                actionLabel="Elegir"
                onAction={() => openSheet('filters')}
              />
            ) : planningMode && selectedStop && !planNotice ? (
              <MapStrip
                title={
                  `${selectedIndex + 1}. ${selectedStop.label}` +
                  (selectedTime
                    ? ` · ${formatMinutes(selectedTime.start)}–${formatMinutes(selectedTime.end)}`
                    : '')
                }
                message="Ya está en la ruta."
                actionLabel="Ver tarjeta"
                onAction={() => {
                  setCardScrollNonce((n) => n + 1);
                  openSheet('plan');
                }}
                secondaryLabel="Quitar"
                onSecondary={() => {
                  handleRemoveStop(selectedIndex);
                  setSelectedStopKey(null);
                }}
              />
            ) : planningMode ? (
              <MapStrip
                title={stripTitle}
                message={planNotice ?? hint}
                warning={planNotice != null}
                actionLabel="Ver plan"
                onAction={() => openSheet('plan')}
              />
            ) : null
          }
          filters={
            <Box className="AppChrome-filters" sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              {/* key: tras "Actualizar datos" se vuelve a cargar la lista de trabajadoras */}
              <WorkerSelector key={viewportKey} selectedIds={workers} onFilterChange={setWorkers} />
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
              hint={hint}
              onClearEnd={() => setPlanEnd(null)}
              onRemoveStop={handleRemoveStop}
              onReorderStop={handleReorderStop}
              onLocateStop={handleLocateStop}
              selectedIndex={selectedIndex >= 0 ? selectedIndex : null}
              scrollToSelected={cardScrollNonce}
              onClear={clearPlanWithUndo}
              // Cambiar la partida empieza la ruta de nuevo (se puede deshacer)
              onClearOrigin={clearPlanWithUndo}
              schedule={schedule}
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
            planStopTimes={planStopStarts}
            planSelectedIndex={selectedIndex >= 0 ? selectedIndex : null}
            focus={mapFocus}
            onPlanPointClick={handlePlanPointClick}
            onPlanMapClick={handlePlanMapClick}
          />
        </AppChrome>
        <Snackbar
          open={undo != null}
          autoHideDuration={6000}
          onClose={(_, reason) => {
            if (reason !== 'clickaway') setUndo(null);
          }}
          message={undo?.message}
          action={
            <Button
              color="secondary"
              size="small"
              onClick={() => {
                undo?.restore();
                setUndo(null);
              }}
              sx={{ fontWeight: 700 }}
            >
              Deshacer
            </Button>
          }
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          // Por encima de la barra inferior y, si se ve, de la franja del plan
          sx={{
            bottom: planningMode
              ? 'calc(136px + env(safe-area-inset-bottom, 0px)) !important'
              : 'calc(76px + env(safe-area-inset-bottom, 0px)) !important',
          }}
        />
      </AuthGuard>
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
