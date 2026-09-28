import React, { useEffect, useState } from 'react';
import { authService, AuthUser } from '../../services/auth';
import { AuthSessionProvider } from './session_context';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Fade,
  ThemeProvider,
  Typography,
} from '@mui/material';
import { Login as LoginIcon } from '@mui/icons-material';
import { theme } from '../../theme';

interface AuthGuardProps {
  children: React.ReactNode;
}

const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        setIsLoading(true);
        const { isAuthenticated, user } = await authService.checkAuthenticated();
        setIsAuthenticated(isAuthenticated);
        setUser(user || null);
      } catch (error) {
        console.error('Error checking authentication:', error);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  const handleLogout = () => {
    authService.logout();
  };

  return (
    <ThemeProvider theme={theme}>
      {isLoading ? (
        <Box
          className="AuthScreen"
          sx={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <CircularProgress size={36} thickness={3} color="primary" />
          <Typography variant="body2" sx={{ mt: 2.5, color: 'text.secondary' }}>
            Verificando sesión…
          </Typography>
        </Box>
      ) : !isAuthenticated ? (
        <Box
          className="AuthScreen"
          sx={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            px: 2,
          }}
        >
          <Fade in={true} timeout={500}>
            <Card
              elevation={0}
              sx={{
                maxWidth: 360,
                width: '100%',
                borderRadius: '18px',
                border: '1px solid rgba(20, 50, 60, 0.1)',
                backgroundImage:
                  'linear-gradient(165deg, rgba(242, 248, 245, 0.95) 0%, rgba(224, 236, 232, 0.98) 100%)',
                boxShadow: '0 20px 48px rgba(12, 32, 38, 0.14)',
              }}
            >
              <Box sx={{ px: 3, pt: 3.5, pb: 0.5 }}>
                <Typography
                  variant="overline"
                  sx={{ letterSpacing: '0.16em', color: 'secondary.dark', fontWeight: 700 }}
                >
                  ACUFADE
                </Typography>
                <Typography variant="h4" sx={{ mt: 0.35, fontSize: '1.85rem', color: 'primary.main' }}>
                  Routes
                </Typography>
              </Box>

              <CardContent sx={{ pt: 1.5, px: 3, pb: 3.25 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2.75, lineHeight: 1.55 }}>
                  Inicia sesión para ver el mapa y planificar visitas.
                </Typography>

                <Button
                  variant="contained"
                  color="primary"
                  size="large"
                  fullWidth
                  startIcon={<LoginIcon />}
                  onClick={() => authService.login()}
                  sx={{ py: 1.25 }}
                >
                  Iniciar sesión
                </Button>
              </CardContent>
            </Card>
          </Fade>
        </Box>
      ) : (
        <AuthSessionProvider value={{ user, onLogout: handleLogout }}>
          <Box
            className="relative"
            sx={{
              width: '100%',
              height: '100%',
              minHeight: '100vh',
              bgcolor: 'transparent',
            }}
          >
            {children}
          </Box>
        </AuthSessionProvider>
      )}
    </ThemeProvider>
  );
};

export default AuthGuard;
