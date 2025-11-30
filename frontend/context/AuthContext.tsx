import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { apiRequest } from '../utils/api';

interface AuthContextValue {
  user: any;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  authExpired: boolean;
  signup: (email: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  login: (email: string, code: string) => Promise<{ success: boolean; error?: string }>;
  logout: (expired?: boolean) => Promise<void> | void;
  clearAuthExpired: () => void;
  authenticatedFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [authExpired, setAuthExpired] = useState(false);


  const logout = async (expired: boolean = false): Promise<void> => {
    try {
      if (token) {
        // Call logout endpoint to invalidate token on server
        await apiRequest('auth/logout', {
          method: 'POST'
        });
      }
    } catch (error) {
      console.error('Logout API call failed:', error);
    } finally {
      // Clear local storage and state regardless of API call result
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
      }
      setToken(null);
      setUser(null);
      if (expired) {
        setAuthExpired(true);
      }
    }
  };

  const verifyToken = async (tokenToVerify: string) => {
    try {
      const response = await apiRequest('auth/me', {
        headers: {
          'Authorization': `Bearer ${tokenToVerify}`
        }
      });

      if (response.ok) {
        const userData = await response.json();
        // Validate that we got user data with expected fields
        if (userData && (userData.id || userData._id || userData.user_id) && userData.email) {
          setUser(userData);
          setToken(tokenToVerify);
          console.log('✅ Token verified successfully');
        } else {
          console.error('Invalid user data structure:', userData);
          logout(true);
        }
      } else {
        console.error('Token verification failed with status:', response.status);
        // Only set authExpired for 401 errors (actual auth issues)
        // For other errors (500, network issues), just clear state without showing expired message
        if (response.status === 401) {
          logout(true);
        } else {
          logout(false);
        }
      }
    } catch (error) {
      console.error('Token verification error:', error);
      // Network errors shouldn't show "session expired" message
      logout(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Set mounted state on client-side
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load token from localStorage on mount (client-side only)
  useEffect(() => {
    if (!mounted) return;

    const initializeAuth = async () => {
      const storedToken = localStorage.getItem('auth_token');
      const storedUser = localStorage.getItem('auth_user');

      if (storedToken && storedUser) {
        const userData = JSON.parse(storedUser);
        setToken(storedToken);
        setUser(userData);

        // Sync auth to service worker IndexedDB for offline access
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
          const userId = userData.id || userData._id || userData.user_id;
          navigator.serviceWorker.controller.postMessage({
            type: 'SET_AUTH',
            token: storedToken,
            userId: userId
          });
          console.log('📤 Synced auth to service worker IndexedDB');
        }

        // Only verify token if online - offline should trust stored credentials
        if (navigator.onLine) {
          console.log('🌐 Online: Verifying stored token...');
          await verifyToken(storedToken);
        } else {
          console.log('📴 Offline: Trusting stored token without verification');
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, [mounted]);

  const signup = async (email: string): Promise<{ success: boolean; message?: string; error?: string }> => {
    try {
      const response = await apiRequest('auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (response.ok) {
        return { success: true, message: data.message };
      } else {
        return { success: false, error: data?.detail || 'Signup failed' };
      }
    } catch (error) {
      console.error('Signup error:', error);
      return { success: false, error: 'Network error during signup' };
    }
  };

  const login = async (email: string, code: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await apiRequest('auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, code })
      });

      const data = await response.json();

      if (response.ok) {
        const { token: newToken, user: userData } = data;

        // Store in localStorage (client-side only)
        if (typeof window !== 'undefined') {
          localStorage.setItem('auth_token', newToken);
          localStorage.setItem('auth_user', JSON.stringify(userData));
        }

        // Update state
        setToken(newToken);
        setUser(userData);
        setAuthExpired(false);

        // Sync auth to service worker IndexedDB for offline access
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
          const userId = userData.id || userData._id || userData.user_id;
          navigator.serviceWorker.controller.postMessage({
            type: 'SET_AUTH',
            token: newToken,
            userId: userId
          });
          console.log('📤 Synced auth to service worker IndexedDB after login');
        }

        return { success: true };
      } else {
        return { success: false, error: data.detail || 'Login failed' };
      }
    } catch (error) {
      return { success: false, error: 'Network error during login' };
    }
  };

  // Helper function to make authenticated API calls
  const authenticatedFetch = useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
    // Use apiRequest which handles environment-specific routing
    const response = await apiRequest(url, {
      ...options,
      headers: {
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...options.headers
      }
    });

    // If token is invalid, logout
    if (response.status === 401) {
      logout(true);
      throw new Error('Authentication expired');
    }

    return response;
  }, [token, logout]);

  const value: AuthContextValue = {
    user,
    token,
    isLoading: !mounted || isLoading,
    isAuthenticated: mounted && !!token && !!user,
    authExpired,
    signup,
    login,
    logout,
    clearAuthExpired: () => setAuthExpired(false),
    authenticatedFetch
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
