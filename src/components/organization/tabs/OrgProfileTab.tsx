import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { User, Bell, Handshake, Save, Eye, EyeOff, Upload, X, Image as ImageIcon, Palette, LogIn, Camera, KeyRound, Mail, AlertTriangle, LayoutGrid, GraduationCap, Users, BarChart3, Link as LinkIcon, HardHat, FileText, Building2, ShoppingBag, RefreshCw, RotateCcw, Briefcase, Sparkles, BookOpen, ClipboardList, Award, Wallet, CreditCard, Bot, MessageSquare, FolderOpen } from "lucide-react";
import { useDashboardSettings, defaultMenuSettings } from "@/hooks/useDashboardSettings";
import { toast } from "sonner";
import { PartnerCabinet } from "@/components/organization/PartnerCabinet";
import { ThemePersonalization } from "@/components/ui/ThemePersonalization";
import { ThemeSelector } from "@/components/ui/ThemeSelector";
import { ProfileBrandingTab } from "@/components/organization/ProfileBrandingTab";
import { ProfileLoginBrandingTab } from "@/components/organization/ProfileLoginBrandingTab";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useOrgTheme, applyOrgTheme } from "@/hooks/useOrgTheme";
import { AvatarLocationHint, OrgIconLocationHint, HintBlock } from "@/components/organization/BrandingHints";
import { SettingsStudentDashboardTab } from "@/components/organization/SettingsStudentDashboardTab";
import { StaffManager } from "@/components/organization/StaffManager";
import { OrgShowcaseAndTelegramSection } from "@/components/organization/OrgShowcaseAndTelegramSection";

interface ProfileData {
  full_name: string;
  email: string;
  phone: string;
  avatar_url: string;
  vk_link: string;
  telegram_link: string;
  bio: string;
}

interface NotifRow {
  key: string;
  label: string;
  platform: boolean;
  browser: boolean;
  email: boolean;
  telegram: boolean;
  app: boolean;
}

const DEFAULT_NOTIFS: NotifRow[] = [
  { key: "group_full", label: "Закончились места в группе", platform: true, browser: false, email: true, telegram: false, app: false },
  { key: "student_completed", label: "Ученик завершил курс", platform: true, browser: true, email: true, telegram: false, app: false },
  { key: "webinar_reminder", label: "Напоминание о вебинаре", platform: true, browser: true, email: true, telegram: false, app: false },
  { key: "homework", label: "Уведомления по домашним заданиям", platform: true, browser: false, email: false, telegram: false, app: false },
  { key: "partner_changes", label: "Изменения и транзакции партнёра", platform: true, browser: false, email: true, telegram: false, app: false },
  { key: "promo_expired", label: "Истёк промокод", platform: true, browser: false, email: true, telegram: false, app: false },
  { key: "student_waiting", label: "Ученик ждёт ответа 24ч", platform: true, browser: true, email: true, telegram: false, app: false },
  { key: "student_paid", label: "Ученик оплатил курс", platform: true, browser: true, email: true, telegram: false, app: false },
];

type SectionKey = "profile" | "theme" | "branding" | "showcase" | "login-branding" | "signin" | "notifications" | "partner" | "menu" | "student-dashboard" | "staff";

const SECTIONS: { key: SectionKey; label: string; icon: React.ElementType; color: string }[] = [
  { key: "profile", label: "Мой профиль", icon: User, color: "text-blue-500" },
  { key: "theme", label: "Тема оформления", icon: Palette, color: "text-violet-500" },
  { key: "branding", label: "Брендирование", icon: ImageIcon, color: "text-teal-500" },
  { key: "showcase", label: "Витрина и Telegram", icon: ShoppingBag, color: "text-fuchsia-500" },
  { key: "login-branding", label: "Бренд. страницы входа", icon: LogIn, color: "text-cyan-500" },
  { key: "signin", label: "Вход", icon: KeyRound, color: "text-orange-500" },
  { key: "notifications", label: "Уведомления", icon: Bell, color: "text-amber-500" },
  { key: "menu", label: "Разделы меню", icon: LayoutGrid, color: "text-indigo-500" },
  { key: "student-dashboard", label: "ЛК ученика", icon: GraduationCap, color: "text-pink-500" },
  { key: "staff", label: "Сотрудники", icon: Users, color: "text-sky-500" },
  { key: "partner", label: "Партнёрская программа", icon: Handshake, color: "text-emerald-500" },
];

interface ProfileTabProps {
  organizationId: string;
  initialSubTab?: string;
}

