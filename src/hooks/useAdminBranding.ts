import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AdminBrandingSettings {
  coverUrl: string | null;
  logoUrl: string | null;
  customName: string;
  customSubtitle: string;
  coverPosition: string;
}

export function useAdminBranding() {
  const [branding, setBranding] = useState<AdminBrandingSettings>({
    coverUrl: null,
    logoUrl: null,
    customName: "",
    customSubtitle: "",
    coverPosition: "center",
  });
  const [loading, setLoading] = useState(true);

  const fetchBranding = useCallback(async () => {
    const { data } = await supabase
      .from("admin_branding")
      .select("*")
      .limit(1)
      .single();

    if (data) {
      const b = (data.branding as any) || {};
      setBranding({
        coverUrl: data.cover_url || null,
        logoUrl: data.logo_url || null,
        customName: b.customName || "",
        customSubtitle: b.customSubtitle || "",
        coverPosition: b.coverPosition || "center",
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchBranding(); }, [fetchBranding]);

  const handleCoverUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const ext = file.name.split(".").pop();
    const path = `admin/cover-${Date.now()}.${ext}`;
    
    const { error: uploadError } = await supabase.storage
      .from("course-files")
      .upload(path, file, { upsert: true });
    
    if (uploadError) {
      toast.error("Ошибка загрузки обложки");
      return;
    }

    const { data: urlData } = supabase.storage.from("course-files").getPublicUrl(path);
    const coverUrl = urlData.publicUrl;

    await supabase
      .from("admin_branding")
      .update({ cover_url: coverUrl })
      .not("id", "is", null);

    setBranding(prev => ({ ...prev, coverUrl }));
    toast.success("Обложка обновлена");
  }, []);

  const updateBrandingField = useCallback(async (field: string, value: string) => {
    const { data: current } = await supabase
      .from("admin_branding")
      .select("branding")
      .limit(1)
      .single();

    const currentBranding = (current?.branding as any) || {};
    const updated = { ...currentBranding, [field]: value };

    await supabase
      .from("admin_branding")
      .update({ branding: updated })
      .not("id", "is", null);

    setBranding(prev => ({ ...prev, [field]: value }));
  }, []);

  return {
    branding,
    loading,
    handleCoverUpload,
    updateBrandingField,
    refetch: fetchBranding,
  };
}
