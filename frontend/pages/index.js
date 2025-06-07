import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';

const AIToDoListApp = dynamic(() => import('../components/AIToDoListApp'), {
  ssr: false,
  loading: () => (
    <div className="container mx-auto p-4 max-w-md">
      <div className="animate-pulse">Loading...</div>
    </div>
  )
});

export default function Home() {
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    setIsClient(true);
    
    const checkAuth = () => {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setIsAuthenticated(false);
        setIsChecking(false);
        router.replace('/login');
      } else {
        setIsAuthenticated(true);
        setIsChecking(false);
      }
    };

    checkAuth();
  }, [router]);

  if (!isClient || isChecking) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="animate-pulse">Redirecting to login...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <AIToDoListApp />
    </main>
  );
} 