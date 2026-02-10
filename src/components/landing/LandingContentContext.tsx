import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LandingLoginDialog } from "./LandingLoginDialog";

interface LandingContentContextType {
  getValue: (key: string, defaultValue: string) => string;
  updateValue: (key: string, value: string) => Promise<void>;
  isAdmin: boolean;
  isLoggedIn: boolean;
  showLogin: () => void;
}

const LandingContentContext = createContext<LandingContentContextType>({
  getValue: (_, defaultValue) => defaultValue,
  updateValue: async () => {},
  isAdmin: false,
  isLoggedIn: false,
  showLogin: () => {},
});

export const useLandingContent = () => useContext(LandingContentContext);

export function LandingContentProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<Record<string, string>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  const checkAdminStatus = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setIsLoggedIn(true);
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const roles = (data || []).map((r: any) => r.role);
      setIsAdmin(roles.includes("admin") || roles.includes("organization"));
    } else {
      setIsLoggedIn(false);
      setIsAdmin(false);
    }
  }, []);

  useEffect(() => {
    // Load all landing content
    supabase
      .from("landing_content" as any)
      .select("content_key, content_value")
      .then(({ data }) => {
        if (data) {
          const map: Record<string, string> = {};
          (data as any[]).forEach((row: any) => {
            map[row.content_key] = row.content_value;
          });
          setContent(map);
        }
      });

    checkAdminStatus();
  }, [checkAdminStatus]);

  const getValue = useCallback(
    (key: string, defaultValue: string) => {
      return content[key] ?? defaultValue;
    },
    [content]
  );

  const updateValue = useCallback(async (key: string, value: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await (supabase.from("landing_content" as any) as any).upsert(
      {
        content_key: key,
        content_value: value,
        updated_by: user?.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "content_key" }
    );

    if (!error) {
      setContent((prev) => ({ ...prev, [key]: value }));
    } else {
      throw error;
    }
  }, []);

  const showLogin = useCallback(() => {
    setLoginOpen(true);
  }, []);

  const handleLoginSuccess = useCallback(() => {
    checkAdminStatus();
  }, [checkAdminStatus]);

  return (
    <LandingContentContext.Provider value={{ getValue, updateValue, isAdmin, isLoggedIn, showLogin }}>
      {children}
      <LandingLoginDialog open={loginOpen} onOpenChange={setLoginOpen} onSuccess={handleLoginSuccess} />
    </LandingContentContext.Provider>
  );
}
