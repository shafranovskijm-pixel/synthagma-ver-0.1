import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "next-themes";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { User, Video, FileCheck, FileText, Trophy, Palette, Users, Sun, Moon, Monitor, Loader2, Bell, Eye, EyeOff, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { HelpCircle, AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { VideoIdentification } from "@/components/student/VideoIdentification";
import { StudentConsentForm } from "@/components/student/StudentConsentForm";
import { StudentDocumentsUpload } from "@/components/student/StudentDocumentsUpload";
import { AchievementsPanel } from "@/components/student/AchievementsPanel";
import { StudentProfileSidebar } from "@/components/student/StudentProfileSidebar";
import { cn } from "@/lib/utils";
import { ThemeSelector } from "@/components/ui/ThemeSelector";
import { toast } from "sonner";

export default function StudentProfile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();

  // Admin impersonation support
  const [adminViewData] = useState(() => {
    try {
      const raw = localStorage.getItem('adminViewAsStudent');
      if (raw) return JSON.parse(raw) as { userId: string; name: string; orgReturn?: string };
    } catch {}
    return null;
  });
  const isAdminView = !!adminViewData;
  const effectiveUserId = adminViewData?.userId || user?.id || null;
  const [activeTab, setActiveTab] = useState("profile");

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

  const NOTIFICATION_TYPES = [
    { key: "course_updates", label: "Обновление курса и доступов", hint: "Уведомления об изменениях в курсах и доступах" },
    { key: "webinar_reminder", label: "Напоминание о предстоящем вебинаре", hint: "Напоминание за день и за час до вебинара" },
    { key: "homework", label: "Уведомления по домашним заданиям", hint: "Оценки и комментарии к домашним заданиям" },
    { key: "deadline_reminder", label: "Напоминание о сроках дедлайнов", hint: "Предупреждение о приближающихся сроках" },
    { key: "partner_changes", label: "Изменения и транзакции партнёра", hint: "Начисления и изменения в партнёрской программе" },
  ];

  const CHANNELS = [
    { key: "platform", label: "Платформа", hint: "Уведомления внутри платформы" },
    { key: "browser", label: "Браузер", hint: "Push-уведомления в браузере" },
    { key: "email", label: "Email", hint: "Уведомления на email" },
  ];

  const [notifSettings, setNotifSettings] = useState<Record<string, Record<string, boolean>>>(() => {
    const defaults: Record<string, Record<string, boolean>> = {};
    NOTIFICATION_TYPES.forEach(t => {
      defaults[t.key] = {};
      CHANNELS.forEach(c => {
        defaults[t.key][c.key] = c.key === "platform";
      });
    });
    defaults["webinar_reminder"]["email"] = true;
    return defaults;
  });

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

  const { data: profile, isLoading } = useQuery({
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

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setPhone(profile.phone || "");
      setCity(profile.city || "");
      setBio(profile.bio || "");
      setAvatarUrl(profile.avatar_url || null);
    }
  }, [profile]);

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

  const { data: consentCount } = useQuery({
    queryKey: ["consent-badge", effectiveUserId, profile?.organization_id],
    queryFn: async () => {
      if (!effectiveUserId) return 0;
      const query = supabase
        .from("student_consents")
        .select("id", { count: "exact", head: true })
        .eq("user_id", effectiveUserId)
        .eq("status", "signed");
      if (profile?.organization_id) {
        query.eq("organization_id", profile.organization_id);
      }
      const { count } = await query;
      return (count ?? 0) > 0 ? 0 : 1;
    },
    enabled: !!effectiveUserId,
  });

  const REQUIRED_DOC_TYPES = ["passport", "snils", "education_document"];
  const { data: docsNeeded } = useQuery({
    queryKey: ["docs-badge", effectiveUserId, profile?.organization_id],
    queryFn: async () => {
      if (!effectiveUserId) return REQUIRED_DOC_TYPES.length;
      const query = supabase
        .from("student_identity_documents")
        .select("type")
        .eq("user_id", effectiveUserId);
      if (profile?.organization_id) {
        query.eq("organization_id", profile.organization_id);
      }
      const { data } = await query;
      const uploadedTypes = new Set(data?.map(d => d.type) || []);
      return REQUIRED_DOC_TYPES.filter(t => !uploadedTypes.has(t)).length;
    },
    enabled: !!effectiveUserId,
  });

  const handleSaveProfile = async () => {
    if (!user?.id) return;
    setProfileSaving(true);
    try {
      const { error } = await (supabase
        .from("profiles")
        .update({ full_name: fullName, phone, city, bio } as any)
        .eq("user_id", user.id) as any);
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
    if (!file || !user?.id) return;
    const ext = file.name.split(".").pop();
    const path = `avatars/${user.id}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("student-documents").upload(path, file, { upsert: true });
    if (uploadError) {
      toast.error("Ошибка загрузки", { description: uploadError.message });
      return;
    }
    const { data: urlData } = supabase.storage.from("student-documents").getPublicUrl(path);
    const url = urlData.publicUrl;
    await (supabase.from("profiles").update({ avatar_url: url } as any).eq("user_id", user.id) as any);
    setAvatarUrl(url);
    queryClient.invalidateQueries({ queryKey: ["student-profile-page"] });
    toast.success("Аватар обновлён");
  };

  const handleChangeEmail = async () => {
    if (!newEmail || newEmail === user?.email) return;
    setEmailSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
      toast.success("Письмо отправлено", { description: "Подтвердите новый email по ссылке в письме" });
    } catch (err: any) {
      toast.error("Ошибка", { description: err.message });
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
    } catch (err: any) {
      toast.error("Ошибка", { description: err.message });
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const handleAdminBack = () => {
    localStorage.removeItem('adminViewAsStudent');
    navigate(adminViewData?.orgReturn || '/admin');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const initials = profile?.full_name
    ? profile.full_name.split(" ").slice(0, 2).map((n: string) => n[0]).join("").toUpperCase()
    : "У";

  const noOrgFallback = (
    <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
      <AlertCircle className="w-10 h-10 text-muted-foreground" />
      <p className="text-muted-foreground">Вы пока не привязаны к организации.</p>
      <p className="text-sm text-muted-foreground">Обратитесь к администратору для подключения.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <StudentProfileSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        logoUrl={branding?.logoUrl}
        consentBadge={consentCount ?? 0}
        docsBadge={docsNeeded ?? 0}
        showAchievements={orgSettings?.showAchievements ?? false}
        isAdminView={isAdminView}
        onLogout={handleLogout}
        onBack={handleAdminBack}
      />

      <div className="lg:pl-[88px] min-h-screen">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

          {/* Profile section */}
          {activeTab === "profile" && (
            <div className="space-y-6">
              {/* Avatar card */}
              <Card className="rounded-2xl border-border/60 shadow-sm overflow-hidden">
                <div className="relative h-24 bg-gradient-to-r from-primary/80 to-primary">
                  {branding?.logoUrl && (
                    <img src={branding.logoUrl} alt="" className="absolute right-6 top-1/2 -translate-y-1/2 h-12 opacity-20" />
                  )}
                </div>
                <div className="px-6 pb-6 -mt-10">
                  <div className="flex items-end gap-4">
                    <div className="relative group">
                      <Avatar className="w-20 h-20 border-4 border-background shadow-lg">
                        {avatarUrl ? <AvatarImage src={avatarUrl} alt={fullName} /> : null}
                        <AvatarFallback className="bg-primary/10 text-primary text-2xl font-semibold">{initials}</AvatarFallback>
                      </Avatar>
                      {!isAdminView && (
                        <label className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                          <Camera className="w-5 h-5 text-white" />
                          <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                        </label>
                      )}
                    </div>
                    <div className="pb-1">
                      <p className="text-lg font-semibold">{profile?.full_name || "Ученик"}</p>
                      {profile?.organization_name && (
                        <p className="text-sm text-muted-foreground">{profile.organization_name}</p>
                      )}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Profile form */}
              <Card className="rounded-2xl border-border/60 shadow-sm">
                <CardHeader>
                  <CardTitle>Настройки профиля</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input value={user?.email || ""} disabled className="rounded-xl bg-muted/50" />
                  </div>
                  <div className="space-y-2">
                    <Label>Имя и Фамилия</Label>
                    <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Введите имя" disabled={isAdminView} className="rounded-xl" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Телефон</Label>
                      <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 999 123-45-67" disabled={isAdminView} className="rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label>Город</Label>
                      <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Введите город" disabled={isAdminView} className="rounded-xl" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>О себе</Label>
                    <Textarea
                      value={bio}
                      onChange={e => setBio(e.target.value)}
                      placeholder="Опишите карьеру и достижения"
                      rows={4}
                      disabled={isAdminView}
                      className="rounded-xl"
                    />
                  </div>
                  {!isAdminView && (
                    <Button onClick={handleSaveProfile} disabled={profileSaving} className="rounded-xl">
                      {profileSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Сохранить
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Email & password cards */}
              {!isAdminView && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <Card className="rounded-2xl border-border/60 shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-base">Изменить email</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Новый email" className="rounded-xl" />
                      <Button onClick={handleChangeEmail} disabled={emailSaving || newEmail === user?.email} size="sm" className="w-full rounded-xl">
                        {emailSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Сохранить
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl border-border/60 shadow-sm">
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
                          className="rounded-xl"
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <div className="relative">
                        <Input
                          type={showConfirm ? "text" : "password"}
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                          placeholder="Повторите пароль"
                          className="rounded-xl"
                        />
                        <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <Button onClick={handleChangePassword} disabled={passwordSaving || !newPassword} size="sm" className="w-full rounded-xl">
                        {passwordSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Сменить пароль
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          )}

          {/* Notifications */}
          {activeTab === "notifications" && (
            <Card className="rounded-2xl border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle>Настройки уведомлений</CardTitle>
              </CardHeader>
              <CardContent>
                <TooltipProvider>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-3 pr-4 text-sm font-medium text-muted-foreground">Тип уведомления</th>
                          {CHANNELS.map(ch => (
                            <th key={ch.key} className="text-center py-3 px-3 text-sm font-medium text-muted-foreground whitespace-nowrap">
                              <Tooltip>
                                <TooltipTrigger className="inline-flex items-center gap-1">
                                  {ch.label}
                                  <HelpCircle className="w-3.5 h-3.5" />
                                </TooltipTrigger>
                                <TooltipContent>{ch.hint}</TooltipContent>
                              </Tooltip>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {NOTIFICATION_TYPES.map(nt => (
                          <tr key={nt.key} className="border-b border-border last:border-0">
                            <td className="py-5 pr-4">
                              <Tooltip>
                                <TooltipTrigger className="inline-flex items-center gap-1 text-sm">
                                  {nt.label}
                                  <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>{nt.hint}</TooltipContent>
                              </Tooltip>
                            </td>
                            {CHANNELS.map(ch => (
                              <td key={ch.key} className="text-center py-5 px-3">
                                <Switch
                                  checked={notifSettings[nt.key]?.[ch.key] ?? false}
                                  onCheckedChange={() => toggleNotif(nt.key, ch.key)}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TooltipProvider>
              </CardContent>
            </Card>
          )}

          {/* Identification */}
          {activeTab === "identification" && (
            <Card className="rounded-2xl border-border/60 shadow-sm">
              <CardContent className="pt-6">
                {effectiveUserId && (
                  <VideoIdentification
                    userId={effectiveUserId}
                    userName={profile?.full_name || "Ученик"}
                    organizationId={profile?.organization_id || undefined}
                    embedded={true}
                  />
                )}
              </CardContent>
            </Card>
          )}

          {/* Consent */}
          {activeTab === "consent" && (
            <Card className="rounded-2xl border-border/60 shadow-sm">
              <CardContent className="pt-6">
                {effectiveUserId && (
                  <StudentConsentForm
                    userId={effectiveUserId}
                    userName={profile?.full_name || "Ученик"}
                    organizationId={profile?.organization_id || ""}
                    embedded={true}
                  />
                )}
              </CardContent>
            </Card>
          )}

          {/* Documents */}
          {activeTab === "documents" && (
            <Card className="rounded-2xl border-border/60 shadow-sm">
              <CardContent className="pt-6">
                {effectiveUserId && (
                  <StudentDocumentsUpload
                    userId={effectiveUserId}
                    organizationId={profile?.organization_id || ""}
                    isOpen={false}
                    onOpenChange={() => {}}
                    embedded={true}
                  />
                )}
              </CardContent>
            </Card>
          )}

          {/* Achievements */}
          {activeTab === "achievements" && orgSettings?.showAchievements && (
            <Card className="rounded-2xl border-border/60 shadow-sm">
              <CardContent className="pt-6">
                {effectiveUserId && (
                  <AchievementsPanel
                    userId={effectiveUserId}
                    isOpen={false}
                    onOpenChange={() => {}}
                    embedded={true}
                  />
                )}
              </CardContent>
            </Card>
          )}

          {/* Theme */}
          {activeTab === "theme" && (
            <Card className="rounded-2xl border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle>Тема оформления</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <ThemeSelector />
                <div>
                  <p className="font-medium text-sm mb-1">Режим оформления</p>
                  <p className="text-xs text-muted-foreground mb-3">Светлая или тёмная тема</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      { id: "light", label: "Светлая", icon: Sun, desc: "Классическая светлая тема" },
                      { id: "dark", label: "Тёмная", icon: Moon, desc: "Тёмная тема для работы ночью" },
                      { id: "system", label: "Системная", icon: Monitor, desc: "Следует настройкам вашего устройства" },
                    ].map(t => (
                      <button
                        key={t.id}
                        onClick={() => setTheme(t.id)}
                        className={cn(
                          "flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all",
                          theme === t.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/30"
                        )}
                      >
                        <t.icon className={cn("w-8 h-8", theme === t.id ? "text-primary" : "text-muted-foreground")} />
                        <span className="font-medium">{t.label}</span>
                        <span className="text-xs text-muted-foreground text-center">{t.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Partner program */}
          {activeTab === "partner" && (
            <Card className="rounded-2xl border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle>Партнёрская программа</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  Приглашайте организации на платформу и получайте от 10% до 25% комиссии с их оплат подписки в течение 2 лет.
                </p>
                <Button onClick={() => navigate("/partner")} className="gap-2 rounded-xl">
                  <Users className="w-4 h-4" />
                  Перейти к партнёрской программе
                </Button>
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}
