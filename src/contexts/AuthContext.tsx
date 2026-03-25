import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  User, Session, getSession, setSession, clearSession, getUserById,
  getUserByEmail, createUser, updateUser, updateSessionActivity,
} from '@/lib/storage';
import { toast } from '@/hooks/use-toast';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, rememberMe: boolean) => { success: boolean; error?: string };
  signup: (fullName: string, email: string, password: string) => { success: boolean; error?: string };
  logout: () => void;
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(() => {
    const session = getSession();
    if (session) {
      const u = getUserById(session.userId);
      if (u) {
        setUser(u);
        updateSessionActivity();
      } else {
        clearSession();
        setUser(null);
      }
    } else {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshUser();
    setIsLoading(false);
  }, [refreshUser]);

  // Activity tracker for session timeout
  useEffect(() => {
    if (!user) return;
    const handler = () => updateSessionActivity();
    window.addEventListener('click', handler);
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('click', handler);
      window.removeEventListener('keydown', handler);
    };
  }, [user]);

  // Check session timeout periodically
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      const s = getSession();
      if (!s) {
        setUser(null);
        toast({ title: 'Session expired', description: 'You have been logged out due to inactivity.', variant: 'destructive' });
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [user]);

  const login = (email: string, password: string, rememberMe: boolean) => {
    const u = getUserByEmail(email);
    if (!u) return { success: false, error: 'No account found with this email.' };

    // Check lockout
    if (u.lockedUntil) {
      const lockEnd = new Date(u.lockedUntil).getTime();
      if (Date.now() < lockEnd) {
        const mins = Math.ceil((lockEnd - Date.now()) / 60000);
        return { success: false, error: `Account locked. Try again in ${mins} minute(s).` };
      } else {
        updateUser(u.id, { loginAttempts: 0, lockedUntil: null });
        u.loginAttempts = 0;
        u.lockedUntil = null;
      }
    }

    if (u.password !== password) {
      const attempts = (u.loginAttempts || 0) + 1;
      const updates: Partial<User> = { loginAttempts: attempts };
      if (attempts >= 5) {
        updates.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        updateUser(u.id, updates);
        return { success: false, error: 'Too many failed attempts. Account locked for 15 minutes.' };
      }
      updateUser(u.id, updates);
      return { success: false, error: `Invalid password. ${5 - attempts} attempts remaining.` };
    }

    // Reset attempts on success
    updateUser(u.id, { loginAttempts: 0, lockedUntil: null });

    const session: Session = {
      userId: u.id,
      email: u.email,
      fullName: u.fullName,
      rememberMe,
      lastActivity: new Date().toISOString(),
    };
    setSession(session);
    setUser(u);
    return { success: true };
  };

  const signup = (fullName: string, email: string, password: string) => {
    if (getUserByEmail(email)) {
      return { success: false, error: 'An account with this email already exists.' };
    }
    const u = createUser(fullName, email, password);
    const session: Session = {
      userId: u.id,
      email: u.email,
      fullName: u.fullName,
      rememberMe: false,
      lastActivity: new Date().toISOString(),
    };
    setSession(session);
    setUser(u);
    return { success: true };
  };

  const logout = () => {
    clearSession();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
