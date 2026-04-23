import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";

export function useRegistrationLinks(organizationId: string | null) {
  const [showCreateLinkDialog, setShowCreateLinkDialog] = useState(false);
  const [newLinkCompanyName, setNewLinkCompanyName] = useState("");
  const [newLinkInn, setNewLinkInn] = useState("");
  const [isCreatingLink, setIsCreatingLink] = useState(false);

  const generateToken = useCallback(() => {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }, []);

  const createLink = useCallback(async () => {
    if (!organizationId) return false;

    setIsCreatingLink(true);
    try {
      const token = generateToken();

      const { error } = await supabase.from("registration_links").insert({
        organization_id: organizationId,
        token,
        name: newLinkCompanyName || null,
        inn: newLinkInn || null
      });

      if (error) throw error;

      setShowCreateLinkDialog(false);
      setNewLinkCompanyName("");
      setNewLinkInn("");
      toast.success("Ссылка для регистрации создана");
      return true;
    } catch (error) {
      console.error("Error creating link:", error);
      toast.error("Ошибка создания ссылки", { description: getErrorMessage(error) });
      return false;
    } finally {
      setIsCreatingLink(false);
    }
  }, [organizationId, newLinkCompanyName, newLinkInn, generateToken]);

  return {
    showCreateLinkDialog,
    setShowCreateLinkDialog,
    newLinkCompanyName,
    setNewLinkCompanyName,
    newLinkInn,
    setNewLinkInn,
    isCreatingLink,
    createLink,
  };
}
