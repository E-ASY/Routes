import React from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Collapse,
  FormControlLabel,
  IconButton,
  MenuItem,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteSweepOutlinedIcon from '@mui/icons-material/DeleteSweepOutlined';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import TuneIcon from '@mui/icons-material/Tune';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import {
  LegsResult,
  PlanFinish,
  ScheduleConflict,
  ScheduleOption,
  ScheduledVisit,
  TimeRange,
  UnscheduledVisit,
  VisitPlanPoint,
} from '../services/map_service';
import { MAX_GOOGLE_MAPS_WAYPOINTS, buildGoogleMapsLinks } from '../services/google_maps_link';
import { buildAgendaText } from '../services/plan_text';
import { formatMinutes, isValidRange } from '../services/time_ranges';
import { OwnOrderRow, PostponedList, ScheduleOptions, ShiftEditor, UnscheduledAlert } from './visit_schedule';
import { AgendaEndpoint, StepHeader, TravelRow, VisitCard } from './visit_agenda';

/** PERF-013: horario del día (jornada, franjas por usuaria y opciones calculadas) */
export interface PlanSchedule {
  shift: TimeRange;
  onShiftChange: (shift: TimeRange) => void;
  /** Franjas de cada visita, en el mismo orden que stops (vacío = cualquier hora) */
  stopRanges: TimeRange[][];
  onStopRangesChange: (index: number, ranges: TimeRange[]) => void;
  serviceMinutes: number;
  loading: boolean;
  error: string | null;
  onSchedule: () => void;
  /** Opciones vigentes; null si aún no se calculó o cambiaron visitas, franjas o jornada */
  options: ScheduleOption[] | null;
  selectedOption: number | null;
  onSelectOption: (index: number) => void;
  /** Fila "Tu orden" (el orden que había al organizar); null si coincide con una opción */
  ownOrder: OwnOrderRow | null;
  /** Opción que coincide con el orden que había al organizar */
  ownMatchIndex: number | null;
  unscheduled: { stop: VisitPlanPoint; reason: UnscheduledVisit['reason'] }[];
  /** Algún tiempo de viaje es estimado (Google no respondió) */
  estimatedTravel: boolean;
  /** Horario por visita (mismo orden que stops), si sigue vigente */
  stopTimes: ScheduledVisit[] | null;
  departure: number | null;
  finishTime: number | null;
  postponed: VisitPlanPoint[];
  onRestorePostponed: (index: number) => void;
  /** Hora fija por visita (mismo orden que stops; null = sin fijar) */
  fixedStarts: (number | null)[];
  onFixedStartChange: (index: number, minutes: number | null) => void;
  /** Cambiar el orden a mano: −1 sube la visita, +1 la baja */
  onMoveStop: (index: number, delta: number) => void;
  /** Problemas del horario del orden actual (llega tarde, fuera de horario) */
  conflicts: ScheduleConflict[];
  /** Minutos que se pasa de la jornada con el orden actual */
  afterShiftMin: number;
  manualLoading: boolean;
  /** El horario mostrado es el de un orden u horas cambiados a mano */
  isManual: boolean;
}

interface VisitPlanPanelProps {
  planningMode: boolean;
  onPlanningModeChange: (enabled: boolean) => void;
  origin: VisitPlanPoint | null;
  stops: VisitPlanPoint[];
  legs: LegsResult | null;
  legsLoading: boolean;
  legsError: string | null;
  finish: PlanFinish;
  onFinishChange: (finish: PlanFinish) => void;
  /** Llegada elegida cuando finish === 'custom' */
  end: VisitPlanPoint | null;
  /** Ya hay visitas: tocar el mapa o la trabajadora fija o mueve la llegada */
  endEditable: boolean;
  /** Aún sin visitas: tocar el mapa o la trabajadora mueve la partida */
  originEditable: boolean;
  /** Trabajadora a la que pertenece la ruta que se está editando */
  planWorkerLabel: string | null;
  planWorkerId: string | null;
  /** Trabajadoras seleccionadas, con las visitas que lleva cada plan */
  workerOptions: { id: string; label: string; stopsCount: number }[];
  onPlanWorkerChange: (id: string) => void;
  /** Aviso temporal, p. ej. al tocar una usuaria de otra trabajadora */
  notice: string | null;
  onClearEnd: () => void;
  onRemoveStop: (index: number) => void;
  onClear: () => void;
  onClearOrigin: () => void;
  schedule: PlanSchedule;
}

