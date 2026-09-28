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
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { LegsResult, VisitPlanPoint } from '../services/map_service';

interface VisitPlanPanelProps {
  planningMode: boolean;
  onPlanningModeChange: (enabled: boolean) => void;
  origin: VisitPlanPoint | null;
  stops: VisitPlanPoint[];
  legs: LegsResult | null;
  legsLoading: boolean;
  legsError: string | null;
  onRemoveStop: (index: number) => void;
  onRemoveLast: () => void;
  onClear: () => void;
  onClearOrigin: () => void;
}

function formatPersonLabel(point: VisitPlanPoint): string {
  return point.label || `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`;
}

const VisitPlanPanel: React.FC<VisitPlanPanelProps> = ({
  planningMode,
  onPlanningModeChange,
  origin,
  stops,
  legs,
  legsLoading,
  legsError,
  onRemoveStop,
  onRemoveLast,
  onClear,
  onClearOrigin,
}) => {
  const hint = !planningMode
    ? 'Activa el modo para fijar partida y ordenar visitas.'
    : !origin
      ? 'Toca el mapa, una usuaria o la trabajadora para la partida.'
      : 'Toca usuarias para añadir visitas (1, 2, 3…).';

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

      {planningMode && (
        <>
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
                primaryTypographyProps={{
                  variant: 'caption',
                  fontWeight: 600,
                  color: 'text.secondary',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  fontSize: '0.65rem',
                }}
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
          </List>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
            {legsLoading && <CircularProgress size={14} thickness={4} />}
            {legs && !legsLoading && (
              <Typography variant="body2" fontWeight={600} sx={{ letterSpacing: '-0.01em' }}>
                Total {legs.total_distance_km.toFixed(1)} km
              </Typography>
            )}
          </Box>
          {legsError && (
            <Alert severity="warning" sx={{ mt: 1.25, py: 0, fontSize: '0.75rem' }}>
              {legsError}
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
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
              color="inherit"
              disabled={!origin && stops.length === 0}
              onClick={onClear}
              sx={{
                minHeight: 42,
                flex: 1,
                fontSize: '0.85rem',
                color: 'text.secondary',
                borderColor: 'divider',
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
