import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { getBaseUrl } from '@/utils/getBaseUrl';
import { setOfflineAuthActor, observeOfflineAccess } from '@/utils/courseCache';
import { clearPrivateRuntimeCaches } from '@/utils/privateRuntimeCacheCleanup';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: 'admin' | 'organization' | 'student' | 'sales_manager' | 'company' | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshUserRole: (userId?: string) => Promise<AuthContextType['userRole']>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_REQUEST_TIMEOUT_MS = 12000;
const ROLE_FOCUS_REFRESH_INTERVAL_MS = 5000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const cachedRole = localStorage.getItem('user_role') as AuthContextType['userRole'];
  
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'organization' | 'student' | 'sales_manager' | 'company' | null>(cachedRole);
  const [loading, setLoading] = useState(true);
  
  const roleFetchInFlight = useRef<{
    userId: string;
    revision: number;
    promise: Promise<AuthContextType['userRole']>;
  } | null>(null);
  const authInitialized = useRef(false);
  const authUserId = useRef<string | null>(null);
  const authRevision = useRef(0);
  const mounted = useRef(false);

  const applySession = useCallback((nextSession: Session | null) => {
    const nextUserId = nextSession?.user.id ?? null;
    setOfflineAuthActor(nextUserId);
    if (authUserId.current !== nextUserId) {
      authRevision.current += 1;
      authUserId.current = nextUserId;
      roleFetchInFlight.current = null;
      setUserRole(null);
      localStorage.removeItem('user_role');
      void clearPrivateRuntimeCaches();
    }
    setSession(nextSession);
    setUser(nextSession?.user ?? null);
    if (!nextUserId) {
      setUserRole(null);
      localStorage.removeItem('user_role');
    }
  }, []);

  const fetchUserRole = useCallback((userId: string): Promise<AuthContextType['userRole']> => {
    if (!mounted.current || authUserId.current !== userId) return Promise.resolve(null);
    const revision = authRevision.current;
    const existing = roleFetchInFlight.current;
    if (existing?.userId === userId && existing.revision === revision) return existing.promise;

    const request = {
      userId,
      revision,
      promise: Promise.resolve(null) as Promise<AuthContextType['userRole']>,
    };
    roleFetchInFlight.current = request;
    request.promise = (async () => {
      try {
        const { data, error } = await supabase.rpc('get_user_role', { _user_id: userId });
        if (!mounted.current || authRevision.current !== revision || authUserId.current !== userId) return null;
        if (data && !error) {
          const role = data as AuthContextType['userRole'];
          observeOfflineAccess(userId, `server-role:${role}`);
          setUserRole(role);
          localStorage.setItem('user_role', role!);
          return role;
        }
        // A failed lookup must not silently downgrade organization registration.
        return null;
      } catch {
        return null;
      } finally {
        if (roleFetchInFlight.current === request) roleFetchInFlight.current = null;
      }
    })();
    return request.promise;
  }, []);

  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    let focusRefreshPending = false;
    let lastFocusRefresh = -Infinity;
    const roleTimers = new Set<ReturnType<typeof setTimeout>>();

    // Access can change while a learner's tab is in the background. Re-read
    // the SDK session and the effective server role when the user returns.
    const refreshRoleOnReturn = async () => {
      if (disposed || !authInitialized.current || !authUserId.current
        || document.visibilityState !== 'visible' || focusRefreshPending
        || Date.now() - lastFocusRefresh < ROLE_FOCUS_REFRESH_INTERVAL_MS) return;
      focusRefreshPending = true;
      lastFocusRefresh = Date.now();
      const revision = authRevision.current;
      try {
        const { data: { session: currentSession }, error } = await withTimeout(
          supabase.auth.getSession(), AUTH_REQUEST_TIMEOUT_MS, 'auth_timeout',
        );
        if (disposed || error || revision !== authRevision.current) return;
        applySession(currentSession);
        if (currentSession?.user) await fetchUserRole(currentSession.user.id);
      } catch {
        // A transient connectivity failure preserves the current session.
      } finally {
        focusRefreshPending = false;
      }
    };

    // Sync role across tabs via storage events
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'user_role' && authUserId.current) {
        const newRole = e.newValue as AuthContextType['userRole'];
        // A cross-tab role hint may invalidate old access, never validate a tenant.
        observeOfflineAccess(authUserId.current, `role-hint:${newRole}`);
        setUserRole(newRole);
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // Visibility-based auto-refresh: only active tab refreshes tokens
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        supabase.auth.startAutoRefresh();
        void refreshRoleOnReturn();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', refreshRoleOnReturn);
    
    // Ensure auto-refresh is running for the initially visible tab
    if (document.visibilityState === 'visible') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (disposed) return;
        if (event === 'TOKEN_REFRESHED') {
          if (session) applySession(session);
          return;
        }
        
        if (event === 'SIGNED_OUT') {
          authRevision.current += 1;
          applySession(null);
          return;
        }
        
        if (session?.user) {
          applySession(session);
          const revision = authRevision.current;
          const timer = setTimeout(() => {
            roleTimers.delete(timer);
            if (!disposed && revision === authRevision.current) void fetchUserRole(session.user.id);
          }, 0);
          roleTimers.add(timer);
        } else if (authInitialized.current) {
          applySession(null);
        }
      }
    );

    // Check for existing session
    const initializeAuth = async () => {
      const revision = authRevision.current;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (disposed || revision !== authRevision.current) return;
        applySession(session);
        authInitialized.current = true;

        if (session?.user) {
          await fetchUserRole(session.user.id);
        } else {
          localStorage.removeItem('user_role');
          setUserRole(null);
        }
      } catch {
      } finally {
        if (!disposed) {
          authInitialized.current = true;
          setLoading(false);
        }
      }
    };

    initializeAuth();

    return () => {
      disposed = true;
      setOfflineAuthActor(null);
      mounted.current = false;
      authRevision.current += 1;
      roleFetchInFlight.current = null;
      for (const timer of roleTimers) clearTimeout(timer);
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', refreshRoleOnReturn);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [applySession, fetchUserRole]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await withTimeout(
      supabase.auth.signInWithPassword({
        email,
        password,
      }),
      AUTH_REQUEST_TIMEOUT_MS,
      'auth_timeout'
    );
    
    if (!error && data?.user) {
      // Check if user is blocked before establishing session
      try {
        const { data: blocked } = await supabase.rpc('is_user_blocked', { _user_id: data.user.id });
        if (blocked === true) {
          await supabase.auth.signOut();
          return { error: new Error('Учётная запись заблокирована. Обратитесь к администратору организации.') };
        }
      } catch (e) {
        console.warn('is_user_blocked check failed:', e);
      }

      applySession(data.session);
      
      await fetchUserRole(data.user.id);
      
      // Fire-and-forget: log the login event
      supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", data.user.id)
        .maybeSingle()
        .then(({ data: profile }) => {
          if (profile?.organization_id) {
            supabase.from("student_login_history").insert({
              user_id: data.user!.id,
              organization_id: profile.organization_id,
              user_agent: navigator.userAgent,
            }).then(() => {});
          }
        });
    }
    
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${getBaseUrl()}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });
    return { error };
  };

  const signOut = async () => {
    // Invalidate already-running role/session lookups before the SDK emits logout.
    authRevision.current += 1;
    roleFetchInFlight.current = null;
    applySession(null);
    try { await supabase.auth.signOut(); }
    finally { await clearPrivateRuntimeCaches(); }
    // Сбрасываем гостевую сессию виджета поддержки, чтобы после logout
    // не «наследовалась» переписка предыдущего гостя в этом браузере.
    localStorage.removeItem('sintagma_support_guest_token');
    localStorage.removeItem('sintagma_support_conv_id');
  };

  const refreshUserRole = async (userId?: string): Promise<AuthContextType['userRole']> => {
    const id = userId || user?.id;
    if (id) {
      return await fetchUserRole(id);
    }
    return null;
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      userRole, 
      loading, 
      signIn, 
      signUp, 
      signOut,
      refreshUserRole
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
