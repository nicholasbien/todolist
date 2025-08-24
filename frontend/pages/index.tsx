import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { useOffline } from '../context/OfflineContext';
import dynamic from 'next/dynamic';
import Head from 'next/head';

const AIToDoListApp = dynamic(() => import('../components/AIToDoListApp'), {
  ssr: false,
  loading: () => (
    <div className="container mx-auto p-4 max-w-md">
      <div className="animate-pulse">Loading...</div>
    </div>
  )
});

interface LoginFormProps {
  onLogin: (user: any, token: string) => void;
}

function LoginForm({ onLogin }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [step, setStep] = useState('email'); // 'email', 'code', 'name'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [needsName, setNeedsName] = useState(false);

  useEffect(() => {
    if (router.isReady && typeof router.query.email === 'string') {
      setEmail(router.query.email);
    }
  }, [router.isReady, router.query.email]);


  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter an email address');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (response.ok) {
        setStep('code');
        // setMessage('Verification code sent! Check your email.');
      } else {
        setError(data.detail || 'Signup failed');
      }
    } catch (error) {
      setError('Network error during signup');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('Please enter the verification code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, code })
      });

      const data = await response.json();

      if (response.ok) {
        const { token, user } = data;

        localStorage.setItem('auth_token', token);
        localStorage.setItem('auth_user', JSON.stringify(user));

        // Check if user needs to set their name
        if (!user.first_name) {
          setNeedsName(true);
          setStep('name');
        } else {
          onLogin(user, token);
        }
      } else {
        setError(data.detail || 'Login failed');
      }
    } catch (error) {
      setError('Network error during login');
    } finally {
      setLoading(false);
    }
  };

  const handleNameSubmit = async (e) => {
    e.preventDefault();
    if (!firstName.trim()) {
      setError('Please enter your first name');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/auth/update-name', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ first_name: firstName })
      });

      const data = await response.json();

      if (response.ok) {
        const updatedUser = data.user;
        localStorage.setItem('auth_user', JSON.stringify(updatedUser));
        onLogin(updatedUser, token);
      } else {
        setError(data.detail || 'Failed to update name');
      }
    } catch (error) {
      setError('Network error during name update');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToEmail = () => {
    setStep('email');
    setCode('');
    setError('');
    setMessage('');
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-black border border-gray-800 rounded-xl shadow-2xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-100 mb-2">todolist.nyc</h1>
          <p className="text-gray-400">
            {step === 'email'
              ? 'Enter your email to get started'
              : step === 'code'
              ? 'Enter the verification code sent to your email'
              : 'What should we call you?'
            }
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded-lg">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {message && step !== 'name' && (
          <div className="mb-4 p-3 bg-green-900/20 border border-green-800 rounded-lg">
            <p className="text-green-300 text-sm">{message}</p>
          </div>
        )}

        {step === 'email' ? (
          <form onSubmit={handleEmailSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-700 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent outline-none bg-gray-900 text-gray-100 placeholder-gray-500"
                placeholder="Enter your email"
                disabled={loading}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-white py-2 px-4 rounded-lg hover:bg-accent-dark focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Sending Code...' : 'Send Verification Code'}
            </button>
          </form>
        ) : step === 'code' ? (
          <form onSubmit={handleCodeSubmit} className="space-y-6">
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-2">
                Verification Code
              </label>
              <input
                type="text"
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent outline-none text-center text-lg font-mono"
                placeholder="000000"
                disabled={loading}
                required
                maxLength={6}
              />
              <p className="text-sm text-gray-500 mt-1">
                Code sent to: <span className="font-medium">{email}</span>
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-white py-2 px-4 rounded-lg hover:bg-accent-dark focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Verifying...' : 'Sign In'}
            </button>

            <button
              type="button"
              onClick={handleBackToEmail}
              className="w-full bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors"
            >
              ← Back to Email
            </button>
          </form>
        ) : (
          <form onSubmit={handleNameSubmit} className="space-y-6">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-2">
                First Name
              </label>
              <input
                type="text"
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent outline-none"
                placeholder="Enter your first name"
                disabled={loading}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-white py-2 px-4 rounded-lg hover:bg-accent-dark focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Saving...' : 'Continue'}
            </button>
          </form>
        )}

      </div>
    </div>
  );
}

