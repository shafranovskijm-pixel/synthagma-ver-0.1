import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";

export const PROFILE_TABS = [
  { id: "profile", label: "Профиль" },
  { id: "notifications", label: "Уведомления" },
  { id: "documents", label: "Документы" },
  { id: "partner", label: "Партнёр" },
  { id: "help", label: "Помощь" },
] as const;

export const NOTIFICATION_TYPES = [
  { key: "course_updates", label: "Обновление курса и доступов", hint: "Уведомления об изменениях в курсах и доступах" },
  { key: "webinar_reminder", label: "Напоминание о предстоящем вебинаре", hint: "Напоминание за день и за час до вебинара" },
  { key: "homework", label: "Уведомления по домашним заданиям", hint: "Оценки и комментарии к домашним заданиям" },
  { key: "deadline_reminder", label: "Напоминание о сроках дедлайнов", hint: "Предупреждение о приближающихся сроках" },
  { key: "partner_changes", label: "Изменения и транзакции партнёра", hint: "Начисления и изменения в партнёрской программе" },
];

export const CHANNELS = [
  { key: "platform", label: "Платформа", hint: "Уведомления внутри платформы" },
  { key: "browser", label: "Браузер", hint: "Push-уведомления в браузере" },
  { key: "email", label: "Email", hint: "Уведомления на email" },
];

function buildDefaultNotifSettings(): Record<string, Record<string, boolean>> {
  const defaults: Record<string, Record<string, boolean>> = {};
  NOTIFICATION_TYPES.forEach(t => {
    defaults[t.key] = {};
    CHANNELS.forEach(c => {
      defaults[t.key][c.key] = c.key === "platform";
    });
  });
  defaults["webinar_reminder"]["email"] = true;
  return defaults;
}

