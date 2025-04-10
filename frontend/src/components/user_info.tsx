import React from 'react';
import { AuthUser } from '../services/auth';
import { 
  Avatar, 
  Box, 
  Button, 
  Card, 
  CardContent, 
  Divider,
  Paper, 
  Typography, 
  Zoom 
} from '@mui/material';
import { LogoutRounded } from '@mui/icons-material';

interface UserInfoPanelProps {
  user: AuthUser | null;
  onLogout: () => void;
}

const UserInfoPanel: React.FC<UserInfoPanelProps> = ({ user, onLogout }) => {
  const getInitials = () => {
    if (user?.name) return user.name.charAt(0);
    if (user?.email) return user.email.charAt(0);
    return 'U';
  };

  return (
    <Zoom in={true} style={{ transitionDelay: '100ms' }}>
      <Paper
        elevation={6}
        sx={{
          position: 'fixed',
          bottom: '70px',
          right: '16px',
          left: 'auto',
          zIndex: 999999,
          borderRadius: 2,
          overflow: 'hidden',
          minWidth: '280px',
          maxWidth: '320px',
          pointerEvents: 'auto',
        }}
      >
        <Card>
          <Box 
            sx={{ 
              p: 2, 
              background: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)',
              display: 'flex',
              alignItems: 'center',
              color: 'white'
            }}
          >
            {user?.picture ? (
              <Avatar 
                src={user.picture}
                alt={user?.name || 'Profile'} 
                sx={{ 
                  width: 50, 
                  height: 50, 
                  border: '2px solid white',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                }}
              />
            ) : (
              <Avatar 
                sx={{ 
                  width: 50, 
                  height: 50, 
                  bgcolor: '#1565C0', 
                  color: 'white',
                  fontWeight: 'bold',
                  border: '2px solid white',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                }}
              >
                {getInitials()}
              </Avatar>
            )}
            <Box ml={2}>
              <Typography variant="h6" fontWeight="bold" noWrap>
                {user?.name || 'Usuario'}
              </Typography>
              <Typography variant="body2" noWrap>
                {user?.email || 'Usuario autenticado'}
              </Typography>
            </Box>
          </Box>
          
          <Divider />
          
          <CardContent sx={{ p: 2 }}>
            <Button
              variant="contained"
              color="error"
              startIcon={<LogoutRounded />}
              onClick={onLogout}
              fullWidth
              sx={{ 
                mt: 1,
                fontWeight: 'medium',
                textTransform: 'none',
                boxShadow: 2
              }}
            >
              Cerrar sesión
            </Button>
          </CardContent>
        </Card>
      </Paper>
    </Zoom>
  );
};

export default UserInfoPanel;