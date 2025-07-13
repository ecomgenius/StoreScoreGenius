import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiRequest } from '@/lib/queryClient';

export interface User {
  id: number;
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  isAdmin: boolean;
  credits: number;
  subscriptionStatus: 'trial' | 'active' | 'canceled' | 'past_due' | 'incomplete';
  trialEndsAt: string | null;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<any>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const userData = await apiRequest('GET', '/api/auth/me');
      setUser(userData.user);
    } catch (error) {
      // Not authenticated, which is fine
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const userData = await apiRequest('POST', '/api/auth/login', { email, password });
    setUser(userData.user);
  };

  const register = async (email: string, password: string, name?: string) => {
    const [firstName, lastName] = (name || '').split(' ');
    const userData = await apiRequest('POST', '/api/auth/register', { 
      email, 
      password, 
      firstName: firstName || 'User',
      lastName: lastName || 'Name'
    });
    setUser(userData.user);
    return userData; // Return the full response including needsOnboarding
  };

  const logout = async () => {
    try {
      await apiRequest('POST', '/api/auth/logout', {});
    } finally {
      setUser(null);
    }
  };

  const value = {
    user,
    login,
    register,
    logout,
    isAuthenticated: !!user,
    isLoading,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};