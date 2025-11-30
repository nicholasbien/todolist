import AIToDoListApp from './AIToDoListApp';
import AuthForm from './AuthForm';
import { useAuth } from '../context/AuthContext';
import Link from 'next/link';

export default function AppMain() {
  const { isAuthenticated, isLoading, user, token, authExpired, clearAuthExpired } = useAuth();

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="container mx-auto p-4 max-w-md">
          <div className="animate-pulse">Loading...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      {!isAuthenticated && authExpired && (
        <div className="max-w-md mx-auto p-4">
          <div className="bg-red-900/20 border border-red-800 text-red-300 px-4 py-3 rounded-xl mb-4 flex justify-between items-start">
            <span className="flex-1">
              Session expired.{' '}
              <Link href="/" onClick={clearAuthExpired} className="underline text-accent">
                Sign in again
              </Link>
            </span>
            <button
              onClick={clearAuthExpired}
              className="text-red-300 hover:text-red-100 ml-2 flex-shrink-0 text-lg leading-none"
              aria-label="Close error message"
            >
              ×
            </button>
          </div>
        </div>
      )}
      {isAuthenticated ? <AIToDoListApp user={user} token={token} /> : <AuthForm />}
    </main>
  );
}
