import { createTheme } from '@mui/material';

/** Coastal atlas — ink + sage mist (no blanco plano, no purple). */
export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#14323c',
      light: '#2a5160',
      dark: '#0b1f26',
      contrastText: '#f2f7f5',
    },
    secondary: {
      main: '#2f7a6a',
      light: '#4a9a88',
      dark: '#1f5549',
      contrastText: '#f2f7f5',
    },
    error: {
      main: '#b42318',
    },
    success: {
      main: '#2f6f4e',
    },
    text: {
      primary: '#12262e',
      secondary: '#4d646c',
    },
    background: {
      default: '#d8e4e1',
      paper: '#e8f0ed',
    },
    divider: 'rgba(20, 50, 60, 0.12)',
  },
  typography: {
    fontFamily: '"Outfit", "Source Sans 3", sans-serif',
    h4: { fontWeight: 600, letterSpacing: '-0.03em' },
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: '0.01em' },
    body2: { letterSpacing: '0.01em' },
    caption: { letterSpacing: '0.02em' },
  },
  shape: { borderRadius: 12 },
  breakpoints: {
    values: { xs: 0, sm: 600, md: 900, lg: 1200, xl: 1536 },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          boxShadow: 'none',
          '&:hover': { boxShadow: 'none' },
        },
        outlined: {
          borderColor: 'rgba(20, 50, 60, 0.18)',
          backgroundColor: 'rgba(255, 255, 255, 0.28)',
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.45)',
            borderColor: 'rgba(20, 50, 60, 0.28)',
          },
        },
        contained: {
          backgroundImage: 'linear-gradient(165deg, #1a4452 0%, #14323c 55%, #0f2a33 100%)',
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { borderRadius: 10 },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          '&.Mui-checked': { color: '#2f7a6a' },
          '&.Mui-checked + .MuiSwitch-track': { backgroundColor: '#2f7a6a' },
        },
      },
    },
    MuiListItem: {
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },
  },
});
