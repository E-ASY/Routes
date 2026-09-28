import React, { createContext, useContext } from 'react';
import { AuthUser } from '../../services/auth';

export interface AuthSessionValue {
  user: AuthUser | null;
  onLogout: () => void;
}

const AuthSessionContext = createContext<AuthSessionValue | null>(null);

export const AuthSessionProvider: React.FC<{
  value: AuthSessionValue;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>
);

export function useAuthSession(): AuthSessionValue {
  const ctx = useContext(AuthSessionContext);
  if (!ctx) {
    throw new Error('useAuthSession must be used within AuthSessionProvider');
  }
  return ctx;
}
