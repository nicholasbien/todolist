import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AuthForm() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('email'); // 'email' or 'code'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const { signup, login } = useAuth();

  const handleEmailSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter an email address');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const result = await signup(email);

      if (result.success) {
        setStep('code');
        setMessage('Verification code sent! Check the server console for your code.');
      } else {
        setError(result.error || 'Signup failed');
      }
    } catch (err) {
      console.error('Signup error:', err);
      setError('An error occurred during signup. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('Please enter the verification code');
      return;
    }

    setLoading(true);
    setError('');

    const result = await login(email, code);

    if (result.success) {
      // AuthContext will handle redirect via useEffect
      setMessage('Login successful!');
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  const handleBackToEmail = () => {
    setStep('email');
    setCode('');
    setError('');
    setMessage('');
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-surface rounded-xl shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Todo App</h1>
          <p className="text-muted">
            {step === 'email'
              ? 'Enter your email to get started'
              : 'Enter the verification code sent to your email'
            }
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded-lg flex justify-between items-start">
            <p className="text-red-300 text-sm flex-1">{error}</p>
            <button
              onClick={() => setError('')}
              className="text-red-300 hover:text-red-100 ml-2 flex-shrink-0 text-lg leading-none"
              aria-label="Close error message"
            >
              ×
            </button>
          </div>
        )}

        {message && (
          <div className="mb-4 p-3 bg-green-900/20 border border-green-800 rounded-lg">
            <p className="text-green-300 text-sm">{message}</p>
          </div>
        )}

        {step === 'email' ? (
          <form onSubmit={handleEmailSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 bg-background border border-muted rounded-lg focus:ring-2 focus:ring-accent focus:border-accent outline-none text-foreground placeholder:text-muted"
                placeholder="Enter your email"
                disabled={loading}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-foreground py-2 px-4 rounded-lg hover:bg-accent-light focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Sending Code...' : 'Send Verification Code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCodeSubmit} className="space-y-6">
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-foreground mb-2">
                Verification Code
              </label>
              <input
                type="text"
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-4 py-2 bg-background border border-muted rounded-lg focus:ring-2 focus:ring-accent focus:border-accent outline-none text-center text-lg font-mono text-foreground placeholder:text-muted"
                placeholder="000000"
                disabled={loading}
                required
                maxLength={6}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
              />
              <p className="text-sm text-muted mt-1">
                Code sent to: <span className="font-medium">{email}</span>
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-foreground py-2 px-4 rounded-lg hover:bg-accent-light focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Verifying...' : 'Sign In'}
            </button>

            <button
              type="button"
              onClick={handleBackToEmail}
              className="w-full bg-surface text-foreground py-2 px-4 rounded-lg hover:bg-background transition-colors"
            >
              ← Back to Email
            </button>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-muted">
          <p className="text-sm text-muted text-center">
            {step === 'email'
              ? 'New users will be automatically registered'
              : 'Check the server console for your verification code'
            }
          </p>
        </div>
      </div>
    </div>
  );
}