export default function Home() {
  const [isClient, setIsClient] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showEmailSettings, setShowEmailSettings] = useState(false);
  const [contactMessage, setContactMessage] = useState('');
  const [sendingContact, setSendingContact] = useState(false);
  const [showOfflineTooltip, setShowOfflineTooltip] = useState(false);
  const settingsDropdownRef = useRef(null);
  const isOffline = useOffline();

  useEffect(() => {
    setIsClient(true);

    const checkAuth = () => {
      const storedToken = localStorage.getItem('auth_token');
      const storedUser = localStorage.getItem('auth_user');

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
      setIsChecking(false);
    };

    checkAuth();
    // OfflineProvider handles network status updates
  }, []);

  useEffect(() => {
    if (showOfflineTooltip) {
      const timer = setTimeout(() => setShowOfflineTooltip(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showOfflineTooltip]);

  useEffect(() => {
    if (!isOffline) {
      setShowOfflineTooltip(false);
    }
  }, [isOffline]);

  // Handle click outside settings dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (settingsDropdownRef.current && !settingsDropdownRef.current.contains(event.target)) {
        setShowSettingsDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogin = (userData, userToken) => {
    setUser(userData);
    setToken(userToken);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setUser(null);
    setToken(null);
    setIsAuthenticated(false);
  };

  const handleSendContact = async () => {
    if (!contactMessage.trim()) return;

    try {
      setSendingContact(true);

      const response = await fetch('/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: contactMessage.trim() }),
      });

      if (response.ok) {
        setContactMessage('');
        setShowContactModal(false);
      }
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setSendingContact(false);
    }
  };

  if (!isClient || isChecking) {
    return (
      <>
        <Head>
          <title>todolist.nyc</title>
        </Head>
        <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
          <div className="animate-pulse">Loading...</div>
        </main>
      </>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <Head>
          <title>todolist.nyc</title>
        </Head>
        <LoginForm onLogin={handleLogin} />
      </>
    );
  }

  return (
    <>
      <Head>
        <title>todolist.nyc</title>
      </Head>
      <main className="min-h-screen bg-zinc-950 text-white">
        <div className="container mx-auto p-4 max-w-md">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">todolist.nyc</h1>
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              {isOffline && (
                <div className="relative mr-2">
                  <button
                    onClick={() => setShowOfflineTooltip(true)}
                    title="Offline"
                    className="focus:outline-none"
                  >
                    📴
                  </button>
                  {showOfflineTooltip && (
                    <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-64 bg-gray-800 text-gray-100 text-xs p-2 rounded-lg shadow-lg z-10">
                      {"You're offline. Todos will be synced when you're back online."}
                    </div>
                  )}
                </div>
              )}
              <span className="text-sm text-gray-400">Hello, {user?.first_name || user?.email}</span>
            </div>
            <div className="relative" ref={settingsDropdownRef}>
              <button
                onClick={() => setShowSettingsDropdown(!showSettingsDropdown)}
                className="text-accent hover:text-accent-light text-lg w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                title="Settings"
              >
                ⚙️
              </button>

              {showSettingsDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-black border border-gray-800 rounded-lg shadow-2xl z-50">
                  <button
                    onClick={() => {
                      setShowSettingsDropdown(false);
                      setShowEmailSettings(true);
                    }}
                    className="w-full text-left px-4 py-3 text-gray-300 hover:bg-gray-900 hover:text-gray-100 transition-colors rounded-t-lg"
                  >
                    Email Settings
                  </button>
                  <button
                    onClick={() => {
                      setShowSettingsDropdown(false);
                      setShowContactModal(true);
                    }}
                    className="w-full text-left px-4 py-3 text-gray-300 hover:bg-gray-900 hover:text-gray-100 transition-colors"
                  >
                    Contact
                  </button>
                  <button
                    onClick={() => {
                      setShowSettingsDropdown(false);
                      handleLogout();
                    }}
                    className="w-full text-left px-4 py-3 text-red-400 hover:bg-red-900/20 hover:text-red-300 transition-colors rounded-b-lg"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <AIToDoListApp
          user={user}
          token={token}
          showEmailSettings={showEmailSettings}
          onShowEmailSettings={() => setShowEmailSettings(true)}
          onCloseEmailSettings={() => setShowEmailSettings(false)}
        />

        {/* Contact Modal */}
        {showContactModal && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-black border border-gray-800 p-6 rounded-xl w-96 space-y-4 shadow-2xl">
              <h3 className="text-gray-100 text-lg font-bold mb-2">Contact Us</h3>
              <textarea
                value={contactMessage}
                onChange={(e) => setContactMessage(e.target.value)}
                placeholder="Ask for a new feature... Report a bug... Say hi!"
                className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 placeholder-gray-500 h-32 resize-none focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <div className="flex justify-center space-x-3">
                <button
                  onClick={handleSendContact}
                  disabled={sendingContact || !contactMessage.trim()}
                  className="bg-accent hover:bg-accent-light disabled:bg-accent-dark disabled:text-gray-400 text-white px-6 py-2 rounded-lg transition-colors"
                >
                  {sendingContact ? 'Sending...' : 'Send'}
                </button>
                <button
                  onClick={() => {
                    setShowContactModal(false);
                    setContactMessage('');
                  }}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-6 py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
    </>
  );
}
