import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Webinar {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  course_id: string | null;
  company_id: string | null;
  access_type: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  room_url: string | null;
  room_name: string | null;
  recording_url: string | null;
  recording_size_bytes: number;
  host_user_id: string;
  max_participants: number;
  created_at: string;
  updated_at: string;
}

export function useWebinarsManager(organizationId: string | null) {
  const [webinars, setWebinars] = useState<Webinar[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchWebinars = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("webinars")
        .select("*")
        .eq("organization_id", organizationId)
        .order("scheduled_at", { ascending: false });
      if (error) throw error;
      setWebinars((data as unknown as Webinar[]) || []);
    } catch (e: any) {
      console.error("Error fetching webinars:", e);
      toast.error("Ошибка загрузки вебинаров");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchWebinars();
  }, [fetchWebinars]);

  // Realtime
  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase
      .channel(`webinars-${organizationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "webinars", filter: `organization_id=eq.${organizationId}` }, () => {
        fetchWebinars();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [organizationId, fetchWebinars]);

  const createWebinar = useCallback(async (data: {
    title: string;
    description?: string;
    scheduled_at: string;
    duration_minutes?: number;
    course_id?: string;
    company_id?: string;
    access_type?: string;
    max_participants?: number;
  }) => {
    if (!organizationId) return null;
    setCreating(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-webinar", {
        body: { ...data, organization_id: organizationId },
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      // The invoke method doesn't support query params directly, so we need to construct the URL
      // Actually let's use fetch directly
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-webinar?action=create`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.session?.access_token}`,
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ ...data, organization_id: organizationId }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to create webinar");
      }
      const webinar = await response.json();
      toast.success("Вебинар создан");
      await fetchWebinars();
      return webinar;
    } catch (e: any) {
      console.error("Error creating webinar:", e);
      toast.error(e.message || "Ошибка создания вебинара");
      return null;
    } finally {
      setCreating(false);
    }
  }, [organizationId, fetchWebinars]);

  const updateWebinarStatus = useCallback(async (webinarId: string, status: string) => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-webinar`;
      const response = await fetch(url, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session?.session?.access_token}`,
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ webinar_id: webinarId, status }),
      });
      if (!response.ok) throw new Error("Failed to update");
      await fetchWebinars();
    } catch (e: any) {
      toast.error("Ошибка обновления статуса");
    }
  }, [fetchWebinars]);

  const deleteWebinar = useCallback(async (webinarId: string) => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-webinar`;
      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session?.session?.access_token}`,
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ webinar_id: webinarId }),
      });
      if (!response.ok) throw new Error("Failed to delete");
      toast.success("Вебинар удалён");
      await fetchWebinars();
    } catch (e: any) {
      toast.error("Ошибка удаления вебинара");
    }
  }, [fetchWebinars]);

  const getMeetingToken = useCallback(async (roomName: string, isOwner: boolean) => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-webinar?action=token`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.session?.access_token}`,
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ room_name: roomName, is_owner: isOwner }),
      });
      if (!response.ok) throw new Error("Failed to get token");
      const data = await response.json();
      return data.token as string;
    } catch (e: any) {
      toast.error("Ошибка получения токена трансляции");
      return null;
    }
  }, []);

  return {
    webinars,
    loading,
    creating,
    createWebinar,
    updateWebinarStatus,
    deleteWebinar,
    getMeetingToken,
    refresh: fetchWebinars,
  };
}
