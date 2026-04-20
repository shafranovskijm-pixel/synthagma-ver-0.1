import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { getBaseUrl } from '@/utils/getBaseUrl';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const cachedRole = localStorage.getItem('user_role') as AuthContextType['userRole'];
  
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'organization' | 'student' | 'sales_manager' | 'company' | null>(cachedRole);
  const [loading, setLoading] = useState(true);
  
  const roleFetchInFlight = useRef<string | null>(null);
  const signInInProgress = useRef(false);
  const hadSession = useRef(false);
  const recoveryInProgress = useRef(false);

  const fetchUserRole = useCallback(async (userId: string): Promise<AuthContextType['userRole']> => {
    if (roleFetchInFlight.current === userId) return null;
    roleFetchInFlight.current = userId;
    
    try {
      const { data, error } = await supabase
        .rpc('get_user_role', { _user_id: userId });
      
      if (data && !error) {
        const role = data as 'admin' | 'organization' | 'student' | 'sales_manager' | 'company';
        setUserRole(role);
        localStorage.setItem('user_role', role);
        return role;
      } else {
        // Don't fallback to 'student' — keep current role or null
        // This prevents race conditions during org registration
        return null;
      }
    } catch {
      return null;
    } finally {
      roleFetchInFlight.current = null;
    }
  }, []);

  // Simple session recovery: wait and retry once
  const attemptSessionRecovery = useCallback(async () => {
    if (recoveryInProgress.current) return;
    recoveryInProgress.current = true;
    
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setSession(session);
        setUser(session.user);
        hadSession.current = true;
      } else {
        setUser(null);
        setSession(null);
        setUserRole(null);
        localStorage.removeItem('user_role');
        hadSession.current = false;
      }
    } catch {
    } finally {
      recoveryInProgress.current = false;
    }
  }, []);

  useEffect(() => {
    // Sync role across tabs via storage events
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'user_role') {
        const newRole = e.newValue as AuthContextType['userRole'];
        setUserRole(newRole);
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // Visibility-based auto-refresh: only active tab refreshes tokens
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Ensure auto-refresh is running for the initially visible tab
    if (document.visibilityState === 'visible') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        
        
        if (event === 'TOKEN_REFRESHED') {
          if (session) {
            setSession(session);
            setUser(session.user);
          }
          return;
        }
        
        if (signInInProgress.current) {
          if (session) {
            setSession(session);
            setUser(session.user);
          }
          return;
        }
        
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
          
          setTimeout(() => {
            fetchUserRole(session.user.id);
          }, 0);
        } else if (!session && hadSession.current) {
          attemptSessionRecovery();
        }
      }
    );

    // Check for existing session
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          hadSession.current = true;
          await fetchUserRole(session.user.id);
        } else {
          localStorage.removeItem('user_role');
          setUserRole(null);
        }
      } catch {
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [fetchUserRole, attemptSessionRecovery]);

  const signIn = async (email: string, password: string) => {
    signInInProgress.current = true;
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (!error && data?.user) {
        hadSession.current = true;
        setSession(data.session);
        setUser(data.user);
        
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
    } finally {
      setTimeout(() => {
        signInInProgress.current = false;
      }, 3000);
    }
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
    hadSession.current = false;
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setUserRole(null);
    localStorage.removeItem('user_role');
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
