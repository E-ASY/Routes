import React, { useEffect, useState } from 'react';
import { authService, AuthUser } from '../../services/auth';
import UserInfoPanel from '../user_info';
import { 
  Box, 
  Button, 
  Card,
  CardContent,
  CircularProgress, 
  Fade,
  ThemeProvider,
  Typography,
  createTheme
} from '@mui/material';
import { Login as LoginIcon } from '@mui/icons-material';

// Create a custom theme
const theme = createTheme({
  palette: {
    primary: {
      main: '#2196F3',
      light: '#64B5F6',
      dark: '#1976D2',
    },
    secondary: {
      main: '#FF4081',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 600,
    },
    button: {
      textTransform: 'none',
      fontWeight: 500,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
  },
});

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
          sx={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)'
          }}
        >
          <CircularProgress size={60} thickness={4} />
          <Typography variant="h6" sx={{ mt: 3, fontWeight: 'medium', color: '#3f51b5' }}>
            Verificando autenticación...
          </Typography>
        </Box>
      ) : !isAuthenticated ? (
        <Box 
          sx={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)'
          }}
        >
          <Fade in={true} timeout={800}>
            <Card 
              elevation={8} 
              sx={{ 
                maxWidth: 400, 
                width: '90%',
                borderRadius: 3, 
                overflow: 'hidden',
                boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
              }}
            >
              <Box 
                sx={{ 
                  bgcolor: 'primary.main', 
                  py: 3, 
                  display: 'flex', 
                  justifyContent: 'center',
                  alignItems: 'center',
                  color: 'white'
                }}
              >
                <Typography variant="h4" align="center">
                  Bienvenido
                </Typography>
              </Box>
              
              <CardContent sx={{ py: 4, px: 3 }}>
                <Typography variant="body1" align="center" sx={{ mb: 4 }}>
                  Es necesario iniciar sesión para acceder al sistema.
                </Typography>
                
                <Button
                  variant="contained"
                  color="primary"
                  size="large"
                  fullWidth
                  startIcon={<LoginIcon />}
                  onClick={() => authService.login()}
                  sx={{ 
                    py: 1.5,
                    boxShadow: '0 4px 12px rgba(33, 150, 243, 0.4)',
                    '&:hover': {
                      boxShadow: '0 6px 14px rgba(33, 150, 243, 0.6)',
                      transform: 'translateY(-1px)'
                    },
                    transition: 'all 0.2s ease-in-out'
                  }}
                >
                  Iniciar sesión
                </Button>
              </CardContent>
            </Card>
          </Fade>
        </Box>
      ) : (
        <>
          <Box 
            className="relative" 
            sx={{ 
              width: '100%', 
              height: '100%',
              minHeight: '100vh',
              bgcolor: 'background.default'
            }}
          >
            {children}
          </Box>
          <UserInfoPanel user={user} onLogout={handleLogout} />
        </>
      )}
    </ThemeProvider>
  );
};

export default AuthGuard;