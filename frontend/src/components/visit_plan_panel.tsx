import React from 'react';
import {
  Box,
  Button,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Switch,
  FormControlLabel,
  Typography,
  CircularProgress,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  MenuItem,
  TextField,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteSweepOutlinedIcon from '@mui/icons-material/DeleteSweepOutlined';
import { alpha } from '@mui/material/styles';
import { LegsResult, PlanFinish, PlanOptimization, VisitPlanPoint } from '../services/map_service';
import { MAX_GOOGLE_MAPS_WAYPOINTS, buildGoogleMapsLinks } from '../services/google_maps_link';

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
  optimization: PlanOptimization | null;
  optimizeLoading: boolean;
  optimizeError: string | null;
  onOptimize: () => void;
  onRemoveStop: (index: number) => void;
  onRemoveLast: () => void;
  onClear: () => void;
  onClearOrigin: () => void;
}

function formatPersonLabel(point: VisitPlanPoint): string {
  return point.label || `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`;
}

/** "Antes → Ahora": km Google si se conocen ambos; si no, línea recta. */
function formatOptimization(
  optimization: PlanOptimization,
  legs: LegsResult | null,
  legsLoading: boolean
): string {
  if (!optimization.changed) {
    return 'Este orden ya es el más corto.';
  }
  if (optimization.kmBefore != null && legs && !legsLoading) {
    const before = optimization.kmBefore;
    const after = legs.total_distance_km;
    const saved = before - after;
    const pct = before > 0 ? Math.round((saved / before) * 100) : 0;
    return saved > 0
      ? `Antes ${before.toFixed(1)} km → Ahora ${after.toFixed(1)} km (−${pct} %)`
      : `Antes ${before.toFixed(1)} km → Ahora ${after.toFixed(1)} km por carretera`;
  }
  return (
    `En línea recta: ${optimization.straightKmBefore.toFixed(1)} km → ` +
    `${optimization.straightKmAfter.toFixed(1)} km`
  );
}

type CopyStatus = 'idle' | 'copied' | 'error';