interface ProfileTabProps {
  organizationId: string;
  initialSubTab?: string;
}

export function OrgProfileTab({ organizationId, initialSubTab }: ProfileTabProps) {
  const { user } = useAuth();
  const initialKey = (SECTIONS.find(s => s.key === initialSubTab)?.key as SectionKey) || "profile";
  const [activeSection, setActiveSection] = useState<SectionKey>(initialKey);
  const [saving, setSaving] = useState(false);

  const [profile, setProfile] = useState<ProfileData>({
    full_name: "", email: "", phone: "", avatar_url: "", vk_link: "", telegram_link: "", bio: "" });
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notifs, setNotifs] = useState<NotifRow[]>(DEFAULT_NOTIFS);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [orgLogoUrl, setOrgLogoUrl] = useState<string>("");
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));

  // Org-wide theme (DB-backed, shared across all sessions/staff)
  const { theme: orgTheme, saveTheme: saveOrgTheme } = useOrgTheme(organizationId);

  // Org login credentials
  const [orgLoginEmail, setOrgLoginEmail] = useState("");
  const [newOrgEmail, setNewOrgEmail] = useState("");
  const [newOrgPassword, setNewOrgPassword] = useState("");
  const [confirmOrgPassword, setConfirmOrgPassword] = useState("");
  const [showOrgPassword, setShowOrgPassword] = useState(false);
  const [savingOrgEmail, setSavingOrgEmail] = useState(false);
  const [savingOrgPassword, setSavingOrgPassword] = useState(false);

  // Menu settings (sidebar visibility) — single source of truth: useDashboardSettings hook + DB
  const { menuSettings, setMenuSettings, reloadMenuSettings: reloadMenu, resetMenuSettings: resetMenu } = useDashboardSettings(organizationId);

  useEffect(() => {
    if (!user) return;
    // Параллельная загрузка всех настроек профиля — экономит ~60% времени открытия раздела
    Promise.all([
      loadProfile(),
      loadNotificationPrefs(),
      loadOrgIcon(),
      loadOrgCredentials(),
    ]).catch((e) => console.warn("OrgProfileTab parallel load failed:", e));
  }, [user, organizationId]);

  const handleSaveMenuSettings = async () => {
    if (!organizationId) return;
    const { error } = await supabase.from("organizations").update({ menu_settings: menuSettings as any }).eq("id", organizationId);
    if (error) { toast.error("Ошибка сохранения"); return; }
    toast.success("Настройки меню сохранены");
  };

  const handleResetMenuSettings = async () => {
    await resetMenu();
    toast.success("Меню восстановлено по умолчанию");
  };

  const handleReloadMenuSettings = async () => {
    await reloadMenu();
    toast.success("Меню обновлено");
  };


  const loadOrgCredentials = async () => {
    if (!organizationId) return;
    let email = "";
    try {
      const { data } = await supabase.rpc("get_decrypted_org_credentials", { p_organization_id: organizationId });
      const row = Array.isArray(data) ? data[0] : null;
      if (row?.login_email) email = row.login_email;
    } catch (e) {
      console.warn("get_decrypted_org_credentials failed, falling back to organizations.email", e);
    }
    if (!email) {
      const { data: org } = await supabase
        .from("organizations")
        .select("email")
        .eq("id", organizationId)
        .maybeSingle();
      if (org?.email) email = org.email;
    }
    if (email) {
      setOrgLoginEmail(email);
      setNewOrgEmail(email);
    }
  };

  const loadProfile = async () => {
    const { data } = await supabase.from("profiles").select("full_name, email, phone, avatar_url, vk_link, telegram_link, bio").eq("user_id", user!.id).single();
    if (data) {
      setProfile({
        full_name: data.full_name || "", email: data.email || user!.email || "", phone: data.phone || "",
        avatar_url: data.avatar_url || "", vk_link: (data as any).vk_link || "",
        telegram_link: (data as any).telegram_link || "", bio: (data as any).bio || "" });
      setNewEmail(data.email || user!.email || "");
    }
  };

  const loadNotificationPrefs = async () => {
    const { data } = await supabase.from("notification_preferences").select("*").eq("user_id", user!.id);
    if (data && data.length > 0) {
      setNotifs(prev => prev.map(n => {
        const getEnabled = (channel: string) => {
          const row = data.find((d: any) => d.notification_type === n.key && d.channel === channel);
          return row ? row.enabled : (channel === "platform" ? n.platform : channel === "browser" ? n.browser : n.email);
        };
        return { ...n, platform: getEnabled("platform"), browser: getEnabled("browser"), email: getEnabled("email") };
      }));
      const soundRow = data.find((d: any) => d.notification_type === "sound" && d.channel === "platform");
      if (soundRow) setSoundEnabled(soundRow.enabled ?? false);
    }
  };

  const loadOrgIcon = async () => {
    const { data: org } = await supabase.from("organizations").select("branding").eq("id", organizationId).single();
    if (org?.branding) {
      const b = org.branding as any;
      setOrgLogoUrl(b.logoUrl || b.logo_url || "");
    }
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingIcon(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `${organizationId}/logo_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("organization-assets").upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("organization-assets").getPublicUrl(filePath);
      const publicUrl = urlData.publicUrl;
      const { data: org } = await supabase.from("organizations").select("branding").eq("id", organizationId).single();
      const current = (org?.branding as Record<string, unknown>) || {};
      await supabase.from("organizations").update({ branding: { ...current, logoUrl: publicUrl } }).eq("id", organizationId);
      setOrgLogoUrl(publicUrl);
      toast.success("Значок организации обновлён");
    } catch (err: any) { toast.error("Ошибка загрузки: " + err.message); }
    finally { setIsUploadingIcon(false); if (e.target) e.target.value = ""; }
  };

  const handleRemoveIcon = async () => {
    const { data: org } = await supabase.from("organizations").select("branding").eq("id", organizationId).single();
    const current = (org?.branding as Record<string, unknown>) || {};
    await supabase.from("organizations").update({ branding: { ...current, logoUrl: "" } }).eq("id", organizationId);
    setOrgLogoUrl("");
    toast.success("Значок удалён");
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setIsUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `${user.id}/avatar_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("organization-assets").upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("organization-assets").getPublicUrl(filePath);
      const publicUrl = urlData.publicUrl;
      await supabase.from("profiles").update({ avatar_url: publicUrl } as any).eq("user_id", user.id);
      setProfile(p => ({ ...p, avatar_url: publicUrl }));
      toast.success("Аватар обновлён");
    } catch (err: any) { toast.error("Ошибка загрузки: " + err.message); }
    finally { setIsUploadingAvatar(false); if (e.target) e.target.value = ""; }
  };

  const handleRemoveAvatar = async () => {
    if (!user) return;
    await supabase.from("profiles").update({ avatar_url: null } as any).eq("user_id", user.id);
    setProfile(p => ({ ...p, avatar_url: "" }));
    toast.success("Аватар удалён");
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").update({
        full_name: profile.full_name, phone: profile.phone,
        vk_link: profile.vk_link, telegram_link: profile.telegram_link, bio: profile.bio } as any).eq("user_id", user!.id);
      if (error) throw error;
      toast.success("Профиль сохранён");
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleChangeEmail = async () => {
    if (!newEmail || newEmail === profile.email) return;
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
      // Reflect in profile immediately so "Мой профиль" shows the new value upon return
      setProfile(p => ({ ...p, email: newEmail }));
      // Persist in profiles table best-effort
      try {
        await supabase.from("profiles").update({ email: newEmail } as any).eq("user_id", user!.id);
      } catch (_) { /* noop */ }
      toast.success("Письмо подтверждения отправлено на новый email. После подтверждения вход будет по новому адресу.");
    } catch (e: any) { toast.error(e.message); }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) { toast.error("Минимум 6 символов"); return; }
    if (newPassword !== confirmPassword) { toast.error("Пароли не совпадают"); return; }
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Пароль изменён");
      setNewPassword(""); setConfirmPassword("");
    } catch (e: any) { toast.error(e.message); }
  };

  const handleChangeOrgEmail = async () => {
    if (!newOrgEmail || newOrgEmail === orgLoginEmail) return;
    setSavingOrgEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke("update-org-email", {
        body: { organization_id: organizationId, new_email: newOrgEmail },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Email для входа обновлён. Сейчас вы будете перенаправлены на страницу входа.");
      setTimeout(async () => {
        await supabase.auth.signOut();
        window.location.href = "/auth";
      }, 1500);
    } catch (e: any) {
      toast.error(e.message || "Ошибка обновления email");
    } finally {
      setSavingOrgEmail(false);
    }
  };

  const handleChangeOrgPassword = async () => {
    if (newOrgPassword.length < 6) { toast.error("Минимум 6 символов"); return; }
    if (newOrgPassword !== confirmOrgPassword) { toast.error("Пароли не совпадают"); return; }
    setSavingOrgPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke("reset-org-password", {
        body: { organization_id: organizationId, new_password: newOrgPassword },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Пароль для входа обновлён. Сейчас вы будете перенаправлены на страницу входа.");
      setNewOrgPassword(""); setConfirmOrgPassword("");
      setTimeout(async () => {
        await supabase.auth.signOut();
        window.location.href = "/auth";
      }, 1500);
    } catch (e: any) {
      toast.error(e.message || "Ошибка обновления пароля");
    } finally {
      setSavingOrgPassword(false);
    }
  };

  const toggleNotif = (key: string, channel: "platform" | "browser" | "email") => {
    setNotifs(prev => prev.map(n => n.key === key ? { ...n, [channel]: !n[channel] } : n));
  };

  const handleSaveNotifs = async () => {
    setSaving(true);
    try {
      const rows: { user_id: string; notification_type: string; channel: string; enabled: boolean }[] = [];
      for (const n of notifs) {
        rows.push({ user_id: user!.id, notification_type: n.key, channel: "platform", enabled: n.platform });
        rows.push({ user_id: user!.id, notification_type: n.key, channel: "browser", enabled: n.browser });
        rows.push({ user_id: user!.id, notification_type: n.key, channel: "email", enabled: n.email });
      }
      rows.push({ user_id: user!.id, notification_type: "sound", channel: "platform", enabled: soundEnabled });
      await supabase.from("notification_preferences").upsert(rows, { onConflict: "user_id,notification_type,channel" });
      toast.success("Настройки уведомлений сохранены");
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleToggleEnforce = async (next: boolean) => {
    try {
      await saveOrgTheme({ enforce: next });
      if (next) {
        // Immediately apply on this device so admin sees the result
        applyOrgTheme({ ...orgTheme, enforce: true });
        toast.success("Единый интерфейс включён — применяется ко всем сотрудникам");
      } else {
        toast.success("Единый интерфейс отключён — каждый сотрудник видит свой выбор");
      }
    } catch (e: any) {
      toast.error(e.message || "Не удалось сохранить настройку");
    }
  };

  if (!user) return null;

  const renderContent = () => {
    switch (activeSection) {
      case "profile":
        return (
          <div className="space-y-6">
            <Card className="rounded-2xl">
              <CardHeader><CardTitle className="text-lg">Основная информация</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 pb-2">
                  <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    className="relative w-20 h-20 rounded-full border-2 border-dashed border-border flex items-center justify-center overflow-hidden hover:border-primary/50 hover:bg-primary/5 transition-all group/avatar"
                  >
                    {isUploadingAvatar ? (
                      <SigmaSpinner />
                    ) : profile.avatar_url ? (
                      <>
                        <img src={profile.avatar_url} alt="Аватар" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center rounded-full">
                          <Camera className="w-5 h-5 text-white" />
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <Camera className="w-5 h-5 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">Фото</span>
                      </div>
                    )}
                  </button>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Фото профиля</p>
                    <p className="text-xs text-muted-foreground mb-2">Виден в правом верхнем углу шапки кабинета вместо ваших инициалов</p>
                    {profile.avatar_url && (
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg gap-1 mt-1 h-7 px-2 text-xs" onClick={handleRemoveAvatar}>
                        <X className="w-3 h-3" /> Удалить
                      </Button>
                    )}
                  </div>
                </div>
                <HintBlock
                  diagram={<AvatarLocationHint className="w-full h-auto" />}
                  text="Аватар появится в правом верхнем углу шапки личного кабинета — на месте круга с инициалами."
                />
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">Email вашего личного аккаунта</label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    {profile.email ? (
                      <div className="flex-1 px-3 py-2 rounded-xl bg-muted/40 border border-border text-sm font-mono text-foreground break-all">
                        {profile.email}
                      </div>
                    ) : (
                      <div className="flex-1 px-3 py-2 rounded-xl bg-muted/40 border border-dashed border-border text-sm text-muted-foreground italic">
                        Email ещё не задан
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl gap-1 h-9 shrink-0"
                      onClick={() => setActiveSection("signin")}
                    >
                      <Mail className="w-3.5 h-3.5" /> Изменить email
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Email меняется в разделе «Вход» → блок «Email вашего личного аккаунта».
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">ФИО</label>
                  <Input value={profile.full_name} onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))} placeholder="Иванов Иван Иванович" className="rounded-xl" />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">Телефон</label>
                  <Input value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} placeholder="+7 (999) 123-45-67" className="rounded-xl" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block">VK</label>
                    <Input value={profile.vk_link} onChange={e => setProfile(p => ({ ...p, vk_link: e.target.value }))} placeholder="https://vk.com/username" className="rounded-xl" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block">Telegram</label>
                    <Input value={profile.telegram_link} onChange={e => setProfile(p => ({ ...p, telegram_link: e.target.value }))} placeholder="@username" className="rounded-xl" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">О себе</label>
                  <Textarea value={profile.bio} onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))} placeholder="Расскажите о себе..." className="rounded-xl min-h-[100px]" />
                </div>
                <Button className="btn-gradient rounded-xl gap-2" onClick={handleSaveProfile} disabled={saving}>
                  <Save className="w-4 h-4" /> Сохранить
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardHeader><CardTitle className="text-base">Личный пароль</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <Input type={showPassword ? "text" : "password"} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Новый пароль" className="rounded-xl pr-10" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Повторите пароль" className="rounded-xl" />
                <Button variant="outline" className="w-full rounded-xl" onClick={handleChangePassword} disabled={!newPassword}>Изменить пароль</Button>
                <p className="text-xs text-muted-foreground">Это пароль вашего личного аккаунта сотрудника. Чтобы изменить email/пароль для входа в кабинет всей организации — откройте раздел «Вход».</p>
              </CardContent>
            </Card>
          </div>
        );

      case "theme":
        return (
          <div className="space-y-6">
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Palette className="w-4 h-4" /> Единый интерфейс организации</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-muted/30 border border-border/60">
                  <div className="flex-1">
                    <p className="font-medium text-sm">Применять визуальную тему ко всем сотрудникам</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Когда включено — выбранная тема и режим (свет/тьма) хранятся в облаке и применяются у всех сотрудников
                      организации на любых устройствах. Когда выключено — каждый сотрудник выбирает оформление сам, и его выбор
                      сохраняется только локально.
                    </p>
                  </div>
                  <Switch
                    checked={orgTheme.enforce}
                    onCheckedChange={handleToggleEnforce}
                    aria-label="Применять тему ко всем сотрудникам"
                  />
                </div>

                <div className={orgTheme.enforce ? "" : "opacity-60 pointer-events-none select-none"}>
                  <ThemePersonalization
                    isDarkMode={isDarkMode}
                    onToggleDark={(dark) => {
                      setIsDarkMode(dark);
                      if (dark) { document.documentElement.classList.add('dark'); localStorage.setItem('theme', 'dark'); }
                      else { document.documentElement.classList.remove('dark'); localStorage.setItem('theme', 'light'); }
                      saveOrgTheme({ themeMode: dark ? 'dark' : 'light' }).catch((e) => toast.error(e.message));
                    }}
                  />
                  <div className="pt-4 mt-4 border-t border-border">
                    <p className="font-medium text-sm mb-1">Визуальная тема</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      {orgTheme.enforce
                        ? "Выбор сохраняется в облаке и применяется ко всем сотрудникам."
                        : "Включите тумблер выше, чтобы тема применялась ко всем сотрудникам."}
                    </p>
                    <ThemeSelector
                      value={orgTheme.themeId}
                      onChange={(id) => {
                        saveOrgTheme({ themeId: id })
                          .then(() => toast.success("Тема организации обновлена"))
                          .catch((e) => toast.error(e.message));
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Значок организации</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <input ref={iconInputRef} type="file" accept="image/*" className="hidden" onChange={handleIconUpload} />
                <div className="flex items-center gap-4">
                  <button onClick={() => iconInputRef.current?.click()} className="relative w-16 h-16 rounded-xl border-2 border-dashed border-border flex items-center justify-center overflow-hidden hover:border-primary/50 hover:bg-primary/5 transition-all group/icon">
                    {isUploadingIcon ? (
                      <SigmaSpinner />
                    ) : orgLogoUrl ? (
                      <>
                        <img src={orgLogoUrl} alt="Значок" className="w-14 h-14 object-contain" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/icon:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                          <Upload className="w-4 h-4 text-white" />
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <Upload className="w-5 h-5 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">Загрузить</span>
                      </div>
                    )}
                  </button>
                  {orgLogoUrl && (
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg gap-1" onClick={handleRemoveIcon}>
                      <X className="w-4 h-4" /> Удалить
                    </Button>
                  )}
                </div>
                <HintBlock
                  diagram={<OrgIconLocationHint className="w-full h-auto" />}
                  text="Значок появится в левом боковом меню над названием организации. Рекомендуется квадратное изображение от 128×128 px, лучше всего — прозрачный PNG."
                />
              </CardContent>
            </Card>
          </div>
        );

      case "branding":
        return user?.id
          ? <ProfileBrandingTab organizationId={organizationId} userId={user.id} />
          : <div className="text-center py-16 text-muted-foreground">Организация не найдена</div>;

      case "showcase":
        return <OrgShowcaseAndTelegramSection organizationId={organizationId} />;

      case "login-branding":
        return user?.id
          ? <ProfileLoginBrandingTab organizationId={organizationId} userId={user.id} />
          : <div className="text-center py-16 text-muted-foreground">Организация не найдена</div>;

      case "signin":
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><Mail className="w-4 h-4" /> Email для входа в кабинет организации</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block">Текущий email входа</label>
                    {orgLoginEmail ? (
                      <div className="px-3 py-2 rounded-xl bg-muted/40 border border-border text-sm font-mono text-foreground break-all">
                        {orgLoginEmail}
                      </div>
                    ) : (
                      <div className="px-3 py-2 rounded-xl bg-muted/40 border border-dashed border-border text-sm text-muted-foreground italic">
                        Email для входа ещё не задан — укажите его ниже.
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1 block">Новый email</label>
                    <Input
                      type="email"
                      value={newOrgEmail}
                      onChange={e => setNewOrgEmail(e.target.value)}
                      placeholder="new-org@email.com"
                      className="rounded-xl"
                      autoComplete="off"
                    />
                  </div>
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-warning/10 border border-warning/20">
                    <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                    <p className="text-xs text-warning-foreground/80">После смены email вы будете автоматически разлогинены и должны войти заново с новым адресом.</p>
                  </div>
                  <Button
                    className="w-full rounded-xl btn-gradient"
                    onClick={handleChangeOrgEmail}
                    disabled={!newOrgEmail || newOrgEmail === orgLoginEmail || savingOrgEmail}
                  >
                    {savingOrgEmail ? "Сохранение..." : "Изменить email"}
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><KeyRound className="w-4 h-4" /> Пароль для входа в кабинет организации</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="relative">
                    <Input
                      type={showOrgPassword ? "text" : "password"}
                      value={newOrgPassword}
                      onChange={e => setNewOrgPassword(e.target.value)}
                      placeholder="Новый пароль (мин. 6 символов)"
                      className="rounded-xl pr-10"
                    />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowOrgPassword(!showOrgPassword)}>
                      {showOrgPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <Input
                    type={showOrgPassword ? "text" : "password"}
                    value={confirmOrgPassword}
                    onChange={e => setConfirmOrgPassword(e.target.value)}
                    placeholder="Повторите пароль"
                    className="rounded-xl"
                  />
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-warning/10 border border-warning/20">
                    <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                    <p className="text-xs text-warning-foreground/80">После смены пароля вы будете автоматически разлогинены и должны войти заново с новым паролем.</p>
                  </div>
                  <Button
                    className="w-full rounded-xl btn-gradient"
                    onClick={handleChangeOrgPassword}
                    disabled={!newOrgPassword || savingOrgPassword}
                  >
                    {savingOrgPassword ? "Сохранение..." : "Изменить пароль"}
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base">Email вашего личного аккаунта</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Это email для входа лично вашим аккаунтом сотрудника (не путайте с email для входа всей организации, см. карточки выше).
                </p>
                <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="new@email.com" className="rounded-xl" />
                <Button variant="outline" className="rounded-xl" onClick={handleChangeEmail} disabled={!newEmail || newEmail === profile.email}>Сохранить email</Button>
              </CardContent>
            </Card>
          </div>
        );

      case "notifications":
        return (
          <Card className="rounded-2xl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Настройки уведомлений</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Звук уведомлений</span>
                  <Button variant={soundEnabled ? "default" : "outline"} size="sm" className="rounded-lg text-xs h-8" onClick={() => setSoundEnabled(!soundEnabled)}>
                    {soundEnabled ? "Вкл" : "Выкл"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 pr-4 font-medium text-muted-foreground">Тип уведомления</th>
                      <th className="text-center py-3 px-3 font-medium text-muted-foreground">Платформа</th>
                      <th className="text-center py-3 px-3 font-medium text-muted-foreground">Браузер</th>
                      <th className="text-center py-3 px-3 font-medium text-muted-foreground">Email</th>
                      <th className="text-center py-3 px-3 font-medium text-muted-foreground opacity-40">Телеграм</th>
                      <th className="text-center py-3 px-3 font-medium text-muted-foreground opacity-40">Приложение</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notifs.map(n => (
                      <tr key={n.key} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-3 pr-4">{n.label}</td>
                        <td className="text-center py-3 px-3"><Checkbox checked={n.platform} onCheckedChange={() => toggleNotif(n.key, "platform")} /></td>
                        <td className="text-center py-3 px-3"><Checkbox checked={n.browser} onCheckedChange={() => toggleNotif(n.key, "browser")} /></td>
                        <td className="text-center py-3 px-3"><Checkbox checked={n.email} onCheckedChange={() => toggleNotif(n.key, "email")} /></td>
                        <td className="text-center py-3 px-3"><Checkbox checked={false} disabled className="opacity-30" /></td>
                        <td className="text-center py-3 px-3"><Checkbox checked={false} disabled className="opacity-30" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between mt-6">
                <p className="text-xs text-muted-foreground">Телеграм и Приложение — скоро</p>
                <Button className="btn-gradient rounded-xl gap-2" onClick={handleSaveNotifs} disabled={saving}>
                  <Save className="w-4 h-4" /> Сохранить
                </Button>
              </div>
            </CardContent>
          </Card>
        );

      case "menu": {
        type MenuKey = keyof typeof defaultMenuSettings;
        type Badge = "beta" | "paid" | "always";
        type Group = {
          title: string;
          desc: string;
          items: { icon: any; bg: string; color: string; label: string; desc: string; key?: MenuKey; badge?: Badge; alwaysOn?: boolean }[];
        };
        const groups: Group[] = [
          {
            title: "Обучение",
            desc: "Базовые разделы — всегда доступны",
            items: [
              { icon: BookOpen, bg: "bg-primary/15", color: "text-primary", label: "Курсы", desc: "Каталог и редактор курсов", alwaysOn: true, badge: "always" },
              { icon: Users, bg: "bg-accent/15", color: "text-accent", label: "Ученики", desc: "Управление учениками", key: "showStudents" },
              { icon: Building2, bg: "bg-primary/15", color: "text-primary", label: "Компании", desc: "Корпоративные клиенты", key: "showCompanies" },
              { icon: ClipboardList, bg: "bg-accent/15", color: "text-accent", label: "Журналы", desc: "Журналы регистрации документов", key: "showJournals" },
              { icon: MessageSquare, bg: "bg-primary/15", color: "text-primary", label: "Чаты", desc: "Общение с учениками", alwaysOn: true, badge: "always" },
            ],
          },
          {
            title: "Аналитика",
            desc: "Метрики и регистрация",
            items: [
              { icon: BarChart3, bg: "bg-accent/15", color: "text-accent", label: "Статистика", desc: "Аналитика и отчёты", key: "showStats" },
              { icon: LinkIcon, bg: "bg-primary/15", color: "text-primary", label: "Ссылки регистрации", desc: "Самостоятельная регистрация", key: "showLinks" },
            ],
          },
          {
            title: "Бизнес",
            desc: "Финансы, маркетинг, продажи",
            items: [
              { icon: Briefcase, bg: "bg-accent/15", color: "text-accent", label: "Продажи", desc: "CRM: воронка, лиды, КП, рассылки", alwaysOn: true, badge: "always" },
              { icon: Bot, bg: "bg-primary/15", color: "text-primary", label: "ИИ-преподаватели", desc: "Голосовые ИИ-аватары", key: "showAITutors", badge: "beta" },
              { icon: ShoppingBag, bg: "bg-accent/15", color: "text-accent", label: "Маркетплейс", desc: "Магазин курсов", key: "showServices" },
              { icon: Sparkles, bg: "bg-primary/15", color: "text-primary", label: "Витрина и Telegram", desc: "Публичная витрина курсов", alwaysOn: true, badge: "always" },
              { icon: CreditCard, bg: "bg-accent/15", color: "text-accent", label: "Подписка", desc: "Тариф организации", key: "showSubscription" },
            ],
          },
          {
            title: "Документооборот",
            desc: "Документы, реестры, регламенты",
            items: [
              { icon: FileText, bg: "bg-destructive/15", color: "text-destructive", label: "Документы", desc: "Документы организации", key: "showDocuments" },
              { icon: Award, bg: "bg-primary/15", color: "text-primary", label: "ФРДО", desc: "Реестр документов об образовании", key: "showFrdo" },
              { icon: HardHat, bg: "bg-accent/15", color: "text-accent", label: "Охрана труда", desc: "Модуль ОТ", key: "showLaborSafety", badge: "paid" },
              { icon: FolderOpen, bg: "bg-primary/15", color: "text-primary", label: "Библиотека", desc: "Хранилище материалов", key: "showLibrary" },
            ],
          },
        ];

        const renderBadge = (b?: Badge) => {
          if (b === "beta") return <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">Beta</span>;
          if (b === "paid") return <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent/15 text-accent font-semibold">Платный</span>;
          if (b === "always") return <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold">Всегда</span>;
          return null;
        };

        return (
          <div className="max-w-3xl">
            <p className="text-xs lg:text-sm text-muted-foreground mb-4 lg:mb-5">
              Тумблеры показывают реальное состояние меню. Изменения применяются после сохранения и видны во всех вкладках организации.
            </p>
            <div className="space-y-6">
              {groups.map(group => (
                <div key={group.title}>
                  <div className="mb-2">
                    <h4 className="text-sm font-semibold text-foreground">{group.title}</h4>
                    <p className="text-xs text-muted-foreground">{group.desc}</p>
                  </div>
                  <div className="space-y-2">
                    {group.items.map((item, idx) => {
                      const Icon = item.icon;
                      const isAlways = item.alwaysOn;
                      const isOn = isAlways ? true : !!menuSettings[item.key as MenuKey];
                      return (
                        <div
                          key={`${group.title}-${idx}`}
                          className={`flex items-center justify-between p-3 lg:p-4 rounded-xl border transition-all ${
                            isAlways ? "border-border/40 bg-muted/30" : "border-border/60 hover:border-primary/30 hover:bg-accent/5"
                          }`}
                        >
                          <div className="flex items-center gap-3 lg:gap-4 min-w-0">
                            <div className={`w-11 h-11 lg:w-12 lg:h-12 rounded-xl ${item.bg} flex items-center justify-center shadow-sm shrink-0`}>
                              <Icon className={`w-5 h-5 lg:w-[22px] lg:h-[22px] ${item.color}`} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-medium text-sm lg:text-base">{item.label}</p>
                                {renderBadge(item.badge)}
                              </div>
                              <p className="text-xs lg:text-sm text-muted-foreground">{item.desc}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              if (isAlways || !item.key) return;
                              const k = item.key as MenuKey;
                              setMenuSettings(prev => ({ ...prev, [k]: !prev[k] }) as any);
                            }}
                            disabled={isAlways}
                            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0 ${
                              isOn ? "bg-primary shadow-md" : "bg-muted"
                            } ${isAlways ? "opacity-60 cursor-not-allowed" : ""}`}
                          >
                            <span
                              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                                isOn ? "translate-x-6" : "translate-x-1"
                              }`}
                            />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-4 border-t border-border flex flex-wrap gap-2">
              <Button className="btn-gradient rounded-xl gap-2 text-sm" onClick={handleSaveMenuSettings}><Save className="w-4 h-4" /> Сохранить</Button>
              <Button variant="outline" className="rounded-xl gap-2 text-sm" onClick={handleReloadMenuSettings}><RefreshCw className="w-4 h-4" /> Обновить меню</Button>
              <Button variant="ghost" className="rounded-xl gap-2 text-sm" onClick={handleResetMenuSettings}><RotateCcw className="w-4 h-4" /> По умолчанию</Button>
            </div>
          </div>
        );
      }


      case "student-dashboard":
        return (
          <div className="max-w-3xl">
            <SettingsStudentDashboardTab organizationId={organizationId} />
          </div>
        );

      case "staff":
        return <StaffManager organizationId={organizationId} />;

      case "partner":
        return <PartnerCabinet />;

      default:
        return null;
    }
  };

  const active = SECTIONS.find(s => s.key === activeSection)!;

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 min-h-[60vh]">
      {/* Left vertical menu (mirrors AdminSettings.tsx) */}
      <nav className="w-full lg:w-[240px] shrink-0">
        <div className="lg:sticky lg:top-4 overflow-x-auto lg:overflow-x-visible">
          <div className="flex lg:flex-col gap-1 min-w-max lg:min-w-0 p-1 bg-card rounded-xl border border-border/60">
            {SECTIONS.map(s => {
              const Icon = s.icon;
              const isActive = activeSection === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setActiveSection(s.key)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-sm transition-all whitespace-nowrap ${
                    isActive
                      ? "bg-primary/10 text-primary font-medium shadow-sm"
                      : "text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-primary" : s.color}`} />
                  <span className="hidden lg:inline">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Right content */}
      <div className="flex-1 min-w-0">
        <div className="bg-card rounded-xl lg:rounded-2xl border border-border/60 p-4 lg:p-6">
          <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border/60">
            <active.icon className={`w-5 h-5 ${active.color}`} />
            <h3 className="font-display font-semibold text-lg">{active.label}</h3>
          </div>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
