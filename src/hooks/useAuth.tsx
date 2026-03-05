import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: 'admin' | 'organization' | 'student' | 'sales_manager' | 'company' | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshUserRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Cross-tab lock: only one tab should refresh token at a time
const LOCK_KEY = 'sintagma_auth_lock';
const LOCK_TTL = 5000; // 5 seconds

function acquireLock(): boolean {
  const now = Date.now();
  const existing = localStorage.getItem(LOCK_KEY);
  if (existing) {
    const lockTime = parseInt(existing, 10);
    if (now - lockTime < LOCK_TTL) {
      return false; // Another tab holds the lock
    }
  }
  localStorage.setItem(LOCK_KEY, String(now));
  return true;
}

function releaseLock() {
  localStorage.removeItem(LOCK_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Use cached role from localStorage for instant init
  const cachedRole = localStorage.getItem('user_role') as AuthContextType['userRole'];
  
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'organization' | 'student' | 'sales_manager' | 'company' | null>(cachedRole);
  const [loading, setLoading] = useState(true);
  const [roleLoaded, setRoleLoaded] = useState(false);
  
  // Prevent concurrent role fetches and auth state race conditions
  const roleFetchInFlight = useRef<string | null>(null);
  const signInInProgress = useRef(false);
  const hadSession = useRef(false); // Track if we ever had a session
  const recoveryInProgress = useRef(false);

  const fetchUserRole = useCallback(async (userId: string) => {
    // Deduplicate: skip if already fetching for this user
    if (roleFetchInFlight.current === userId) {
      return;
    }
    roleFetchInFlight.current = userId;
    
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();
      
      if (data && !error) {
        console.log('Fetched user role:', data.role);
        const role = data.role as 'admin' | 'organization' | 'student' | 'sales_manager' | 'company';
        setUserRole(role);
        localStorage.setItem('user_role', role);
      } else if (error) {
        console.error('Error fetching user role:', error);
        setUserRole('student');
      }
    } catch (error) {
      console.error('Error fetching user role:', error);
      setUserRole('student');
    } finally {
      roleFetchInFlight.current = null;
      setRoleLoaded(true);
    }
  }, []);

  // Session recovery: when token refresh fails (429), try to recover
  const attemptSessionRecovery = useCallback(async () => {
    if (recoveryInProgress.current) return;
    recoveryInProgress.current = true;
    
    console.log('[Auth] Attempting session recovery...');
    
    // Wait for rate limit to cool down
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    try {
      // Only one tab should try recovery
      if (!acquireLock()) {
        console.log('[Auth] Another tab is handling recovery, waiting...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        // Check if session was restored by another tab
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          console.log('[Auth] Session restored by another tab');
          setSession(session);
          setUser(session.user);
          hadSession.current = true;
        }
        recoveryInProgress.current = false;
        return;
      }
      
      const { data: { session } } = await supabase.auth.getSession();
      releaseLock();
      
      if (session) {
        console.log('[Auth] Session recovered successfully');
        setSession(session);
        setUser(session.user);
        hadSession.current = true;
      } else {
        console.log('[Auth] Session recovery failed, redirecting to login');
        setUser(null);
        setSession(null);
        setUserRole(null);
        localStorage.removeItem('user_role');
        hadSession.current = false;
      }
    } catch (error) {
      console.error('[Auth] Session recovery error:', error);
      releaseLock();
    } finally {
      recoveryInProgress.current = false;
    }
  }, []);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[Auth] onAuthStateChange:', event, !!session);
        
        // Completely ignore TOKEN_REFRESHED — never refetch role on token refresh
        if (event === 'TOKEN_REFRESHED') {
          if (session) {
            setSession(session);
            setUser(session.user);
          }
          return;
        }
        
        // If signIn is in progress, skip — signIn handles everything itself
        if (signInInProgress.current) {
          if (session) {
            setSession(session);
            setUser(session.user);
          }
          return;
        }
        
        // Explicit sign out — clear everything
        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setUserRole(null);
          localStorage.removeItem('user_role');
          hadSession.current = false;
          return;
        }
        
        if (session?.user) {
          setSession(session);
          setUser(session.user);
          hadSession.current = true;
          
          // Use setTimeout to avoid Supabase deadlock warning
          setTimeout(() => {
            fetchUserRole(session.user.id);
          }, 0);
        } else if (!session && hadSession.current) {
          // Session lost unexpectedly (not SIGNED_OUT) — likely 429/token revoked
          // Don't clear state immediately! Try to recover.
          console.warn('[Auth] Session lost unexpectedly, attempting recovery...');
          attemptSessionRecovery();
        }
      }
    );

    // THEN check for existing session
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          hadSession.current = true;
          await fetchUserRole(session.user.id);
        } else {
          // No session — clear cached role
          localStorage.removeItem('user_role');
          setUserRole(null);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    return () => subscription.unsubscribe();
  }, [fetchUserRole, attemptSessionRecovery]);

  const signIn = async (email: string, password: string) => {
    console.log('[Auth] signIn attempt for:', email);
    signInInProgress.current = true;
    
    try {
      // CRITICAL: Clear any stale session BEFORE signing in
      // This prevents the old refresh token from competing with the new one
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch (e) {
        // Ignore signOut errors - we just want to clear local state
        console.log('[Auth] Pre-signIn cleanup (ignore errors):', e);
      }
      
      // Small delay to let the client settle after signOut
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (!error && data?.user) {
        console.log('[Auth] signIn success, fetching role for:', data.user.id);
        hadSession.current = true;
        setSession(data.session);
        setUser(data.user);
        
        // Await role fetch BEFORE returning to prevent race condition
        await fetchUserRole(data.user.id);
        console.log('[Auth] role fetched, userRole is now set');
        
        // Fire-and-forget: log the login event (no await!)
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
    } finally {
      // Delay clearing the flag so onAuthStateChange events from this login are still suppressed
      setTimeout(() => {
        signInInProgress.current = false;
      }, 3000);
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
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
    hadSession.current = false;
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setUserRole(null);
    localStorage.removeItem('user_role');
  };

  const refreshUserRole = async () => {
    if (user) {
      await fetchUserRole(user.id);
    }
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
