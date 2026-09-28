import React, { useState } from 'react';
import {
  Box,
  Drawer,
  IconButton,
  SwipeableDrawer,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import FilterListRoundedIcon from '@mui/icons-material/FilterListRounded';
import RouteRoundedIcon from '@mui/icons-material/RouteRounded';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import SyncRoundedIcon from '@mui/icons-material/SyncRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { useAuthSession } from './auth/session_context';
import UserInfoPanel from './user_info';

export type ChromeSheet = 'filters' | 'plan' | 'legend' | 'data' | 'account' | null;

interface AppChromeProps {
  filters: React.ReactNode;
  plan: React.ReactNode;
  legend: React.ReactNode;
  data: React.ReactNode;
  children: React.ReactNode;
  planningActive?: boolean;
}

const NAV_ITEMS: {
  id: Exclude<ChromeSheet, null>;
  label: string;
  icon: React.ReactNode;
}[] = [
  { id: 'filters', label: 'Filtros', icon: <FilterListRoundedIcon fontSize="inherit" /> },
  { id: 'plan', label: 'Plan', icon: <RouteRoundedIcon fontSize="inherit" /> },
  { id: 'legend', label: 'Leyenda', icon: <LayersOutlinedIcon fontSize="inherit" /> },
  { id: 'data', label: 'Datos', icon: <SyncRoundedIcon fontSize="inherit" /> },
  { id: 'account', label: 'Cuenta', icon: <PersonOutlineRoundedIcon fontSize="inherit" /> },
];

const SHEET_TITLES: Record<Exclude<ChromeSheet, null>, string> = {
  filters: 'Trabajadoras',
  plan: 'Planificar',
  legend: 'Leyenda',
  data: 'Datos',
  account: 'Cuenta',
};

const SURFACE =
  'linear-gradient(165deg, rgba(236, 244, 241, 0.96) 0%, rgba(220, 232, 228, 0.97) 48%, rgba(210, 224, 220, 0.98) 100%)';

const AppChrome: React.FC<AppChromeProps> = ({
  filters,
  plan,
  legend,
  data,
  children,
  planningActive = false,
}) => {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const { user, onLogout } = useAuthSession();
  const [sheet, setSheet] = useState<ChromeSheet>(null);

  const openSheet = (next: ChromeSheet) => {
    setSheet((prev) => (prev === next ? null : next));
  };

  const closeSheet = () => setSheet(null);

  const panels: Record<Exclude<ChromeSheet, null>, React.ReactNode> = {
    filters,
    plan,
    legend,
    data,
    account: <UserInfoPanel user={user} onLogout={onLogout} />,
  };

  const sheetHeader = sheet ? (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1,
        mb: 1.25,
      }}
    >
      <Typography
        variant="overline"
        sx={{
          letterSpacing: '0.14em',
          color: 'text.secondary',
          fontWeight: 700,
          fontSize: '0.68rem',
          lineHeight: 1.2,
        }}
      >
        {SHEET_TITLES[sheet]}
      </Typography>
      <IconButton
        size="small"
        aria-label="Cerrar"
        onClick={closeSheet}
        sx={{
          color: 'text.secondary',
          bgcolor: 'rgba(20, 50, 60, 0.06)',
          '&:hover': { bgcolor: 'rgba(20, 50, 60, 0.1)' },
        }}
      >
        <CloseRoundedIcon fontSize="small" />
      </IconButton>
    </Box>
  ) : null;

  // Mantener todos los paneles montados para no perder estado (p. ej. filtros)
  const panelBody = (
    <Box className="AppChrome-sheetBody">
      {sheetHeader}
      {(Object.keys(panels) as Exclude<ChromeSheet, null>[]).map((id) => (
        <Box
          key={id}
          sx={{ display: sheet === id ? 'block' : 'none' }}
          aria-hidden={sheet !== id}
        >
          {panels[id]}
        </Box>
      ))}
    </Box>
  );

  return (
    <Box className="AppChrome" sx={{ position: 'relative', width: '100%', minHeight: '100vh' }}>
      <Box className="AppChrome-mapArea">{children}</Box>

      {/* Móvil / tablet: sheet inferior compacto */}
      {!isDesktop && (
        <SwipeableDrawer
          anchor="bottom"
          open={sheet != null}
          onClose={closeSheet}
          onOpen={() => undefined}
          disableSwipeToOpen
          ModalProps={{ keepMounted: true }}
          BackdropProps={{
            sx: { backgroundColor: 'rgba(12, 32, 38, 0.28)' },
          }}
          PaperProps={{
            className: 'AppChrome-sheet AppChrome-sheet--mobile',
            elevation: 0,
            sx: {
              left: 8,
              right: 8,
              width: 'auto',
              maxWidth: 420,
              mx: 'auto',
              borderRadius: '18px 18px 14px 14px',
              maxHeight: 'min(68vh, 560px)',
              mb: 'calc(62px + env(safe-area-inset-bottom, 0px))',
              zIndex: 1250,
              backgroundImage: SURFACE,
              border: '1px solid rgba(20, 50, 60, 0.1)',
              boxShadow: '0 12px 40px rgba(12, 32, 38, 0.18)',
              overflow: 'hidden',
            },
          }}
          sx={{ zIndex: 1250 }}
        >
          <Box sx={{ px: 2, pt: 1, pb: 1.5 }}>
            <Box
              sx={{
                width: 28,
                height: 3,
                borderRadius: 999,
                bgcolor: 'rgba(20, 50, 60, 0.16)',
                mx: 'auto',
                mb: 1.25,
              }}
            />
            {panelBody}
          </Box>
        </SwipeableDrawer>
      )}

      {/* Desktop: panel lateral estrecho */}
      {isDesktop && (
        <Drawer
          anchor="right"
          open={sheet != null}
          onClose={closeSheet}
          ModalProps={{ keepMounted: true }}
          BackdropProps={{
            sx: { backgroundColor: 'rgba(12, 32, 38, 0.18)' },
          }}
          PaperProps={{
            className: 'AppChrome-sheet AppChrome-sheet--desktop',
            elevation: 0,
            sx: {
              width: 360,
              maxWidth: '92vw',
              m: 1.5,
              height: 'calc(100% - 24px)',
              borderRadius: '16px',
              backgroundImage: SURFACE,
              border: '1px solid rgba(20, 50, 60, 0.1)',
              boxShadow: '0 16px 48px rgba(12, 32, 38, 0.16)',
              zIndex: 1250,
            },
          }}
          sx={{ zIndex: 1250 }}
        >
          <Box sx={{ px: 2.25, pt: 2, pb: 2, height: '100%', boxSizing: 'border-box' }}>
            {panelBody}
          </Box>
        </Drawer>
      )}

      <Box
        className="AppChrome-bar"
        sx={{
          position: 'fixed',
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
          zIndex: 1300,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 0.15,
          width: 'min(100% - 16px, 400px)',
          px: 0.5,
          py: 0.35,
          borderRadius: '16px',
          backgroundImage:
            'linear-gradient(180deg, rgba(236, 244, 241, 0.94) 0%, rgba(214, 228, 224, 0.96) 100%)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          border: '1px solid rgba(20, 50, 60, 0.12)',
          boxShadow: '0 10px 28px rgba(12, 32, 38, 0.16)',
        }}
      >
        {NAV_ITEMS.map((item) => {
          const selected = sheet === item.id;
          const planAccent = item.id === 'plan' && planningActive;
          return (
            <Box
              key={item.id}
              component="button"
              type="button"
              onClick={() => openSheet(item.id)}
              aria-label={item.label}
              aria-pressed={selected}
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.15,
                minHeight: 46,
                maxWidth: 76,
                border: 0,
                cursor: 'pointer',
                borderRadius: '12px',
                bgcolor: selected ? 'rgba(20, 50, 60, 0.1)' : 'transparent',
                color: selected || planAccent ? 'secondary.dark' : 'text.secondary',
                transition: 'background-color 0.15s ease, color 0.15s ease',
                '&:active': { bgcolor: 'rgba(20, 50, 60, 0.12)' },
              }}
            >
              <Box
                component="span"
                sx={{
                  display: 'flex',
                  lineHeight: 0,
                  fontSize: 20,
                  color: selected || planAccent ? 'secondary.main' : 'inherit',
                }}
              >
                {item.icon}
              </Box>
              <Typography
                component="span"
                sx={{
                  fontSize: '0.58rem',
                  fontWeight: selected ? 700 : 500,
                  letterSpacing: '0.03em',
                  lineHeight: 1,
                  color: 'inherit',
                }}
              >
                {item.label}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default AppChrome;
