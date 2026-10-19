import React from 'react';
import { Box, Button, CircularProgress, IconButton, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DirectionsCarOutlinedIcon from '@mui/icons-material/DirectionsCarOutlined';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { ScheduleConflict, ScheduledVisit, TimeRange, VisitPlanPoint } from '../services/map_service';
import { formatMinutes, formatRanges, isValidRange } from '../services/time_ranges';
import { AvailabilityEditor, FixedTimeEditor } from './visit_schedule';

/** Mismo azul que el número de la visita en el mapa */
const STOP_BLUE = '#1e40af';

/** Cabecera de cada paso del panel: ① Ruta, ② Visitas, ③ Horario */
export const StepHeader: React.FC<{
  step: number;
  title: string;
  /** Texto corto a la derecha (p. ej. "3 visitas") */
  aside?: React.ReactNode;
}> = ({ step, title, aside }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2.25, mb: 1 }}>
    <Box
      sx={{
        width: 22,
        height: 22,
        borderRadius: '50%',
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
        fontSize: '0.75rem',
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {step}
    </Box>
    <Typography variant="body2" fontWeight={700} sx={{ flex: 1, fontSize: '0.92rem' }}>
      {title}
    </Typography>
    {aside}
  </Box>
);

/** Fila de salida o llegada en la agenda */
export const AgendaEndpoint: React.FC<{
  time: number | null;
  label: string;
  place: string;
}> = ({ time, label, place }) => (
  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, px: 0.5, py: 0.5 }}>
    <Typography variant="body2" fontWeight={700} sx={{ width: 48, flexShrink: 0, color: 'text.secondary' }}>
      {time != null ? formatMinutes(time) : '—'}
    </Typography>
    <Typography variant="body2" sx={{ color: 'text.secondary', minWidth: 0 }} noWrap>
      <strong>{label}</strong> · {place}
    </Typography>
  </Box>
);

/** Trayecto entre dos paradas: minutos (si hay horario) y km por carretera */
export const TravelRow: React.FC<{ minutes: number | null; km: number | null; loading?: boolean }> = ({
  minutes,
  km,
  loading = false,
}) => {
  const parts = [minutes != null ? `${minutes} min` : null, km != null ? `${km.toFixed(1)} km` : null].filter(
    Boolean
  );
  if (parts.length === 0 && !loading) return <Box sx={{ height: 8 }} />;
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        ml: '27px',
        pl: 2,
        py: 0.5,
        borderLeft: '2px dashed',
        borderColor: 'divider',
        color: 'text.secondary',
      }}
    >
      <DirectionsCarOutlinedIcon sx={{ fontSize: 16 }} />
      {parts.length > 0 ? (
        <Typography variant="caption">{parts.join(' · ')}</Typography>
      ) : (
        <CircularProgress size={10} thickness={5} color="inherit" />
      )}
    </Box>
  );
};

interface VisitCardProps {
  index: number;
  count: number;
  stop: VisitPlanPoint;
  time: ScheduledVisit | null;
  ranges: TimeRange[];
  fixed: number | null;
  conflict: ScheduleConflict | null;
  serviceMinutes: number;
  shiftStart: number;
  editing: boolean;
  onToggleEdit: () => void;
  onRangesChange: (ranges: TimeRange[]) => void;
  onFixedChange: (minutes: number | null) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}

/** Texto del problema de una visita; sin franjas ni hora fija, el límite es la jornada */
function formatConflict(conflict: ScheduleConflict, fixed: number | null, ranges: TimeRange[]): string {
  if (conflict.type === 'outside_window') return 'Su horario no coincide con la jornada';
  const minutes = conflict.minutes ?? 0;
  if (fixed != null) return `Llega ${minutes} min tarde a su hora fija (${formatMinutes(fixed)})`;
  if (ranges.length === 0) return `Acaba ${minutes} min después de la jornada`;
  return `Llega ${minutes} min tarde para su horario (${formatRanges(ranges)})`;
}

