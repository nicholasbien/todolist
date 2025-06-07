import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const logout = async () => {
    try {
      if (token) {
        // Call logout endpoint to invalidate token on server
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
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
    }
  };

  const verifyToken = async (tokenToVerify) => {
    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${tokenToVerify}`
        }
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        setToken(tokenToVerify);
      } else {
        // Token is invalid, clear it
        logout();
      }
    } catch (error) {
      console.error('Token verification failed:', error);
      logout();
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
        setToken(storedToken);
        setUser(JSON.parse(storedUser));

        // Verify token is still valid
        await verifyToken(storedToken);
      } else {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, [mounted]);

  const signup = async (email) => {
    try {
      const response = await fetch(`${API_URL}/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (response.ok) {
        return { success: true, message: data.message };
      } else {
        return { success: false, error: data.detail || 'Signup failed' };
      }
    } catch (error) {
      return { success: false, error: 'Network error during signup' };
    }
  };

  const login = async (email, code) => {
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
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

        return { success: true };
      } else {
        return { success: false, error: data.detail || 'Login failed' };
      }
    } catch (error) {
      return { success: false, error: 'Network error during login' };
    }
  };

  // Helper function to make authenticated API calls
  const authenticatedFetch = useCallback(async (url, options = {}) => {
    if (!token) {
      throw new Error('No authentication token available');
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    // If token is invalid, logout
    if (response.status === 401) {
      logout();
      throw new Error('Authentication expired');
    }

    return response;
  }, [token, logout]);

  const value = {
    user,
    token,
    isLoading: !mounted || isLoading,
    isAuthenticated: mounted && !!token && !!user,
    signup,
    login,
    logout,
    authenticatedFetch
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
