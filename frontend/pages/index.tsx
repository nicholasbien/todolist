import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { useOffline } from '../context/OfflineContext';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { apiRequest } from '../utils/api';

const AIToDoListApp = dynamic(() => import('../components/AIToDoListApp'), {
  ssr: false,
  loading: () => (
    <div className="container mx-auto p-4 max-w-md">
      <div className="animate-pulse text-center">Loading...</div>
    </div>
  )
});

interface LoginFormProps {
  onLogin: (user: any, token: string) => void;
}

interface Space {
  _id: string;
  name: string;
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
      const response = await apiRequest('auth/signup', {
        method: 'POST',
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
      const response = await apiRequest('auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, code })
      });

      const data = await response.json();

      if (response.ok) {
        const { token, user } = data;

        localStorage.setItem('auth_token', token);
        localStorage.setItem('auth_user', JSON.stringify(user));

        // Sync auth to service worker IndexedDB for offline access
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
          const userId = user.id || user._id || user.user_id;
          navigator.serviceWorker.controller.postMessage({
            type: 'SET_AUTH',
            token: token,
            userId: userId
          });
          console.log('📤 Synced auth to service worker IndexedDB after login');
        }

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
      console.log('Token for update-name:', token ? 'Present' : 'Missing');

      if (!token) {
        console.error('No token found in localStorage');
        setError('Session expired. Please log in again.');
        return;
      }

      const response = await apiRequest('auth/update-name', {
        method: 'POST',
        body: JSON.stringify({ first_name: firstName })
      });

      const data = await response.json();

      if (response.ok) {
        const updatedUser = data.user;
        localStorage.setItem('auth_user', JSON.stringify(updatedUser));
        onLogin(updatedUser, token);
      } else {
        console.error('Update name failed:', response.status, data);
        setError(data.detail || 'Failed to update name');
      }
    } catch (error) {
      console.error('Network error during name update:', error);
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
              <label htmlFor="code" className="block text-sm font-medium text-gray-100 mb-2">
                Verification Code
              </label>
              <input
                type="text"
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-center text-lg font-mono bg-white text-gray-900"
                placeholder="000000"
                disabled={loading}
                required
                maxLength={6}
              />
              <p className="text-sm text-gray-300 mt-1">
                Code sent to: <span className="font-medium text-gray-100">{email}</span>
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent outline-none text-gray-900 placeholder-gray-500"
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
  const [showContactModal, setShowContactModal] = useState(false);
  const [showEmailSettings, setShowEmailSettings] = useState(false);
  const [showInsightsModal, setShowInsightsModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [exportType, setExportType] = useState<'todos' | 'journals'>('todos');
  const [exportFormat, setExportFormat] = useState<'jsonl' | 'csv'>('jsonl');
  const [exportSpaces, setExportSpaces] = useState<Space[]>([]);
  const [exportSpaceId, setExportSpaceId] = useState('');
  const [exporting, setExporting] = useState(false);
  const [contactMessage, setContactMessage] = useState('');
  const [sendingContact, setSendingContact] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [updatingName, setUpdatingName] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
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
    if (showExportModal && token) {
      const loadSpaces = async () => {
        try {
          const resp = await fetch('/spaces', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (resp.ok) {
            const data = await resp.json();
            setExportSpaces(data);
            setExportSpaceId(data[0]?._id || '');
          }
        } catch (err) {
          console.error('Error loading spaces', err);
        }
      };
      loadSpaces();
    }
  }, [showExportModal, token]);

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

  const handleExportData = async () => {
    if (!exportSpaceId) return;
    try {
      setExporting(true);
      const response = await fetch(
        `/export?data=${exportType}&format=${exportFormat}&space_id=${exportSpaceId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportType}.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setShowExportModal(false);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  };

  const handleUpdateName = async () => {
    if (!accountName.trim()) return;

    try {
      setUpdatingName(true);
      const response = await fetch('/auth/update-name', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ first_name: accountName.trim() })
      });

      if (!response.ok) throw new Error('Failed to update name');

      const result = await response.json();
      // Update user state with new name
      setUser((prev: any) => ({ ...prev, first_name: accountName.trim() }));
      alert('Name updated successfully!');
    } catch (err) {
      console.error('Update name error:', err);
      alert('Failed to update name. Please try again.');
    } finally {
      setUpdatingName(false);
    }
  };

  const handleDeleteAccount = async () => {
    // First click - show confirmation step
    if (!showDeleteConfirmation) {
      setShowDeleteConfirmation(true);
      return;
    }

    // Second click - verify DELETE was typed and proceed with deletion
    if (deleteConfirmation !== 'DELETE') {
      alert('Please type DELETE to confirm account deletion');
      return;
    }

    try {
      setDeletingAccount(true);
      const response = await fetch('/auth/me', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Failed to delete account');

      // Account deleted successfully, log out
      alert('Account deleted successfully.');
      handleLogout();
    } catch (err) {
      console.error('Delete account error:', err);
      alert('Failed to delete account. Please try again.');
      setDeletingAccount(false);
    }
  };

  if (!isClient || isChecking) {
    return (
      <>
        <Head>
          <title>todolist.nyc</title>
        </Head>
        <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
          <div className="animate-pulse text-center">Loading...</div>
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
        <AIToDoListApp
          user={user}
          token={token}
          showEmailSettings={showEmailSettings}
          onShowEmailSettings={() => setShowEmailSettings(true)}
          onCloseEmailSettings={() => setShowEmailSettings(false)}
          showInsights={showInsightsModal}
          onShowInsights={() => setShowInsightsModal(true)}
          onCloseInsights={() => setShowInsightsModal(false)}
          onShowExportModal={() => setShowExportModal(true)}
          onShowContactModal={() => setShowContactModal(true)}
          onShowAccountSettings={() => {
            setAccountName(user?.first_name || '');
            setShowDeleteConfirmation(false);
            setDeleteConfirmation('');
            setShowAccountSettings(true);
          }}
          onLogout={handleLogout}
          isOffline={isOffline}
        />
        {/* Export Modal */}
        {showExportModal && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-black border border-gray-800 p-6 rounded-xl w-80 space-y-4 shadow-2xl">
              <h3 className="text-gray-100 text-lg font-bold mb-2">Export Data</h3>
              <div>
                <label className="block text-sm text-gray-300 mb-2">Data Type</label>
                <select
                  value={exportType}
                  onChange={(e) => setExportType(e.target.value as 'todos' | 'journals')}
                  className="w-full bg-gray-900 border border-gray-700 text-gray-100 p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="todos">Tasks</option>
                  <option value="journals">Journal Entries</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">Format</label>
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as 'jsonl' | 'csv')}
                  className="w-full bg-gray-900 border border-gray-700 text-gray-100 p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="jsonl">JSONL</option>
                  <option value="csv">CSV</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">Space</label>
                <select
                  value={exportSpaceId}
                  onChange={(e) => setExportSpaceId(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 text-gray-100 p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {exportSpaces.map((space) => (
                    <option key={space._id} value={space._id}>
                      {space.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-center space-x-3">
                <button
                  onClick={handleExportData}
                  disabled={exporting || !exportSpaceId}
                  className="bg-accent hover:bg-accent-light disabled:bg-accent-dark disabled:text-gray-400 text-white px-6 py-2 rounded-lg transition-colors"
                >
                  {exporting ? 'Exporting...' : 'Download'}
                </button>
                <button
                  onClick={() => setShowExportModal(false)}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-6 py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Contact Modal */}
        {showContactModal && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-black border border-gray-800 p-6 rounded-xl w-96 space-y-4 shadow-2xl">
              <h3 className="text-gray-100 text-lg font-bold mb-2">Contact</h3>
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

        {/* Account Settings Modal */}
        {showAccountSettings && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
            <div className="bg-black border border-gray-800 p-6 rounded-xl w-full max-w-md space-y-6 shadow-2xl">
              <h3 className="text-gray-100 text-lg font-bold">Account Settings</h3>

              {/* Email Display */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Email</label>
                <div className="p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-500">
                  {user?.email}
                </div>
              </div>

              {/* Name Update */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Name</label>
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <button
                  onClick={handleUpdateName}
                  disabled={updatingName || !accountName.trim() || accountName === user?.first_name}
                  className="mt-2 bg-accent hover:bg-accent-light disabled:bg-accent-dark disabled:text-gray-400 text-white px-4 py-2 rounded-lg transition-colors text-sm"
                >
                  {updatingName ? 'Updating...' : 'Update Name'}
                </button>
              </div>

              {/* Delete Account Section */}
              <div className="pt-4 border-t border-gray-800">
                {!showDeleteConfirmation ? (
                  <button
                    onClick={handleDeleteAccount}
                    className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors font-semibold"
                  >
                    Delete Account
                  </button>
                ) : (
                  <>
                    <p className="text-sm text-gray-400 mb-3">
                      Are you sure? This will delete your account and all associated data. <strong className="text-red-400">This action cannot be undone.</strong>
                    </p>
                    <label className="block text-sm text-gray-400 mb-2">
                      Type <span className="font-mono text-red-400">DELETE</span> to confirm:
                    </label>
                    <input
                      type="text"
                      value={deleteConfirmation}
                      onChange={(e) => setDeleteConfirmation(e.target.value)}
                      placeholder="DELETE"
                      className="w-full p-3 rounded-lg bg-gray-900 border border-red-800 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 mb-3"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setShowDeleteConfirmation(false);
                          setDeleteConfirmation('');
                        }}
                        className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDeleteAccount}
                        disabled={deletingAccount || deleteConfirmation !== 'DELETE'}
                        className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-900 disabled:text-gray-500 text-white px-4 py-2 rounded-lg transition-colors font-semibold"
                      >
                        {deletingAccount ? 'Deleting...' : 'Confirm Delete'}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Close Button */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => {
                    setShowAccountSettings(false);
                    setShowDeleteConfirmation(false);
                    setDeleteConfirmation('');
                  }}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-6 py-2 rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
    </main>
  </>
  );
}
