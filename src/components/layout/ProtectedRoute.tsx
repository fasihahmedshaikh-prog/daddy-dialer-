import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

/** Gates every private route. Crucially waits for `initializing` to resolve
 * before making any redirect decision — this is what prevents the
 * auth-state redirect loop the spec explicitly calls out (bouncing between
 * /login and / because a session check hadn't resolved yet). */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, initializing } = useAuth();
  const location = useLocation();

  if (initializing) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-surface">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

export function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { session, initializing } = useAuth();

  if (initializing) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-surface">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
