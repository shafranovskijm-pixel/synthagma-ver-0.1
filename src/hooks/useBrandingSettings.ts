import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import { useOrganizationCore } from "@/hooks/useOrganizationCore";
import { useQueryClient } from "@tanstack/react-query";

interface BrandingSettings {
  coverUrl: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string;
  showOrgName: boolean;
  coverPosition: 'cover' | 'contain' | 'center' | 'top' | 'bottom';
  customName: string;
  customSubtitle: string;
}

export function useBrandingSettings(organizationId: string | null, userId: string | undefined) {
  const [brandingSettings, setBrandingSettings] = useState<BrandingSettings>({
    coverUrl: '',
    primaryColor: '#0d9488',
    secondaryColor: '#14b8a6',
    logoUrl: '',
    showOrgName: true,
    coverPosition: 'center',
    customName: '',
    customSubtitle: ''
  });
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isSavingBranding, setIsSavingBranding] = useState(false);

  // Берём branding из общего кэша вместо отдельного SELECT
  const { data: orgCore } = useOrganizationCore(organizationId);
  useEffect(() => {
    if (!orgCore?.branding) return;
    const branding = orgCore.branding as Record<string, unknown>;
    setBrandingSettings({
      coverUrl: (branding.coverUrl as string) || '',
      primaryColor: (branding.primaryColor as string) || '#0d9488',
      secondaryColor: (branding.secondaryColor as string) || '#14b8a6',
      logoUrl: (branding.logoUrl as string) || '',
      showOrgName: branding.showOrgName !== false,
      coverPosition: (branding.coverPosition as BrandingSettings['coverPosition']) || 'cover',
      customName: (branding.customName as string) || '',
      customSubtitle: (branding.customSubtitle as string) || ''
    });
  }, [orgCore?.branding]);

  // Handle cover image upload
  const handleCoverUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Файл слишком большой. Максимум 5 МБ');
      return;
    }
    setIsUploadingCover(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${userId}/cover.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('org-branding')
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage
        .from('org-branding')
        .getPublicUrl(filePath);
      setBrandingSettings(prev => ({ ...prev, coverUrl: publicUrl }));
      toast.success('Обложка загружена');
    } catch (error) {
      console.error('Error uploading cover:', error);
      toast.error('Ошибка загрузки обложки');
    } finally {
      setIsUploadingCover(false);
    }
  }, [userId]);

  // Handle logo upload
  const handleLogoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Файл слишком большой. Максимум 2 МБ');
      return;
    }
    setIsUploadingLogo(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${userId}/logo.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('org-branding')
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage
        .from('org-branding')
        .getPublicUrl(filePath);
      setBrandingSettings(prev => ({ ...prev, logoUrl: publicUrl }));
      toast.success('Логотип загружен');
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error('Ошибка загрузки логотипа');
    } finally {
      setIsUploadingLogo(false);
    }
  }, [userId]);

  const qc = useQueryClient();
  // Save branding settings
  const saveBranding = useCallback(async () => {
    if (!organizationId) return;
    setIsSavingBranding(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ branding: JSON.parse(JSON.stringify(brandingSettings)) as Json })
        .eq('id', organizationId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["org-core", organizationId] });
      toast.success('Настройки брендирования сохранены');
    } catch (error) {
      console.error('Error saving branding:', error);
      toast.error('Ошибка сохранения настроек');
    } finally {
      setIsSavingBranding(false);
    }
  }, [organizationId, brandingSettings, qc]);

  return {
    brandingSettings,
    setBrandingSettings,
    isUploadingCover,
    isUploadingLogo,
    isSavingBranding,
    handleCoverUpload,
    handleLogoUpload,
    saveBranding,
  };
}
