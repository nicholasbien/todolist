import AIToDoListApp from './AIToDoListApp';
import AuthForm from './AuthForm';
import { useAuth } from '../context/AuthContext';

export default function AppMain() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="container mx-auto p-4 max-w-md">
          <div className="animate-pulse">Loading...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      {isAuthenticated ? <AIToDoListApp /> : <AuthForm />}
    </main>
  );
}
