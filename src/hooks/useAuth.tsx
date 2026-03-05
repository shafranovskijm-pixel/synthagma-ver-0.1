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

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Completely ignore TOKEN_REFRESHED — never refetch role on token refresh
        if (event === 'TOKEN_REFRESHED') {
          setSession(session);
          setUser(session?.user ?? null);
          return;
        }
        
        // If signIn is in progress, skip — signIn handles role fetch itself
        if (signInInProgress.current && event === 'SIGNED_IN') {
          setSession(session);
          setUser(session?.user ?? null);
          return;
        }
        
        setSession(session);
        setUser(session?.user ?? null);
        
        // Fetch user role after auth state change
        if (session?.user) {
          // Use setTimeout to avoid Supabase deadlock warning
          setTimeout(() => {
            fetchUserRole(session.user.id);
          }, 0);
        } else if (event === 'SIGNED_OUT') {
          setUserRole(null);
          localStorage.removeItem('user_role');
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
  }, [fetchUserRole]);

  const signIn = async (email: string, password: string) => {
    console.log('[Auth] signIn attempt for:', email);
    signInInProgress.current = true;
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (!error && data?.user) {
        console.log('[Auth] signIn success, fetching role for:', data.user.id);
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
      signInInProgress.current = false;
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
