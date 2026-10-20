import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';

interface MapStripProps {
  /** Línea principal, p. ej. "Ana López · 4 visitas · 32 km" */
  title?: string | null;
  /** Instrucción o aviso */
  message: string;
  /** Aviso importante (se resalta en ámbar) */
  warning?: boolean;
  actionLabel: string;
  onAction: () => void;
  /** Segunda acción opcional, p. ej. "Quitar" */
  secondaryLabel?: string;
  onSecondary?: () => void;
}

const actionSx = {
  flexShrink: 0,
  minHeight: 40,
  px: 1.5,
  fontWeight: 700,
  color: 'inherit',
  bgcolor: 'rgba(128, 128, 128, 0.2)',
  '&:hover': { bgcolor: 'rgba(128, 128, 128, 0.3)' },
} as const;

/**
 * Franja sobre la barra inferior con el siguiente paso, visible mientras el panel está
 * cerrado: así se puede tocar el mapa sin perder la guía ni los avisos.
 */
const MapStrip: React.FC<MapStripProps> = ({
  title,
  message,
  warning = false,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}) => (
  <Box
    role="status"
    aria-live="polite"
    sx={(theme) => ({
      position: 'fixed',
      left: '50%',
      transform: 'translateX(-50%)',
      bottom: 'calc(68px + env(safe-area-inset-bottom, 0px))',
      zIndex: 1290,
      width: 'min(100% - 16px, 400px)',
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      gap: 1,
      pl: 1.5,
      pr: 0.75,
      py: 0.75,
      borderRadius: '14px',
      backgroundColor: warning ? alpha(theme.palette.warning.light, 0.96) : 'rgba(20, 50, 60, 0.92)',
      color: warning ? theme.palette.warning.contrastText : '#f2f7f5',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      boxShadow: '0 8px 24px rgba(12, 32, 38, 0.22)',
    })}
  >
    <Box sx={{ flex: 1, minWidth: 0 }}>
      {title && (
        <Typography variant="body2" fontWeight={700} noWrap sx={{ fontSize: '0.82rem', lineHeight: 1.3 }}>
          {title}
        </Typography>
      )}
      <Typography variant="caption" display="block" sx={{ lineHeight: 1.35, opacity: 0.92 }}>
        {message}
      </Typography>
    </Box>
    {secondaryLabel && onSecondary && (
      <Button size="small" onClick={onSecondary} sx={{ ...actionSx, bgcolor: 'transparent' }}>
        {secondaryLabel}
      </Button>
    )}
    <Button size="small" onClick={onAction} sx={actionSx}>
      {actionLabel}
    </Button>
  </Box>
);

export default MapStrip;
