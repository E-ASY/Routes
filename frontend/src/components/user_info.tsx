import React from 'react';
import { AuthUser } from '../services/auth';
import {
  Avatar,
  Box,
  Button,
  Typography,
} from '@mui/material';
import { LogoutRounded } from '@mui/icons-material';

interface UserInfoPanelProps {
  user: AuthUser | null;
  onLogout: () => void;
}

const UserInfoPanel: React.FC<UserInfoPanelProps> = ({ user, onLogout }) => {
  const getInitials = () => {
    if (user?.name) return user.name.charAt(0).toUpperCase();
    if (user?.email) return user.email.charAt(0).toUpperCase();
    return 'U';
  };

  return (
    <Box
      className="UserInfo-compact"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        py: 0.5,
      }}
    >
      {user?.picture ? (
        <Avatar
          src={user.picture}
          alt={user?.name || 'Profile'}
          sx={{ width: 40, height: 40 }}
        />
      ) : (
        <Avatar
          sx={{
            width: 40,
            height: 40,
            bgcolor: 'rgba(30, 58, 76, 0.1)',
            color: 'primary.main',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {getInitials()}
        </Avatar>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600} noWrap sx={{ letterSpacing: '-0.01em' }}>
          {user?.name || 'Usuario'}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap display="block">
          {user?.email || 'Sesión activa'}
        </Typography>
      </Box>
      <Button
        variant="text"
        color="inherit"
        size="small"
        startIcon={<LogoutRounded sx={{ fontSize: 18 }} />}
        onClick={onLogout}
        sx={{
          flexShrink: 0,
          minHeight: 40,
          px: 1.25,
          color: 'text.secondary',
          fontWeight: 500,
          '&:hover': { color: 'error.main', bgcolor: 'rgba(180, 35, 24, 0.06)' },
        }}
      >
        Salir
      </Button>
    </Box>
  );
};

export default UserInfoPanel;
