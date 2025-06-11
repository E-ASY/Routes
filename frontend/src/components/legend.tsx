import React from 'react';
import { List, ListItem, ListItemText, ListItemIcon, Paper } from '@mui/material';
import CircleIcon from '@mui/icons-material/Circle';

import { mapsService } from '../services/map_service';

interface LegendProps {
  workers: string[];
}

const Legend: React.FC<LegendProps> = ({ workers }) => {
  const [infoWorkers, setInfoWorkers] = React.useState<any[]>([]);

  React.useEffect(() => {
    if (workers.length > 0) {
      const fetchWorkers = async () => {
        const data = await mapsService.getWorkersById(workers);
        setInfoWorkers(data);
      };
      fetchWorkers();
    }
  }, [workers]);

  if (workers.length === 0) return null; // Ocultar si no hay trabajadores

  const staticColors = [
    '#66C5CC', '#F6CF71', '#F89C74', '#DCB0F2', '#87C55F',
    '#9EB9F3', '#FE88B1', '#C9DB74', '#8BE0A4', '#B497E7',
    '#D3B484', '#B3B3B3',
  ];

  return (
    <Paper
      sx={{
        padding: 2,
        maxWidth: 300,
        maxHeight: 300,
        overflowY: 'auto'
      }}
      className='Legend-container'
    >
      <List>
        {infoWorkers.map((info, index) => (
          <ListItem key={index} divider>
            <ListItemIcon>
              <CircleIcon sx={{ color: staticColors[index % staticColors.length], fontSize: 20 }} />
            </ListItemIcon>
            <ListItemText
              primary={`${info.name} ${info.ape_1} ${info.ape_2}`}
              secondary={
                <>
                  <span>CIF: {info.cif}</span>
                  <br />
                  <span>Disponibilidad: {info.disponibilidad ?? 'N/A'} h</span>
                </>
              }
              slotProps={{ primary: { sx: { fontSize: '1rem', fontWeight: '500' } }, secondary: { sx: { fontSize: '0.875rem' } } }}
            />
          </ListItem>
        ))}
      </List>
    </Paper>
  );
};

export default Legend;