/** Tarjeta de una visita: hora a la izquierda, usuaria, disponibilidad y acciones */
export const VisitCard: React.FC<VisitCardProps> = ({
  index,
  count,
  stop,
  time,
  ranges,
  fixed,
  conflict,
  serviceMinutes,
  shiftStart,
  editing,
  onToggleEdit,
  onRangesChange,
  onFixedChange,
  onMove,
  onRemove,
}) => {
  const rangesValid = ranges.every(isValidRange);
  return (
    <Box
      sx={(theme) => ({
        p: 1,
        borderRadius: 2,
        border: '1px solid',
        borderColor: conflict ? alpha(theme.palette.warning.main, 0.6) : 'divider',
        bgcolor: conflict ? alpha(theme.palette.warning.main, 0.06) : 'rgba(255, 255, 255, 0.5)',
      })}
    >
    <Box sx={{ display: 'flex', gap: 1.25 }}>
      {/* Columna de hora (o número si aún no hay horario) */}
      <Box sx={{ width: 48, flexShrink: 0, textAlign: 'center', pt: 0.25 }}>
        {time ? (
          <>
            <Typography sx={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.1, color: 'text.primary' }}>
              {formatMinutes(time.start)}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {formatMinutes(time.end)}
            </Typography>
          </>
        ) : (
          <Box
            sx={{
              width: 28,
              height: 28,
              mx: 'auto',
              borderRadius: '50%',
              bgcolor: STOP_BLUE,
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {index + 1}
          </Box>
        )}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
          <Typography variant="body2" fontWeight={600} sx={{ flex: 1, minWidth: 0, lineHeight: 1.35, pt: 0.25 }}>
            {time && (
              <Box component="span" sx={{ color: STOP_BLUE, fontWeight: 700, mr: 0.5 }}>
                {index + 1}.
              </Box>
            )}
            {stop.label}
          </Typography>
          <IconButton
            aria-label={`quitar visita ${index + 1}`}
            onClick={onRemove}
            size="small"
            sx={{ color: 'text.secondary', mt: -0.5, mr: -0.5 }}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Box>
        {time && time.wait > 0 && (
          <Typography variant="caption" display="block" sx={{ color: 'text.secondary' }}>
            Espera {time.wait} min antes de entrar
          </Typography>
        )}
        {conflict && (
          <Typography variant="caption" display="block" sx={{ color: 'warning.dark', fontWeight: 600 }}>
            {formatConflict(conflict, fixed, ranges)}
          </Typography>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.25, ml: -0.75 }}>
          <Button
            size="small"
            startIcon={<ScheduleIcon sx={{ fontSize: '16px !important' }} />}
            onClick={onToggleEdit}
            aria-expanded={editing}
            color={rangesValid ? 'secondary' : 'error'}
            sx={{
              flex: 1,
              minWidth: 0,
              minHeight: 32,
              px: 0.75,
              fontSize: '0.75rem',
              fontWeight: 500,
              justifyContent: 'flex-start',
              textAlign: 'left',
            }}
          >
            {fixed != null ? `Hora fija: ${formatMinutes(fixed)}` : `Disponible: ${formatRanges(ranges)}`}
          </Button>
          <IconButton
            aria-label={`subir visita ${index + 1}`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
            size="small"
            sx={{ color: 'text.secondary' }}
          >
            <ArrowUpwardIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <IconButton
            aria-label={`bajar visita ${index + 1}`}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            size="small"
            sx={{ color: 'text.secondary', mr: -0.5 }}
          >
            <ArrowDownwardIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      </Box>
    </Box>

      {/* Editor a lo ancho de toda la tarjeta para que las horas se vean completas */}
      {editing && (
        <Box sx={{ pt: 0.5, pb: 0.5, px: 0.25, borderTop: '1px solid', borderColor: 'divider', mt: 0.75 }}>
          <FixedTimeEditor
            value={fixed}
            suggested={time?.start ?? ranges[0]?.start ?? shiftStart}
            onChange={onFixedChange}
          />
          {fixed != null ? (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75 }}>
              Con hora fija no se usan sus franjas.
            </Typography>
          ) : (
            <AvailabilityEditor ranges={ranges} onChange={onRangesChange} serviceMinutes={serviceMinutes} />
          )}
        </Box>
      )}
    </Box>
  );
};