/** Texto para enviar a la trabajadora: un enlace, o uno por tramo si no caben las paradas */
function formatLinksForCopy(links: string[]): string {
  return links.length === 1 ? links[0] : links.map((link, i) => `Tramo ${i + 1}: ${link}`).join('\n');
}

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
  optimization,
  optimizeLoading,
  optimizeError,
  onOptimize,
  onRemoveStop,
  onRemoveLast,
  onClear,
  onClearOrigin,
}) => {
  const hint = !planningMode
    ? 'Activa el modo para fijar partida y ordenar visitas.'
    : workerOptions.length === 0
      ? 'Selecciona trabajadoras en Filtros para planificar.'
      : !planWorkerId
        ? 'Elige a qué trabajadora planificar.'
        : !origin
      ? 'Toca el mapa, una usuaria o la trabajadora para la partida.'
      : originEditable
        ? 'Toca otro sitio o la trabajadora para mover la partida, o una usuaria para la visita 1.'
        : endEditable
          ? end
            ? 'Toca usuarias para añadir visitas, o el mapa o la trabajadora para mover la llegada.'
            : 'Toca usuarias para añadir visitas y, al acabar, el mapa o la trabajadora para la llegada.'
          : 'Toca usuarias para añadir visitas (1, 2, 3…).';
  const returnToStart = finish === 'start';
  // Último tramo: la vuelta (to_index 0) o el tramo hasta la llegada
  const lastLegKm =
    legs && legs.legs.length > stops.length ? legs.legs[legs.legs.length - 1]?.distance_km ?? null : null;
  const lastStopLabel = stops.length > 0 ? String(stops.length) : 'Partida';
  // Recorrido en orden para Google Maps; sin enlace mientras falte la llegada
  const mapsLinks =
    origin && stops.length > 0 && !(finish === 'custom' && !end)
      ? buildGoogleMapsLinks([
          origin,
          ...stops,
          ...(finish === 'start' ? [origin] : end ? [end] : []),
        ])
      : [];
  const [copyStatus, setCopyStatus] = React.useState<CopyStatus>('idle');
  React.useEffect(() => {
    if (copyStatus === 'idle') return;
    const timer = window.setTimeout(() => setCopyStatus('idle'), 2000);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);
  const handleCopyLinks = async () => {
    try {
      await navigator.clipboard.writeText(formatLinksForCopy(mapsLinks));
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  };
  const sectionLabelProps = {
    variant: 'caption',
    fontWeight: 600,
    color: 'text.secondary',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    fontSize: '0.65rem',
  } as const;

  return (
    <Box className="VisitPlan-container" sx={{ p: 0, width: '100%' }}>
      <FormControlLabel
        control={
          <Switch
            checked={planningMode}
            onChange={(_, checked) => onPlanningModeChange(checked)}
            size="small"
          />
        }
        label={
          <Typography variant="body2" fontWeight={700} sx={{ letterSpacing: '-0.01em', fontSize: '0.9rem' }}>
            Modo planificación
          </Typography>
        }
        sx={{ minHeight: 40, ml: 0, width: '100%', justifyContent: 'space-between', mr: 0 }}
        labelPlacement="start"
      />
      <Typography
        variant="caption"
        color="text.secondary"
        display="block"
        sx={{ mb: 1.25, lineHeight: 1.4 }}
      >
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

      {planningMode && (
        <>
          <Typography variant="body2" sx={{ mb: 0.75 }}>
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
          <Divider sx={{ my: 1.25, borderColor: 'divider' }} />
          <List dense disablePadding sx={{ maxHeight: '32vh', overflowY: 'auto' }}>
            <ListItem
              sx={{ minHeight: 48, px: 0 }}
              secondaryAction={
                origin ? (
                  <IconButton
                    edge="end"
                    aria-label="cambiar partida"
                    onClick={onClearOrigin}
                    sx={{ width: 40, height: 40, color: 'text.secondary' }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                ) : null
              }
            >
              <ListItemText
                primary="Partida"
                secondary={origin ? formatPersonLabel(origin) : 'Pendiente'}
                primaryTypographyProps={sectionLabelProps}
                secondaryTypographyProps={{ variant: 'body2', color: 'text.primary' }}
              />
            </ListItem>
            {stops.map((stop, index) => {
              const legKm = legs?.legs?.[index]?.distance_km;
              const prevLabel = index === 0 ? 'Partida' : String(index);
              return (
                <ListItem
                  key={`${stop.userId ?? stop.lat}-${index}`}
                  sx={{ minHeight: 48, px: 0 }}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      aria-label={`quitar visita ${index + 1}`}
                      onClick={() => onRemoveStop(index)}
                      sx={{ width: 40, height: 40, color: 'text.secondary' }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={`${index + 1}`}
                    secondary={
                      <>
                        {formatPersonLabel(stop)}
                        {legKm != null && (
                          <Typography
                            component="span"
                            variant="caption"
                            display="block"
                            sx={{ color: 'text.secondary', mt: 0.25 }}
                          >
                            {prevLabel} → {index + 1} · {legKm.toFixed(1)} km
                          </Typography>
                        )}
                      </>
                    }
                    primaryTypographyProps={{
                      variant: 'caption',
                      fontWeight: 700,
                      color: 'primary.main',
                      fontSize: '0.8rem',
                    }}
                    secondaryTypographyProps={{ variant: 'body2' }}
                  />
                </ListItem>
              );
            })}
            {returnToStart && origin && stops.length > 0 && (
              <ListItem sx={{ minHeight: 48, px: 0 }}>
                <ListItemText
                  primary="Vuelta"
                  secondary={
                    <>
                      {formatPersonLabel(origin)}
                      {lastLegKm != null && (
                        <Typography
                          component="span"
                          variant="caption"
                          display="block"
                          sx={{ color: 'text.secondary', mt: 0.25 }}
                        >
                          {stops.length} → Partida · {lastLegKm.toFixed(1)} km
                        </Typography>
                      )}
                    </>
                  }
                  primaryTypographyProps={sectionLabelProps}
                  secondaryTypographyProps={{ variant: 'body2', color: 'text.primary' }}
                />
              </ListItem>
            )}
            {finish === 'custom' && origin && (
              <ListItem
                sx={{ minHeight: 48, px: 0 }}
                secondaryAction={
                  end ? (
                    <IconButton
                      edge="end"
                      aria-label="cambiar llegada"
                      onClick={onClearEnd}
                      sx={{ width: 40, height: 40, color: 'text.secondary' }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  ) : null
                }
              >
                <ListItemText
                  primary="Llegada"
                  secondary={
                    end ? (
                      <>
                        {formatPersonLabel(end)}
                        {lastLegKm != null && (
                          <Typography
                            component="span"
                            variant="caption"
                            display="block"
                            sx={{ color: 'text.secondary', mt: 0.25 }}
                          >
                            {lastStopLabel} → Llegada · {lastLegKm.toFixed(1)} km
                          </Typography>
                        )}
                      </>
                    ) : (
                      stops.length > 0
                        ? 'Pendiente: toca el mapa o la trabajadora'
                        : 'Pendiente: primero añade visitas'
                    )
                  }
                  primaryTypographyProps={sectionLabelProps}
                  secondaryTypographyProps={{ variant: 'body2', color: 'text.primary' }}
                />
              </ListItem>
            )}
          </List>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
            {legsLoading && <CircularProgress size={14} thickness={4} />}
            {legs && !legsLoading && (
              <Typography variant="body2" fontWeight={600} sx={{ letterSpacing: '-0.01em' }}>
                Total {legs.total_distance_km.toFixed(1)} km
                {legs.return_to_start ? ' (con vuelta)' : end ? ' (hasta la llegada)' : ''}
              </Typography>
            )}
          </Box>
          {legsError && (
            <Alert severity="warning" sx={{ mt: 1.25, py: 0, fontSize: '0.75rem' }}>
              {legsError}
            </Alert>
          )}

          <Button
            variant="contained"
            disableElevation
            startIcon={
              optimizeLoading ? <CircularProgress size={14} thickness={4} color="inherit" /> : <AutoFixHighIcon />
            }
            disabled={!origin || stops.length < 2 || optimizeLoading}
            onClick={onOptimize}
            fullWidth
            sx={{ minHeight: 42, mt: 2, fontSize: '0.85rem' }}
          >
            Optimizar orden
          </Button>
          {optimization && (
            <Typography
              variant="caption"
              display="block"
              sx={{ mt: 0.75, color: 'text.secondary', lineHeight: 1.4 }}
            >
              {formatOptimization(optimization, legs, legsLoading)}
            </Typography>
          )}
          {optimizeError && (
            <Alert severity="warning" sx={{ mt: 1.25, py: 0, fontSize: '0.75rem' }}>
              {optimizeError}
            </Alert>
          )}

          {mapsLinks.length > 0 && (
            <>
              {mapsLinks.length > 1 && (
                <Typography
                  variant="caption"
                  display="block"
                  sx={{ mt: 1.5, color: 'text.secondary', lineHeight: 1.4 }}
                >
                  Google Maps admite {MAX_GOOGLE_MAPS_WAYPOINTS} paradas por enlace: la ruta va en{' '}
                  {mapsLinks.length} tramos seguidos.
                </Typography>
              )}
              <Box sx={{ display: 'flex', gap: 1, mt: mapsLinks.length > 1 ? 0.75 : 1.5, flexWrap: 'wrap' }}>
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
              <Button
                variant="text"
                startIcon={<ContentCopyIcon />}
                onClick={handleCopyLinks}
                fullWidth
                color={copyStatus === 'error' ? 'warning' : 'primary'}
                sx={{ minHeight: 40, mt: 0.5, fontSize: '0.85rem' }}
              >
                {copyStatus === 'copied'
                  ? 'Copiado'
                  : copyStatus === 'error'
                    ? 'No se pudo copiar'
                    : mapsLinks.length === 1
                      ? 'Copiar enlace para la trabajadora'
                      : 'Copiar enlaces para la trabajadora'}
              </Button>
            </>
          )}

          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            <Button
              variant="outlined"
              disabled={stops.length === 0}
              onClick={onRemoveLast}
              sx={{ minHeight: 42, flex: 1, fontSize: '0.85rem' }}
            >
              Quitar última
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteSweepOutlinedIcon />}
              disabled={!origin && stops.length === 0}
              onClick={onClear}
              sx={{
                minHeight: 42,
                flex: 1,
                fontSize: '0.85rem',
                fontWeight: 600,
                // Rojo suave en reposo; más intenso al pasar por encima (acción destructiva)
                borderColor: (theme) => alpha(theme.palette.error.main, 0.45),
                bgcolor: (theme) => alpha(theme.palette.error.main, 0.06),
                transition: 'background-color 150ms ease, border-color 150ms ease, color 150ms ease',
                '&:hover': {
                  borderColor: 'error.main',
                  bgcolor: (theme) => alpha(theme.palette.error.main, 0.12),
                },
                '&:active': {
                  bgcolor: (theme) => alpha(theme.palette.error.main, 0.18),
                },
                '&:focus-visible': {
                  outline: (theme) => `2px solid ${alpha(theme.palette.error.main, 0.5)}`,
                  outlineOffset: 2,
                },
                '&.Mui-disabled': {
                  bgcolor: 'transparent',
                  borderColor: 'divider',
                },
              }}
            >
              Limpiar
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
};

export default VisitPlanPanel;
