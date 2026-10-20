import React from 'react';
import { Box, Button, Typography } from '@mui/material';

interface ErrorBoundaryState {
  failed: boolean;
}

/**
 * Si la interfaz falla, en vez de una página en blanco muestra un aviso con "Recargar".
 * El plan está guardado en el navegador, así que recargar no lo pierde.
 */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Error en la interfaz:', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Box
        role="alert"
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1.5,
          px: 3,
          textAlign: 'center',
          bgcolor: 'var(--mist)',
          color: 'var(--text)',
        }}
      >
        <Typography variant="h6" fontWeight={700}>
          Algo ha fallado
        </Typography>
        <Typography variant="body2" sx={{ maxWidth: 360, color: 'var(--muted)', lineHeight: 1.5 }}>
          Recarga la página para seguir. El plan está guardado y se recuperará.
        </Typography>
        <Button variant="contained" disableElevation onClick={() => window.location.reload()} sx={{ minHeight: 44 }}>
          Recargar
        </Button>
      </Box>
    );
  }
}

export default ErrorBoundary;
