import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useRouteContext } from '@tanstack/react-router';
import { User } from '@/types/api';

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { setUser } = useAuthStore();
  const routeContext = useRouteContext({ from: '__root__' });

  useEffect(() => {
    // Always sync user from server-side auth check to store
    // This ensures the auth store matches the server state
    setUser(routeContext.user as User | null);
  }, [routeContext.user, setUser]);

  return <>{children}</>;
}