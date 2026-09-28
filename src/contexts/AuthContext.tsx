import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Workspace } from '@/types/database';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  workspace: Workspace | null;
  workspaceId: string | null;
  /** True until we've confirmed there IS or ISN'T a session — gates every
   * route redirect decision so we never bounce the user to /login just
   * because auth hasn't finished loading yet (the exact bug the spec calls
   * out: "prevent auth-state redirect loops by waiting for auth
   * initialization before route redirects"). */
  initializing: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, workspaceName?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [initializing, setInitializing] = useState(true);

  const loadWorkspace = useCallback(async (userId: string) => {
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      setWorkspace(null);
      return;
    }

    const { data: ws } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', membership.workspace_id)
      .maybeSingle();

    setWorkspace((ws as Workspace) ?? null);
  }, []);

  useEffect(() => {
    let mounted = true;

    // getSession() resolves from persisted storage synchronously-ish before
    // any redirect logic elsewhere in the app is allowed to run.
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        await loadWorkspace(data.session.user.id);
      }
      setInitializing(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      if (newSession?.user) {
        await loadWorkspace(newSession.user.id);
      } else {
        setWorkspace(null);
      }
      // Auth state changes after the initial load never need to re-block
      // rendering behind `initializing` — only the very first resolution does.
      setInitializing(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadWorkspace]);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, workspaceName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { workspace_name: workspaceName } },
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    workspace,
    workspaceId: workspace?.id ?? null,
    initializing,
    signInWithPassword,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
