import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, User, Bell, Handshake, Save, Eye, EyeOff, Settings, Upload, X, Loader2, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { PartnerCabinet } from "@/components/organization/PartnerCabinet";
import { OrgProfileSettings } from "@/components/organization/OrgProfileSettings";


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

export default function OrganizationProfile() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };
  const [saving, setSaving] = useState(false);

  // Profile state
  const [profile, setProfile] = useState<ProfileData>({
    full_name: "", email: "", phone: "", avatar_url: "", vk_link: "", telegram_link: "", bio: "",
  });

  // Password state
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Notification state
  const [notifs, setNotifs] = useState<NotifRow[]>(DEFAULT_NOTIFS);
  const [soundEnabled, setSoundEnabled] = useState(false);

  // Org icon state
  const [orgLogoUrl, setOrgLogoUrl] = useState<string>("");
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);

  const [orgIdLoading, setOrgIdLoading] = useState(true);

  // Load organizationId reliably on mount
  useEffect(() => {
    if (!user) { setOrgIdLoading(false); return; }
    const loadOrganizationId = async () => {
      try {
        // Try profile first
        const { data: prof } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("user_id", user.id)
          .single();
        if (prof?.organization_id) {
          setOrganizationId(prof.organization_id);
        }
      } catch (e) {
        console.error("Failed to load organization ID:", e);
      } finally {
        setOrgIdLoading(false);
      }
    };
    loadOrganizationId();
    loadProfile();
    loadNotificationPrefs();
    loadOrgIcon();
  }, [user]);

  const loadProfile = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, email, phone, avatar_url, vk_link, telegram_link, bio")
      .eq("user_id", user!.id)
      .single();
    if (data) {
      setProfile({
        full_name: data.full_name || "",
        email: data.email || user!.email || "",
        phone: data.phone || "",
        avatar_url: data.avatar_url || "",
        vk_link: (data as any).vk_link || "",
        telegram_link: (data as any).telegram_link || "",
        bio: (data as any).bio || "",
      });
      setNewEmail(data.email || user!.email || "");
    }
  };

  const loadNotificationPrefs = async () => {
    const { data } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", user!.id);
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
    const { data: prof } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user!.id)
      .single();
    if (!prof?.organization_id) return;
    setOrganizationId(prof.organization_id);

    const { data: org } = await supabase
      .from("organizations")
      .select("branding")
      .eq("id", prof.organization_id)
      .single();
    if (org?.branding) {
      const b = org.branding as any;
      setOrgLogoUrl(b.logoUrl || b.logo_url || "");
    }
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !organizationId) return;
    setIsUploadingIcon(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `${organizationId}/logo_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("organization-assets")
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("organization-assets")
        .getPublicUrl(filePath);
      const publicUrl = urlData.publicUrl;

      const { data: org } = await supabase
        .from("organizations")
        .select("branding")
        .eq("id", organizationId)
        .single();
      const current = (org?.branding as Record<string, unknown>) || {};
      await supabase
        .from("organizations")
        .update({ branding: { ...current, logoUrl: publicUrl } })
        .eq("id", organizationId);

      setOrgLogoUrl(publicUrl);
      toast.success("Значок организации обновлён");
    } catch (err: any) {
      toast.error("Ошибка загрузки: " + err.message);
    } finally {
      setIsUploadingIcon(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleRemoveIcon = async () => {
    if (!organizationId) return;
    const { data: org } = await supabase
      .from("organizations")
      .select("branding")
      .eq("id", organizationId)
      .single();
    const current = (org?.branding as Record<string, unknown>) || {};
    await supabase
      .from("organizations")
      .update({ branding: { ...current, logoUrl: "" } })
      .eq("id", organizationId);
    setOrgLogoUrl("");
    toast.success("Значок удалён");
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: profile.full_name,
          phone: profile.phone,
          vk_link: profile.vk_link,
          telegram_link: profile.telegram_link,
          bio: profile.bio,
        } as any)
        .eq("user_id", user!.id);
      if (error) throw error;
      toast.success("Профиль сохранён");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!newEmail || newEmail === profile.email) return;
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
      toast.success("Письмо подтверждения отправлено на новый email");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) { toast.error("Минимум 6 символов"); return; }
    if (newPassword !== confirmPassword) { toast.error("Пароли не совпадают"); return; }
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Пароль изменён");
      setNewPassword(""); setConfirmPassword("");
    } catch (e: any) {
      toast.error(e.message);
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
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/organization")} className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold">Профиль</h1>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="mb-6 bg-muted/50 p-1 rounded-xl flex-wrap">
            <TabsTrigger value="profile" className="rounded-lg gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2">
              <User className="w-4 h-4" /> Мой профиль
            </TabsTrigger>
            <TabsTrigger value="settings" className="rounded-lg gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2">
              <Settings className="w-4 h-4" /> Настройки
            </TabsTrigger>
            <TabsTrigger value="notifications" className="rounded-lg gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2">
              <Bell className="w-4 h-4" /> Настройки уведомлений
            </TabsTrigger>
            <TabsTrigger value="partner" className="rounded-lg gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2">
              <Handshake className="w-4 h-4" /> Партнёрская программа
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Profile */}
          <TabsContent value="profile">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Profile info */}
              <Card className="lg:col-span-2 rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-lg">Основная информация</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block">Email</label>
                    <Input value={profile.email} disabled className="bg-muted/30 rounded-xl" />
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

              {/* Right: Icon + Email + Password */}
              <div className="space-y-6">
                {/* Org Icon */}
                <Card className="rounded-2xl">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <ImageIcon className="w-4 h-4" />
                      Значок организации
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Отображается в боковом меню вместо стандартного логотипа
                    </p>
                    <input
                      ref={iconInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleIconUpload}
                    />
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => iconInputRef.current?.click()}
                        className="relative w-16 h-16 rounded-xl border-2 border-dashed border-border flex items-center justify-center overflow-hidden hover:border-primary/50 hover:bg-primary/5 transition-all group/icon"
                      >
                        {isUploadingIcon ? (
                          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
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
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg gap-1"
                          onClick={handleRemoveIcon}
                        >
                          <X className="w-4 h-4" />
                          Удалить
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
                <Card className="rounded-2xl">
                  <CardHeader>
                    <CardTitle className="text-base">Изменить email</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="new@email.com" className="rounded-xl" />
                    <Button variant="outline" className="w-full rounded-xl" onClick={handleChangeEmail} disabled={!newEmail || newEmail === profile.email}>
                      Сохранить email
                    </Button>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl">
                  <CardHeader>
                    <CardTitle className="text-base">Смена пароля</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Новый пароль"
                        className="rounded-xl pr-10"
                      />
                      <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Повторите пароль"
                      className="rounded-xl"
                    />
                    <Button variant="outline" className="w-full rounded-xl" onClick={handleChangePassword} disabled={!newPassword}>
                      Изменить пароль
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Tab 2: Settings */}
          <TabsContent value="settings">
            {organizationId && user?.id && (
              <OrgProfileSettings organizationId={organizationId} userId={user.id} />
            )}
          </TabsContent>

          {/* Tab 3: Notifications */}
          <TabsContent value="notifications">
            <Card className="rounded-2xl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Настройки уведомлений</CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Звук уведомлений</span>
                    <Button
                      variant={soundEnabled ? "default" : "outline"}
                      size="sm"
                      className="rounded-lg text-xs h-8"
                      onClick={() => setSoundEnabled(!soundEnabled)}
                    >
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
                          <td className="text-center py-3 px-3">
                            <Checkbox checked={n.platform} onCheckedChange={() => toggleNotif(n.key, "platform")} />
                          </td>
                          <td className="text-center py-3 px-3">
                            <Checkbox checked={n.browser} onCheckedChange={() => toggleNotif(n.key, "browser")} />
                          </td>
                          <td className="text-center py-3 px-3">
                            <Checkbox checked={n.email} onCheckedChange={() => toggleNotif(n.key, "email")} />
                          </td>
                          <td className="text-center py-3 px-3">
                            <Checkbox checked={false} disabled className="opacity-30" />
                          </td>
                          <td className="text-center py-3 px-3">
                            <Checkbox checked={false} disabled className="opacity-30" />
                          </td>
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
          </TabsContent>

          {/* Tab 3: Partner */}
          <TabsContent value="partner">
            <PartnerCabinet />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
