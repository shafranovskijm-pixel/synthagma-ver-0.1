import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useEffect, useState } from "react";

interface AuditLogParams {
  actionType: "create" | "update" | "delete" | "view" | "export" | "login" | "logout";
  entityType: string;
  entityId?: string;
  entityName?: string;
  details?: Record<string, unknown>;
}

export function useAuditLog(organizationId?: string) {
  const { user } = useAuth();
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      supabase
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", user.id)
        .single()
        .then(({ data }) => {
          setUserName(data?.full_name || data?.email || "Unknown");
        });
    }
  }, [user]);

  const logAction = async ({
    actionType,
    entityType,
    entityId,
    entityName,
    details,
  }: AuditLogParams) => {
    if (!user || !organizationId) return;

    try {
      await supabase.from("audit_logs").insert({
        organization_id: organizationId,
        user_id: user.id,
        user_name: userName || "Unknown",
        action_type: actionType,
        entity_type: entityType,
        entity_id: entityId || null,
        entity_name: entityName || null,
        details: details ? JSON.parse(JSON.stringify(details)) : null,
        user_agent: navigator.userAgent,
      });
    } catch (error) {
      console.error("Failed to log audit action:", error);
    }
  };

  return { logAction };
}
