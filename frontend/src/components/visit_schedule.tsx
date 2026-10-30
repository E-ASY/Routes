import React from 'react';
import {
  Alert,
  Box,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import UndoIcon from '@mui/icons-material/Undo';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import {
  ScheduleOption,
  TimeRange,
  UnscheduledVisit,
  VisitPlanPoint,
} from '../services/map_service';
import { formatMinutes, isValidRange, parseTime } from '../services/time_ranges';
import { formatDuration } from '../services/plan_summary';
import { formatOptionGoals } from '../services/plan_text';

const timeFieldProps = {
  type: 'time',
  size: 'small',
  slotProps: { inputLabel: { shrink: true }, htmlInput: { step: 300 } },
  // Ancho suficiente para ver la hora completa (hh:mm + icono del reloj)
  sx: { flex: 1, minWidth: 112 },
} as const;

interface RangeFieldsProps {
  range: TimeRange;
  onChange: (range: TimeRange) => void;
  startLabel: string;
  endLabel: string;
}

/** Dos campos de hora (inicio / fin) que solo propagan horas válidas */
const RangeFields: React.FC<RangeFieldsProps> = ({ range, onChange, startLabel, endLabel }) => {
  const invalid = !isValidRange(range);
  return (
    <>
      <TextField
        {...timeFieldProps}
        label={startLabel}
        value={formatMinutes(range.start)}
        onChange={(event) => {
          const start = parseTime(event.target.value);
          if (start != null) onChange({ ...range, start });
        }}
      />
      <TextField
        {...timeFieldProps}
        label={endLabel}
        value={formatMinutes(range.end)}
        error={invalid}
        onChange={(event) => {
          const end = parseTime(event.target.value);
          if (end != null) onChange({ ...range, end });
        }}
      />
    </>
  );
};

/** Jornada de la trabajadora: hora a la que puede salir y a la que debe haber terminado */
export const ShiftEditor: React.FC<{ shift: TimeRange; onChange: (shift: TimeRange) => void }> = ({
  shift,
  onChange,
}) => (
  <Box>
    <Typography variant="body2" sx={{ mb: 0.75 }}>
      Jornada
    </Typography>
    <Box sx={{ display: 'flex', gap: 1 }}>
      <RangeFields range={shift} onChange={onChange} startLabel="Empieza" endLabel="Termina" />
    </Box>
    {!isValidRange(shift) && (
      <Typography variant="caption" color="error" display="block" sx={{ mt: 0.5 }}>
        La jornada debe terminar después de empezar.
      </Typography>
    )}
  </Box>
);

/** Franjas en las que una usuaria puede recibir la visita (vacío = cualquier hora) */
export const AvailabilityEditor: React.FC<{
  ranges: TimeRange[];
  onChange: (ranges: TimeRange[]) => void;
  serviceMinutes: number;
}> = ({ ranges, onChange, serviceMinutes }) => {
  const addRange = () => {
    // Nueva franja a continuación de la última, de la duración de una visita
    const last = ranges[ranges.length - 1];
    const start = last ? Math.min(last.end + 60, 23 * 60) : 9 * 60;
    onChange([...ranges, { start, end: Math.min(start + serviceMinutes, 24 * 60 - 1) }]);
  };
  return (
    <Box sx={{ pt: 1, pb: 0.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {ranges.map((range, index) => (
        <Box key={index} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <RangeFields
            range={range}
            onChange={(next) => onChange(ranges.map((r, i) => (i === index ? next : r)))}
            startLabel="Desde"
            endLabel="Hasta"
          />
          <IconButton
            aria-label={`quitar franja ${index + 1}`}
            onClick={() => onChange(ranges.filter((_, i) => i !== index))}
            sx={{ width: 40, height: 40, color: 'text.secondary' }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>
        {ranges.length === 0
          ? 'Sin franjas: puede a cualquier hora de la jornada.'
          : `La visita (${serviceMinutes} min) debe caber entera en una franja. Si solo puede a las 9, pon 09:00–10:00.`}
      </Typography>
      {ranges.length < 4 && (
        <Button size="small" startIcon={<AddIcon />} onClick={addRange} sx={{ alignSelf: 'flex-start' }}>
          Añadir franja
        </Button>
      )}
    </Box>
  );
};

/** Duraciones habituales para elegir (minutos) */
const DURATION_CHOICES = [15, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300, 360, 480];

/** Cuánto dura la visita de esta usuaria: botón siempre visible en la tarjeta; se recuerda */
export const DurationPicker: React.FC<{
  value: number;
  defaultMinutes: number;
  onChange: (minutes: number) => void;
}> = ({ value, defaultMinutes, onChange }) => {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const choices = DURATION_CHOICES.includes(value) ? DURATION_CHOICES : [...DURATION_CHOICES, value].sort((a, b) => a - b);
  return (
    <>
      <Button
        size="small"
        startIcon={<TimerOutlinedIcon sx={{ fontSize: '16px !important' }} />}
        onClick={(event) => setAnchor(event.currentTarget)}
        aria-haspopup="menu"
        aria-label={`duración de la visita: ${formatDuration(value)}`}
        color={value === defaultMinutes ? 'inherit' : 'secondary'}
        sx={{
          minHeight: 32,
          px: 0.75,
          ml: -0.75,
          fontSize: '0.75rem',
          fontWeight: value === defaultMinutes ? 500 : 700,
          color: value === defaultMinutes ? 'text.secondary' : undefined,
        }}
      >
        Duración: {formatDuration(value)}
      </Button>
      <Menu anchorEl={anchor} open={anchor != null} onClose={() => setAnchor(null)} sx={{ zIndex: 1400 }}>
        <MenuItem disabled sx={{ fontSize: '0.75rem', opacity: '1 !important', color: 'text.secondary' }}>
          Duración de la visita
        </MenuItem>
        {choices.map((minutes) => (
          <MenuItem
            key={minutes}
            selected={minutes === value}
            onClick={() => {
              onChange(minutes);
              setAnchor(null);
            }}
            sx={{ minHeight: 40 }}
          >
            {formatDuration(minutes)}
            {minutes === defaultMinutes ? ' (por defecto)' : ''}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

/** Hora de inicio fijada a mano; manda sobre las franjas de la usuaria */
export const FixedTimeEditor: React.FC<{
  value: number | null;
  /** Hora propuesta al fijarla (p. ej. la que tiene ahora en el horario) */
  suggested: number;
  onChange: (minutes: number | null) => void;
}> = ({ value, suggested, onChange }) => (
  <Box sx={{ pt: 1, display: 'flex', gap: 1, alignItems: 'center' }}>
    {value == null ? (
      <Button size="small" variant="outlined" onClick={() => onChange(suggested)} sx={{ minHeight: 36 }}>
        Fijar hora de la visita
      </Button>
    ) : (
      <>
        <TextField
          {...timeFieldProps}
          label="Hora fija"
          value={formatMinutes(value)}
          onChange={(event) => {
            const minutes = parseTime(event.target.value);
            if (minutes != null) onChange(minutes);
          }}
        />
        <Button size="small" onClick={() => onChange(null)} sx={{ minHeight: 36, whiteSpace: 'nowrap' }}>
          Quitar hora fija
        </Button>
      </>
    )}
  </Box>
);


function formatOptionDetail(option: ScheduleOption): string {
  const km = (option.distance_m / 1000).toFixed(1);
  const idle = option.idle_min > 0 ? `espera ${option.idle_min} min` : 'sin esperas';
  return (
    `${km} km · sale ${formatMinutes(option.departure)} · ` +
    `termina ${formatMinutes(option.finish_time)} · ${idle}`
  );
}

/** "1 visita llega tarde · +20 min de jornada", o null si todo va a tiempo */
function formatOptionDelays(option: ScheduleOption): string | null {
  const lateCount = option.visits.filter((v) => v.late > 0).length;
  const parts = [
    lateCount > 0 ? `${lateCount} ${lateCount === 1 ? 'visita llega' : 'visitas llegan'} tarde` : null,
    option.overtime_min > 0 ? `+${option.overtime_min} min de jornada` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Fila "Tu orden": el orden que tenía la trabajadora al pulsar Organizar */
export interface OwnOrderRow {
  /** Su horario; null si no se pudo calcular */
  option: ScheduleOption | null;
  selected: boolean;
  onSelect: () => void;
  /** Ver su recorrido en el mapa sin aplicarlo */
  onPreview?: () => void;
}

const OptionRow: React.FC<{
  label: string;
  option: ScheduleOption | null;
  selected: boolean;
  onClick: () => void;
  onPreview?: () => void;
}> = ({ label, option, selected, onClick, onPreview }) => (
  <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 0.5, mb: 0.75 }}>
    <ListItemButton
      selected={selected}
      onClick={onClick}
      sx={{
        borderRadius: 1,
        border: 1,
        borderColor: selected ? 'primary.main' : 'divider',
        minHeight: 48,
      }}
    >
      <ListItemText
        primary={label}
        secondary={
          option ? (
            <>
              {formatOptionDetail(option)}
              {formatOptionDelays(option) && (
                <Typography component="span" variant="caption" display="block" sx={{ color: 'warning.dark' }}>
                  {formatOptionDelays(option)}
                </Typography>
              )}
            </>
          ) : (
            'Las visitas en el orden en que las tenías'
          )
        }
        primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
        secondaryTypographyProps={{ variant: 'caption' }}
      />
    </ListItemButton>
    {onPreview && (
      <IconButton
        aria-label={`ver ${label} en el mapa`}
        title="Ver en el mapa"
        onClick={onPreview}
        sx={{ width: 44, flexShrink: 0, borderRadius: 1, border: 1, borderColor: 'divider', color: 'text.secondary' }}
      >
        <MapOutlinedIcon fontSize="small" />
      </IconButton>
    )}
  </Box>
);

/** Opciones de horario para que la trabajadora elija una, más volver a su orden */
export const ScheduleOptions: React.FC<{
  options: ScheduleOption[];
  selected: number | null;
  onSelect: (index: number) => void;
  own?: OwnOrderRow | null;
  /** Opción que coincide con el orden de la trabajadora */
  ownMatchIndex?: number | null;
  /** Ver el recorrido de una opción en el mapa sin aplicarla */
  onPreview?: (index: number) => void;
}> = ({ options, selected, onSelect, own, ownMatchIndex, onPreview }) => (
  <List dense disablePadding sx={{ mt: 1 }}>
    {own && (
      <OptionRow
        label="Tu orden"
        option={own.option}
        selected={own.selected}
        onClick={own.onSelect}
        onPreview={own.onPreview}
      />
    )}
    {options.map((option, index) => (
      <OptionRow
        key={option.order.join(',')}
        label={
          formatOptionGoals(option) + (ownMatchIndex === index ? ' · Tu orden' : '')
        }
        option={option}
        selected={selected === index}
        onClick={() => onSelect(index)}
        onPreview={onPreview ? () => onPreview(index) : undefined}
      />
    ))}
  </List>
);

const UNSCHEDULED_REASONS: Record<UnscheduledVisit['reason'], string> = {
  no_fit: 'su horario coincide con el de otras visitas',
  no_window: 'su horario no coincide con la jornada',
  no_room: 'no queda hueco en la jornada',
};

/** Aviso de visitas imposibles de encajar hoy (no por llegar tarde), con el motivo */
export const UnscheduledAlert: React.FC<{
  items: { stop: VisitPlanPoint; reason: UnscheduledVisit['reason'] }[];
}> = ({ items }) => {
  if (items.length === 0) return null;
  return (
    <Alert severity="warning" sx={{ mt: 1.25, fontSize: '0.75rem' }}>
      {items.length === 1
        ? 'Esta visita no se puede encajar hoy'
        : `${items.length} visitas no se pueden encajar hoy`}
      ; hay que organizarlas para otro día:
      <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
        {items.map(({ stop, reason }, index) => (
          <li key={`${stop.userId ?? stop.lat}-${index}`}>
            {stop.label} ({UNSCHEDULED_REASONS[reason]})
          </li>
        ))}
      </Box>
    </Alert>
  );
};

/** Visitas apartadas para otro día; se pueden volver a añadir a la ruta */
export const PostponedList: React.FC<{
  stops: VisitPlanPoint[];
  onRestore: (index: number) => void;
  canRestore: boolean;
}> = ({ stops, onRestore, canRestore }) => {
  if (stops.length === 0) return null;
  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography
        variant="caption"
        fontWeight={600}
        color="text.secondary"
        sx={{ letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: '0.65rem' }}
      >
        Para otro día
      </Typography>
      <List dense disablePadding>
        {stops.map((stop, index) => (
          <ListItem
            key={`${stop.userId ?? stop.lat}-${index}`}
            sx={{ minHeight: 40, px: 0 }}
            secondaryAction={
              <IconButton
                edge="end"
                aria-label={`volver a añadir ${stop.label}`}
                disabled={!canRestore}
                onClick={() => onRestore(index)}
                sx={{ width: 40, height: 40, color: 'text.secondary' }}
              >
                <UndoIcon fontSize="small" />
              </IconButton>
            }
          >
            <ListItemText primary={stop.label} primaryTypographyProps={{ variant: 'body2' }} />
          </ListItem>
        ))}
      </List>
    </Box>
  );
};
