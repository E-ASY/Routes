import React from 'react';
import { List, ListItem, ListItemText, ListItemIcon, Paper } from '@mui/material';
import CircleIcon from '@mui/icons-material/Circle';
import { Worker } from '../services/map_service';

interface LegendProps {
  workersInfo: Worker[];
}

const Legend: React.FC<LegendProps> = ({ workersInfo }) => {
  if (!workersInfo || workersInfo.length === 0) return null;

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
        {workersInfo.map((info, index) => (
          <ListItem key={String(info.id)} divider>
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
