import React from 'react';
import { List, ListItem, ListItemText, ListItemIcon, Box, Typography, Divider } from '@mui/material';
import CircleIcon from '@mui/icons-material/Circle';
import { MileageByWorker, Worker } from '../services/map_service';

interface LegendProps {
  workersInfo: Worker[];
  mileageByWorker?: MileageByWorker | null;
}

function formatKm(mileageByWorker: MileageByWorker | null | undefined, workerId: string): string {
  const entry = mileageByWorker?.[String(workerId)];
  if (!entry || entry.legs_with_distance <= 0) {
    return '—';
  }
  return `${entry.distance_km.toFixed(1)} km`;
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
        Color = usuaria · Rojo = trabajadora
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
                primary={`${info.name} ${info.ape_1} ${info.ape_2}`}
                secondary={
                  <Box component="span" sx={{ display: 'block', mt: 0.2 }}>
                    <Typography component="span" variant="caption" color="text.secondary" display="block">
                      {info.disponibilidad ?? 'N/A'} h · {formatKm(mileageByWorker, String(info.id))}
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
