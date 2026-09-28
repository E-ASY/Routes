import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { mapsService } from '../services/map_service';

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return 'Sin datos cargados aún';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('es-ES', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

interface DataRefreshProps {
  /** Tras un refresh OK: vaciar viewport en cliente para forzar recarga */
  onRefreshed?: () => void;
}

const DataRefresh: React.FC<DataRefreshProps> = ({ onRefreshed }) => {
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const status = await mapsService.getDataStatus();
      setUpdatedAt(status.updated_at);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('No se pudo leer la fecha de actualización');
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleRefresh = async () => {
    if (refreshing) return;
    const confirmed = window.confirm(
      'Se volverán a descargar los datos desde Velneo. ' +
        'Afecta a todos los usuarios y puede tardar un minuto. ¿Continuar?'
    );
    if (!confirmed) return;

    setRefreshing(true);
    setError(null);
    setInfo(null);
    try {
      const result = await mapsService.refreshSnapshot();
      setUpdatedAt(result.updated_at);
      setInfo('Datos actualizados. Vuelve a seleccionar trabajadoras si el mapa no se refresca solo.');
      onRefreshed?.();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Error al refrescar');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Box
      className="DataRefresh-container"
      sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, width: '100%' }}
    >
      <Button
        variant="outlined"
        color="primary"
        startIcon={refreshing ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
        onClick={handleRefresh}
        disabled={refreshing}
        sx={{ minHeight: 40, justifyContent: 'flex-start' }}
      >
        {refreshing ? 'Actualizando…' : 'Actualizar datos'}
      </Button>
      <Box>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 600 }}>
          Última actualización
        </Typography>
        <Typography variant="body2" sx={{ lineHeight: 1.4 }}>
          {loadingStatus ? '…' : formatUpdatedAt(updatedAt)}
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45 }}>
        Afecta a todos los usuarios de la aplicación.
      </Typography>
      {error && (
        <Alert severity="error" sx={{ py: 0, fontSize: '0.75rem' }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {info && (
        <Alert severity="success" sx={{ py: 0, fontSize: '0.75rem' }} onClose={() => setInfo(null)}>
          {info}
        </Alert>
      )}
      {refreshing && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircularProgress size={14} thickness={4} />
          <Typography variant="caption" color="text.secondary">Descargando…</Typography>
        </Box>
      )}
    </Box>
  );
};

export default DataRefresh;