export function useStudentProfile(effectiveUserId: string, isAdminView: boolean, userId?: string) {
  const queryClient = useQueryClient();

  // Profile form state
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  // Change email state
  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);

  // Change password state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Notification settings
  const [notifSettings, setNotifSettings] = useState<Record<string, Record<string, boolean>>>(buildDefaultNotifSettings);
  const [notifLoaded, setNotifLoaded] = useState(false);

  useEffect(() => {
    if (!effectiveUserId) return;
    const load = async () => {
      const { data } = await supabase
        .from("notification_preferences")
        .select("notification_type, channel, enabled")
        .eq("user_id", effectiveUserId);
      if (data && data.length > 0) {
        setNotifSettings(prev => {
          const next = { ...prev };
          for (const row of data) {
            if (next[row.notification_type]) {
              next[row.notification_type] = { ...next[row.notification_type], [row.channel]: row.enabled };
            }
          }
          return next;
        });
      }
      setNotifLoaded(true);
    };
    load();
  }, [effectiveUserId]);

  const toggleNotif = useCallback(async (type: string, channel: string) => {
    if (!effectiveUserId || isAdminView) return;
    const newValue = !(notifSettings[type]?.[channel] ?? false);
    setNotifSettings(prev => ({
      ...prev,
      [type]: { ...prev[type], [channel]: newValue },
    }));
    const { error } = await supabase
      .from("notification_preferences")
      .upsert({
        user_id: effectiveUserId,
        notification_type: type,
        channel: channel,
        enabled: newValue,
      }, { onConflict: "user_id,notification_type,channel" });
    if (error) {
      setNotifSettings(prev => ({
        ...prev,
        [type]: { ...prev[type], [channel]: !newValue },
      }));
      toast.error("Ошибка", { description: "Не удалось сохранить настройку" });
    }
  }, [effectiveUserId, isAdminView, notifSettings]);

  const { data: profile } = useQuery({
    queryKey: ["student-profile-page", effectiveUserId],
    queryFn: async () => {
      if (!effectiveUserId) return null;
      const { data: p } = await (supabase
        .from("profiles")
        .select("full_name, organization_id, phone, city, bio, avatar_url")
        .eq("user_id", effectiveUserId)
        .maybeSingle() as any);
      if (!p) return null;
      let orgName: string | null = null;
      if (p.organization_id) {
        const { data: org } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", p.organization_id)
          .maybeSingle();
        orgName = org?.name || null;
      }
      return {
        full_name: p.full_name,
        organization_id: p.organization_id,
        organization_name: orgName,
        phone: (p as any).phone || "",
        city: (p as any).city || "",
        bio: (p as any).bio || "",
        avatar_url: (p as any).avatar_url || null,
      };
    },
    enabled: !!effectiveUserId,
  });

  const { data: branding } = useQuery({
    queryKey: ["student-profile-branding", profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return null;
      const { data } = await supabase
        .from("organizations")
        .select("branding")
        .eq("id", profile.organization_id)
        .maybeSingle();
      const b = data?.branding as any;
      return b ? { logoUrl: b.logoUrl, primaryColor: b.primaryColor } : null;
    },
    enabled: !!profile?.organization_id,
  });

  const { data: orgSettings } = useQuery({
    queryKey: ["student-profile-org-settings", profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return null;
      const { data } = await supabase
        .from("organizations")
        .select("student_dashboard_settings")
        .eq("id", profile.organization_id)
        .maybeSingle();
      const s = data?.student_dashboard_settings as any;
      return { showAchievements: s?.showAchievements ?? false };
    },
    enabled: !!profile?.organization_id,
  });

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setPhone(profile.phone || "");
      setCity(profile.city || "");
      setBio(profile.bio || "");
      setAvatarUrl(profile.avatar_url || null);
    }
  }, [profile]);

  const handleSaveProfile = async () => {
    if (!userId) return;
    setProfileSaving(true);
    try {
      const { error } = await (supabase
        .from("profiles")
        .update({ full_name: fullName, phone, city, bio } as any)
        .eq("user_id", userId) as any);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["student-profile-page"] });
      toast.success("Профиль сохранён");
    } catch {
      toast.error("Ошибка", { description: "Не удалось сохранить профиль" });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    const ext = file.name.split(".").pop();
    const path = `avatars/${userId}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("student-documents").upload(path, file, { upsert: true });
    if (uploadError) {
      toast.error("Ошибка загрузки", { description: getErrorMessage(uploadError) });
      return;
    }
    const { data: urlData } = supabase.storage.from("student-documents").getPublicUrl(path);
    const url = urlData.publicUrl;
    await (supabase.from("profiles").update({ avatar_url: url } as any).eq("user_id", userId) as any);
    setAvatarUrl(url);
    queryClient.invalidateQueries({ queryKey: ["student-profile-page"] });
    toast.success("Аватар обновлён");
  };

  const handleChangeEmail = async (userEmail?: string) => {
    if (!newEmail || newEmail === userEmail) return;
    setEmailSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
      toast.success("Письмо отправлено", { description: "Подтвердите новый email по ссылке в письме" });
    } catch (err) {
      toast.error("Ошибка", { description: getErrorMessage(err) });
    } finally {
      setEmailSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword) return;
    if (newPassword !== confirmPassword) {
      toast.error("Ошибка", { description: "Пароли не совпадают" });
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Ошибка", { description: "Пароль должен быть не менее 6 символов" });
      return;
    }
    setPasswordSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Пароль изменён");
    } catch (err) {
      toast.error("Ошибка", { description: getErrorMessage(err) });
    } finally {
      setPasswordSaving(false);
    }
  };

  const initials = profile?.full_name
    ? profile.full_name.split(" ").slice(0, 2).map((n: string) => n[0]).join("").toUpperCase()
    : "У";

  return {
    // Profile data
    profile, branding, orgSettings, initials,
    // Form state
    fullName, setFullName, phone, setPhone, city, setCity, bio, setBio,
    avatarUrl, profileSaving,
    // Email
    newEmail, setNewEmail, emailSaving,
    // Password
    newPassword, setNewPassword, confirmPassword, setConfirmPassword,
    showPassword, setShowPassword, showConfirm, setShowConfirm, passwordSaving,
    // Notifications
    notifSettings, notifLoaded, toggleNotif,
    // Actions
    handleSaveProfile, handleAvatarUpload, handleChangeEmail, handleChangePassword,
  };
}
