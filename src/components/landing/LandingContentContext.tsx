import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface LandingContentContextType {
  getValue: (key: string, defaultValue: string) => string;
  updateValue: (key: string, value: string) => Promise<void>;
  isAdmin: boolean;
}

const LandingContentContext = createContext<LandingContentContextType>({
  getValue: (_, defaultValue) => defaultValue,
  updateValue: async () => {},
  isAdmin: false,
});

export const useLandingContent = () => useContext(LandingContentContext);

export function LandingContentProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<Record<string, string>>({});
  const [isAdmin, setIsAdmin] = useState(false);

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

    // Check if current user is admin or organization owner
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .then(({ data }) => {
            const roles = (data || []).map((r: any) => r.role);
            setIsAdmin(roles.includes("admin") || roles.includes("organization"));
          });
      }
    });
  }, []);

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

  return (
    <LandingContentContext.Provider value={{ getValue, updateValue, isAdmin }}>
      {children}
    </LandingContentContext.Provider>
  );
}