const MAX_STOPS = 14;

const FINISH_LABELS: Record<PlanFinish, string> = {
  start: 'vuelve a la partida',
  last: 'acaba en la última visita',
  custom: 'acaba en otro sitio',
};

function formatPersonLabel(point: VisitPlanPoint): string {
  return point.label || `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`;
}

type CopyStatus = 'idle' | 'copied' | 'error';

/** Fila de "Sale de" / "Llega a" en el paso 1 */
const PlaceRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | null;
  pending: string;
  onClear?: () => void;
  clearLabel: string;
}> = ({ icon, label, value, pending, onClear, clearLabel }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minHeight: 44 }}>
    <Box sx={{ color: 'text.secondary', display: 'flex', width: 24, justifyContent: 'center' }}>{icon}</Box>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.2 }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        noWrap
        sx={{ color: value ? 'text.primary' : 'text.secondary', fontStyle: value ? 'normal' : 'italic' }}
      >
        {value ?? pending}
      </Typography>
    </Box>
    {value && onClear && (
      <IconButton aria-label={clearLabel} onClick={onClear} size="small" sx={{ color: 'text.secondary' }}>
        <DeleteOutlineIcon fontSize="small" />
      </IconButton>
    )}
  </Box>
);

const VisitPlanPanel: React.FC<VisitPlanPanelProps> = ({
  planningMode,
  onPlanningModeChange,
  origin,
  stops,
  legs,
  legsLoading,
  legsError,
  finish,
  onFinishChange,
  end,
  endEditable,
  originEditable,
  planWorkerLabel,
  planWorkerId,
  workerOptions,
  onPlanWorkerChange,
  notice,
  onClearEnd,
  onRemoveStop,
  onClear,
  onClearOrigin,
  schedule,
}) => {
  // Visita cuyas franjas / hora fija se están editando
  const [editingStop, setEditingStop] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (editingStop != null && editingStop >= stops.length) setEditingStop(null);
  }, [editingStop, stops.length]);
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  const scheduleInputsValid =
    isValidRange(schedule.shift) && schedule.stopRanges.every((ranges) => ranges.every(isValidRange));
  const hint = !planningMode
    ? 'Actívalo para preparar la ruta y el horario de una trabajadora.'
    : workerOptions.length === 0
      ? 'Selecciona trabajadoras en Filtros para planificar.'
      : !planWorkerId
        ? 'Elige a qué trabajadora planificar.'
        : !origin
          ? 'Toca en el mapa el sitio de salida, una usuaria o la casa de la trabajadora.'
          : originEditable
            ? 'Ahora toca las usuarias que visitará hoy.'
            : endEditable && !end
              ? 'Toca usuarias para añadirlas y, al acabar, el sitio de llegada.'
              : 'Toca más usuarias en el mapa para añadirlas.';

  const times = schedule.stopTimes;
  const closingKm =
    legs && legs.legs.length > stops.length ? legs.legs[legs.legs.length - 1]?.distance_km ?? null : null;
  const lastTime = times?.[times.length - 1];
  const closingMinutes =
    schedule.finishTime != null && lastTime && finish !== 'last' ? schedule.finishTime - lastTime.end : null;
  const travelMinutes = (index: number): number | null => {
    const time = times?.[index];
    if (!time) return null;
    const prevEnd = index === 0 ? schedule.departure : times?.[index - 1]?.end ?? null;
    return prevEnd != null ? Math.max(0, time.arrival - prevEnd) : null;
  };

  // Recorrido en orden para Google Maps; sin enlace mientras falte la llegada
  const mapsLinks =
    origin && stops.length > 0 && !(finish === 'custom' && !end)
      ? buildGoogleMapsLinks([origin, ...stops, ...(finish === 'start' ? [origin] : end ? [end] : [])])
      : [];
  const [copyStatus, setCopyStatus] = React.useState<CopyStatus>('idle');
  React.useEffect(() => {
    if (copyStatus === 'idle') return;
    const timer = window.setTimeout(() => setCopyStatus('idle'), 2000);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);
  const handleCopyAgenda = async () => {
    if (!origin) return;
    try {
      await navigator.clipboard.writeText(
        buildAgendaText({
          workerLabel: planWorkerLabel,
          origin,
          stops,
          times,
          departure: schedule.departure,
          finishTime: schedule.finishTime,
          finish,
          end,
          mapsLinks,
        })
      );
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  };

  const hasConflicts = schedule.conflicts.length > 0 || schedule.afterShiftMin > 0;
  const lateVisits = schedule.conflicts
    .filter((c) => c.type === 'late' && stops[c.visit])
    .map((c) => ({ stop: stops[c.visit], minutes: c.minutes ?? 0 }));
  const outsideVisits = schedule.conflicts
    .filter((c) => c.type === 'outside_window' && stops[c.visit])
    .map((c) => stops[c.visit]);
  const ready = planningMode && planWorkerId != null;

  return (
    <Box className="VisitPlan-container" sx={{ p: 0, width: '100%' }}>
      <FormControlLabel
        control={
          <Switch checked={planningMode} onChange={(_, checked) => onPlanningModeChange(checked)} size="small" />
        }
        label={
          <Typography variant="body2" fontWeight={700} sx={{ letterSpacing: '-0.01em', fontSize: '0.9rem' }}>
            Modo planificación
          </Typography>
        }
        sx={{ minHeight: 40, ml: 0, width: '100%', justifyContent: 'space-between', mr: 0 }}
        labelPlacement="start"
      />
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.25, lineHeight: 1.4 }}>
        {hint}
      </Typography>
      {planningMode && workerOptions.length > 1 && (
        <TextField
          select
          fullWidth
          size="small"
          label="Planificar a"
          value={planWorkerId ?? ''}
          onChange={(event) => onPlanWorkerChange(event.target.value)}
          sx={{ mb: 1.25 }}
        >
          {workerOptions.map((option) => (
            <MenuItem key={option.id} value={option.id}>
              {option.label}
              {option.stopsCount > 0 && (
                <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                  · {option.stopsCount} {option.stopsCount === 1 ? 'visita' : 'visitas'}
                </Typography>
              )}
            </MenuItem>
          ))}
        </TextField>
      )}
      {planningMode && workerOptions.length === 1 && planWorkerLabel && (
        <Typography variant="body2" sx={{ mb: 1.25, lineHeight: 1.4 }}>
          Ruta de <strong>{planWorkerLabel}</strong>
        </Typography>
      )}
      {planningMode && notice && (
        <Alert severity="info" sx={{ mb: 1.25, py: 0, fontSize: '0.75rem' }}>
          {notice}
        </Alert>
      )}

      {ready && (
        <>
          {/* ① Ruta: salida, llegada y ajustes del día */}
          <StepHeader step={1} title="Ruta" />
          <PlaceRow
            icon={<HomeOutlinedIcon fontSize="small" />}
            label="Sale de"
            value={origin ? formatPersonLabel(origin) : null}
            pending="Toca un sitio en el mapa"
            onClear={onClearOrigin}
            clearLabel="cambiar partida"
          />
          {finish === 'custom' && (
            <PlaceRow
              icon={<FlagOutlinedIcon fontSize="small" />}
              label="Llega a"
              value={end ? formatPersonLabel(end) : null}
              pending={stops.length > 0 ? 'Toca en el mapa dónde acaba' : 'Primero añade visitas'}
              onClear={onClearEnd}
              clearLabel="cambiar llegada"
            />
          )}
          <Button
            fullWidth
            color="inherit"
            startIcon={<TuneIcon fontSize="small" />}
            endIcon={
              <ExpandMoreIcon
                sx={{ transform: settingsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }}
              />
            }
            onClick={() => setSettingsOpen((open) => !open)}
            aria-expanded={settingsOpen}
            sx={{
              justifyContent: 'flex-start',
              textAlign: 'left',
              minHeight: 40,
              mt: 0.5,
              px: 1,
              fontWeight: 500,
              fontSize: '0.8rem',
              color: 'text.secondary',
              bgcolor: 'rgba(20, 50, 60, 0.04)',
              '& .MuiButton-endIcon': { ml: 'auto' },
            }}
          >
            Jornada {formatMinutes(schedule.shift.start)}–{formatMinutes(schedule.shift.end)} ·{' '}
            {FINISH_LABELS[finish]}
          </Button>
          <Collapse in={settingsOpen || !isValidRange(schedule.shift)}>
            <Box sx={{ pt: 1.25, pb: 0.5 }}>
              <ShiftEditor shift={schedule.shift} onChange={schedule.onShiftChange} />
              <Typography variant="body2" sx={{ mt: 1.25, mb: 0.75 }}>
                Al terminar
              </Typography>
              <ToggleButtonGroup
                value={finish}
                exclusive
                fullWidth
                size="small"
                onChange={(_, value: PlanFinish | null) => {
                  if (value) onFinishChange(value);
                }}
                aria-label="dónde acaba la ruta"
              >
                <ToggleButton value="start" sx={{ fontSize: '0.75rem', textTransform: 'none', minHeight: 36 }}>
                  Volver
                </ToggleButton>
                <ToggleButton value="last" sx={{ fontSize: '0.75rem', textTransform: 'none', minHeight: 36 }}>
                  Última visita
                </ToggleButton>
                <ToggleButton value="custom" sx={{ fontSize: '0.75rem', textTransform: 'none', minHeight: 36 }}>
                  Otro sitio
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Collapse>

          {/* ② Visitas en forma de agenda */}
          <StepHeader
            step={2}
            title="Visitas"
            aside={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                {schedule.manualLoading && <CircularProgress size={12} thickness={5} />}
                {stops.length > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    {stops.length}/{MAX_STOPS}
                  </Typography>
                )}
              </Box>
            }
          />
          {stops.length === 0 ? (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                p: 1.5,
                textAlign: 'center',
                borderRadius: 2,
                border: '1px dashed',
                borderColor: 'divider',
                lineHeight: 1.45,
              }}
            >
              {origin
                ? 'Toca en el mapa las usuarias que visitará hoy.'
                : 'Primero elige en el mapa desde dónde sale.'}
            </Typography>
          ) : (
            <Box>
              {origin && <AgendaEndpoint time={schedule.departure} label="Salida" place={formatPersonLabel(origin)} />}
              {stops.map((stop, index) => (
                <React.Fragment key={`${stop.userId ?? stop.lat}-${index}`}>
                  <TravelRow
                    minutes={travelMinutes(index)}
                    km={legs?.legs?.[index]?.distance_km ?? null}
                    loading={legsLoading}
                  />
                  <VisitCard
                    index={index}
                    count={stops.length}
                    stop={stop}
                    time={times?.[index] ?? null}
                    ranges={schedule.stopRanges[index] ?? []}
                    fixed={schedule.fixedStarts[index] ?? null}
                    conflict={schedule.conflicts.find((c) => c.visit === index) ?? null}
                    serviceMinutes={schedule.serviceMinutes}
                    shiftStart={schedule.shift.start}
                    editing={editingStop === index}
                    onToggleEdit={() => setEditingStop(editingStop === index ? null : index)}
                    onRangesChange={(ranges) => schedule.onStopRangesChange(index, ranges)}
                    onFixedChange={(minutes) => schedule.onFixedStartChange(index, minutes)}
                    onMove={(delta) => schedule.onMoveStop(index, delta)}
                    onRemove={() => onRemoveStop(index)}
                  />
                </React.Fragment>
              ))}
              {origin && finish === 'start' && (
                <>
                  <TravelRow minutes={closingMinutes} km={closingKm} loading={legsLoading} />
                  <AgendaEndpoint time={schedule.finishTime} label="Vuelta" place={formatPersonLabel(origin)} />
                </>
              )}
              {finish === 'custom' && end && (
                <>
                  <TravelRow minutes={closingMinutes} km={closingKm} loading={legsLoading} />
                  <AgendaEndpoint time={schedule.finishTime} label="Llegada" place={formatPersonLabel(end)} />
                </>
              )}
            </Box>
          )}
          <PostponedList
            stops={schedule.postponed}
            onRestore={schedule.onRestorePostponed}
            canRestore={stops.length < MAX_STOPS}
          />

          {/* ③ Organizar, elegir horario y enviar */}
          {stops.length > 0 && (
            <>
              <StepHeader
                step={3}
                title="Horario y envío"
                aside={
                  legs && !legsLoading ? (
                    <Typography variant="caption" fontWeight={700} color="text.secondary">
                      {legs.total_distance_km.toFixed(1)} km
                    </Typography>
                  ) : null
                }
              />
              <Button
                variant="contained"
                disableElevation
                startIcon={
                  schedule.loading ? (
                    <CircularProgress size={14} thickness={4} color="inherit" />
                  ) : (
                    <AutoFixHighIcon />
                  )
                }
                disabled={
                  !origin || (finish === 'custom' && !end) || !scheduleInputsValid || schedule.loading
                }
                onClick={schedule.onSchedule}
                fullWidth
                sx={{ minHeight: 44, fontSize: '0.9rem' }}
              >
                Organizar
              </Button>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5, lineHeight: 1.4 }}>
                {!scheduleInputsValid
                  ? 'Revisa las horas: cada franja debe terminar después de empezar.'
                  : 'Busca el mejor orden y horario con los horarios de cada usuaria. También puedes ordenarlas a mano con las flechas.'}
              </Typography>

              {schedule.error && (
                <Alert severity="warning" sx={{ mt: 1.25, py: 0, fontSize: '0.75rem' }}>
                  {schedule.error}
                </Alert>
              )}
              {legsError && (
                <Alert severity="warning" sx={{ mt: 1.25, py: 0, fontSize: '0.75rem' }}>
                  {legsError}
                </Alert>
              )}
              {schedule.options && schedule.options.length === 0 && (
                <Alert severity="warning" sx={{ mt: 1.25, fontSize: '0.75rem' }}>
                  Ninguna visita cabe en la jornada con estos horarios. Revisa las franjas u organízalas para otro
                  día.
                </Alert>
              )}
              {schedule.options && schedule.options.length > 0 && (
                <>
                  <UnscheduledAlert items={schedule.unscheduled} />
                  <Typography
                    variant="caption"
                    display="block"
                    sx={{ mt: 1.25, color: 'text.secondary', lineHeight: 1.4 }}
                  >
                    {schedule.options.length === 1 && schedule.ownMatchIndex === 0
                      ? 'Tu orden ya es el mejor en km, hora de fin y esperas.'
                      : schedule.options.length === 1 && !schedule.ownOrder
                        ? 'Este horario es el mejor en km, hora de fin y esperas. Tócalo para aplicarlo.'
                        : 'Elige el horario que prefieras. Puedes volver a tu orden cuando quieras.'}
                    {schedule.estimatedTravel ? ' (Tiempos de viaje estimados: Google no respondió.)' : ''}
                  </Typography>
                  <ScheduleOptions
                    options={schedule.options}
                    selected={schedule.selectedOption}
                    onSelect={schedule.onSelectOption}
                    own={schedule.ownOrder}
                    ownMatchIndex={schedule.ownMatchIndex}
                  />
                </>
              )}
              {!schedule.manualLoading && hasConflicts && (
                <Alert severity="warning" sx={{ mt: 1.25, fontSize: '0.75rem' }}>
                  {lateVisits.length > 0 && (
                    <>
                      Con este horario llega tarde a:
                      <Box component="ul" sx={{ m: 0, mt: 0.5, mb: 0.5, pl: 2.5 }}>
                        {lateVisits.map(({ stop, minutes }, i) => (
                          <li key={`${stop.userId ?? stop.lat}-${i}`}>
                            {stop.label}: {minutes} min
                          </li>
                        ))}
                      </Box>
                    </>
                  )}
                  {outsideVisits.length > 0 && (
                    <Box sx={{ mb: 0.5 }}>
                      Fuera de la jornada: {outsideVisits.map((stop) => stop.label).join(', ')}.
                    </Box>
                  )}
                  {schedule.afterShiftMin > 0 && (
                    <Box sx={{ mb: 0.5 }}>Termina {schedule.afterShiftMin} min después de la jornada.</Box>
                  )}
                  Tú decides: puedes mantenerlo así, quitar alguna visita con la papelera o cambiar el orden.
                </Alert>
              )}
              {!schedule.manualLoading && schedule.isManual && !hasConflicts && (
                <Alert severity="success" sx={{ mt: 1.25, py: 0, fontSize: '0.75rem' }}>
                  Horario recalculado para tu orden: todas las visitas encajan.
                </Alert>
              )}

              {mapsLinks.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  {mapsLinks.length > 1 && (
                    <Typography
                      variant="caption"
                      display="block"
                      sx={{ mb: 0.75, color: 'text.secondary', lineHeight: 1.4 }}
                    >
                      Google Maps admite {MAX_GOOGLE_MAPS_WAYPOINTS} paradas por enlace: la ruta va en{' '}
                      {mapsLinks.length} tramos seguidos.
                    </Typography>
                  )}
                  <Button
                    variant="contained"
                    color="secondary"
                    disableElevation
                    startIcon={<ContentCopyIcon />}
                    onClick={handleCopyAgenda}
                    fullWidth
                    sx={{ minHeight: 44, fontSize: '0.88rem', backgroundImage: 'none' }}
                  >
                    {copyStatus === 'copied'
                      ? 'Copiado: pégalo en WhatsApp o un correo'
                      : copyStatus === 'error'
                        ? 'No se pudo copiar'
                        : 'Copiar agenda para la trabajadora'}
                  </Button>
                  <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                    {mapsLinks.map((link, index) => (
                      <Button
                        key={link}
                        variant="outlined"
                        component="a"
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        startIcon={<OpenInNewIcon />}
                        sx={{ minHeight: 42, flex: 1, fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                      >
                        {mapsLinks.length === 1 ? 'Abrir en Google Maps' : `Tramo ${index + 1}`}
                      </Button>
                    ))}
                  </Box>
                </Box>
              )}
            </>
          )}

          {(origin != null || stops.length > 0) && (
            <Button
              variant="text"
              color="error"
              startIcon={<DeleteSweepOutlinedIcon />}
              onClick={onClear}
              fullWidth
              sx={{
                minHeight: 40,
                mt: 2,
                fontSize: '0.85rem',
                fontWeight: 600,
                '&:hover': { bgcolor: (theme) => alpha(theme.palette.error.main, 0.08) },
              }}
            >
              Limpiar plan
            </Button>
          )}
        </>
      )}
    </Box>
  );
};

export default VisitPlanPanel;
