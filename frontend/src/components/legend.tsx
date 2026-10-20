import React from 'react';
import { List, ListItem, ListItemText, ListItemIcon, Box, Typography, Divider } from '@mui/material';
import CircleIcon from '@mui/icons-material/Circle';
import { MileageByWorker, Worker } from '../services/map_service';
import { formatPersonName } from '../services/person_name';

interface LegendProps {
  workersInfo: Worker[];
  mileageByWorker?: MileageByWorker | null;
}

function formatKm(mileageByWorker: MileageByWorker | null | undefined, workerId: string): string | null {
  const entry = mileageByWorker?.[String(workerId)];
  if (!entry || entry.legs_with_distance <= 0) {
    return null;
  }
  return `${entry.distance_km.toFixed(1)} km de ruta`;
}

/** Horas disponibles de la trabajadora; null si Velneo no trae el dato */
function formatHours(value: number | string | undefined): string | null {
  const hours = typeof value === 'number' ? value : Number(value);
  if (value == null || value === '' || !Number.isFinite(hours)) return null;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1).replace('.', ',')} h disponibles`;
}

const Legend: React.FC<LegendProps> = ({ workersInfo, mileageByWorker }) => {
  if (!workersInfo || workersInfo.length === 0) return null;

  const staticColors = [
    '#66C5CC', '#F6CF71', '#F89C74', '#DCB0F2', '#87C55F',
    '#9EB9F3', '#FE88B1', '#C9DB74', '#8BE0A4', '#B497E7',
    '#D3B484', '#B3B3B3',
  ];

  return (
    <Box className="Legend-container" sx={{ width: '100%' }}>
      <Typography
        variant="caption"
        color="text.secondary"
        display="block"
        sx={{ mb: 1, lineHeight: 1.4 }}
      >
        Cada color es una trabajadora y sus usuarias. La casa marca su domicilio.
      </Typography>
      <List disablePadding>
        {workersInfo.map((info, index) => (
          <React.Fragment key={String(info.id)}>
            {index > 0 && <Divider component="li" sx={{ borderColor: 'divider' }} />}
            <ListItem sx={{ px: 0, py: 0.85, alignItems: 'flex-start' }}>
              <ListItemIcon sx={{ minWidth: 22, mt: 0.45 }}>
                <CircleIcon sx={{ color: staticColors[index % staticColors.length], fontSize: 10 }} />
              </ListItemIcon>
              <ListItemText
                primary={formatPersonName(info.name, info.ape_1, info.ape_2)}
                secondary={
                  <Box component="span" sx={{ display: 'block', mt: 0.2 }}>
                    <Typography component="span" variant="caption" color="text.secondary" display="block">
                      {[formatHours(info.disponibilidad), formatKm(mileageByWorker, String(info.id))]
                        .filter(Boolean)
                        .join(' · ')}
                    </Typography>
                  </Box>
                }
                primaryTypographyProps={{
                  sx: { fontSize: '0.86rem', fontWeight: 600, letterSpacing: '-0.01em' },
                }}
              />
            </ListItem>
          </React.Fragment>
        ))}
      </List>
    </Box>
  );
};

export default Legend;
