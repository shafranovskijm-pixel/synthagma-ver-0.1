import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "next-themes";
import { User, FileText, Users, Sun, Moon, Monitor, Bell, Eye, EyeOff, Camera, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { VideoIdentification } from "@/components/student/VideoIdentification";
import { StudentConsentForm } from "@/components/student/StudentConsentForm";
import { StudentDocumentsUpload } from "@/components/student/StudentDocumentsUpload";
import { StudentDataSubjectRequests } from "@/components/student/StudentDataSubjectRequests";
import { AchievementsPanel } from "@/components/student/AchievementsPanel";
import { ThemeSelector } from "@/components/ui/ThemeSelector";
import { StudentPartnerTab } from "@/components/student/StudentPartnerTab";
import { RadioSettings } from "@/components/radio/RadioSettings";
import { StudentProfileBanner } from "@/components/student/StudentProfileBanner";
import { cn } from "@/lib/utils";
import HelpCenter from "@/pages/HelpCenter";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useStudentProfile, PROFILE_TABS, NOTIFICATION_TYPES, CHANNELS } from "@/hooks/useStudentProfile";

interface StudentProfileContentProps {
  effectiveUserId: string;
  isAdminView?: boolean;
  /** Number of pending document actions (used for the red badge on the Documents tab). */
  pendingDocsCount?: number;
}

const TAB_ICONS: Record<string, typeof User> = {
  profile: User,
  notifications: Bell,
  documents: FileText,
  partner: Users,
  help: HelpCircle,
};

export function StudentProfileContent({ effectiveUserId, isAdminView = false, pendingDocsCount = 0 }: StudentProfileContentProps) {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSection = searchParams.get("section");
  const [activeTab, setActiveTab] = useState(() => {
    if (initialSection && PROFILE_TABS.some(t => t.id === initialSection)) return initialSection;
    return "profile";
  });

  // Re-apply ?section=… when it changes (e.g. user navigates from header again).
  useEffect(() => {
    if (initialSection && PROFILE_TABS.some(t => t.id === initialSection)) {
      setActiveTab(initialSection);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSection]);

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
    // Clean the section param from the URL after a manual switch so it doesn't
    // override future navigation back to "profile".
    if (searchParams.has("section")) {
      const next = new URLSearchParams(searchParams);
      next.delete("section");
      setSearchParams(next, { replace: true });
    }
  };

  const sp = useStudentProfile(effectiveUserId, isAdminView, user?.id);

  const visibleTabs = PROFILE_TABS.filter(t => {
    if ((t.id as string) === "achievements") return sp.orgSettings?.showAchievements;
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Horizontal profile tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {visibleTabs.map(tab => {
          const Icon = TAB_ICONS[tab.id] || User;
          const showDocsBadge = tab.id === "documents" && pendingDocsCount > 0;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={cn(
                "relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all shrink-0",
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              {showDocsBadge && (
                <span
                  aria-label={`${pendingDocsCount} требуют внимания`}
                  className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-none"
                >
                  {pendingDocsCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Profile section */}
      {activeTab === "profile" && (
        <div className="space-y-6">
          <Card className="rounded-2xl border-border/60 shadow-sm overflow-hidden">
            <StudentProfileBanner
              userName={sp.profile?.full_name}
              orgName={sp.profile?.organization_name}
              logoUrl={sp.branding?.logoUrl}
            />
            <div className="px-6 pb-6 -mt-10">
              <div className="flex items-end gap-4">
                <div className="relative group">
                  <Avatar className="w-20 h-20 border-4 border-background shadow-lg">
                    {sp.avatarUrl ? <AvatarImage src={sp.avatarUrl} alt={sp.fullName} /> : null}
                    <AvatarFallback className="bg-primary/10 text-primary text-2xl font-semibold">{sp.initials}</AvatarFallback>
                  </Avatar>
                  {!isAdminView && (
                    <label className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                      <Camera className="w-5 h-5 text-white" />
                      <input type="file" accept="image/*" className="hidden" onChange={sp.handleAvatarUpload} />
                    </label>
                  )}
                </div>
                <div className="pb-1">
                  <p className="text-lg font-semibold">{sp.profile?.full_name || "Ученик"}</p>
                  {sp.profile?.organization_name && (
                    <p className="text-sm text-muted-foreground">{sp.profile.organization_name}</p>
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Card className="rounded-2xl border-border/60 shadow-sm">
            <CardHeader><CardTitle>Настройки профиля</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={user?.email || ""} disabled className="rounded-xl bg-muted/50" />
              </div>
              <div className="space-y-2">
                <Label>Имя и Фамилия</Label>
                <Input value={sp.fullName} onChange={e => sp.setFullName(e.target.value)} placeholder="Введите имя" disabled={isAdminView} className="rounded-xl" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Телефон</Label>
                  <Input value={sp.phone} onChange={e => sp.setPhone(e.target.value)} placeholder="+7 999 123-45-67" disabled={isAdminView} className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Город</Label>
                  <Input value={sp.city} onChange={e => sp.setCity(e.target.value)} placeholder="Введите город" disabled={isAdminView} className="rounded-xl" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>О себе</Label>
                <Textarea value={sp.bio} onChange={e => sp.setBio(e.target.value)} placeholder="Опишите карьеру и достижения" rows={4} disabled={isAdminView} className="rounded-xl" />
              </div>
              {!isAdminView && (
                <Button onClick={sp.handleSaveProfile} disabled={sp.profileSaving} className="rounded-xl">
                  {sp.profileSaving ? <SigmaSpinner size="sm" className="mr-2" /> : null}
                  Сохранить
                </Button>
              )}
            </CardContent>
          </Card>

          {!isAdminView && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Card className="rounded-2xl border-border/60 shadow-sm">
                <CardHeader><CardTitle className="text-base">Изменить email</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <Input value={sp.newEmail} onChange={e => sp.setNewEmail(e.target.value)} placeholder="Новый email" className="rounded-xl" />
                  <Button onClick={() => sp.handleChangeEmail(user?.email)} disabled={sp.emailSaving || sp.newEmail === user?.email} size="sm" className="w-full rounded-xl">
                    {sp.emailSaving ? <SigmaSpinner size="sm" className="mr-2" /> : null}
                    Сохранить
                  </Button>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-border/60 shadow-sm">
                <CardHeader><CardTitle className="text-base">Смена пароля</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="relative">
                    <Input type={sp.showPassword ? "text" : "password"} value={sp.newPassword} onChange={e => sp.setNewPassword(e.target.value)} placeholder="Новый пароль" className="rounded-xl" />
                    <button type="button" onClick={() => sp.setShowPassword(!sp.showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {sp.showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="relative">
                    <Input type={sp.showConfirm ? "text" : "password"} value={sp.confirmPassword} onChange={e => sp.setConfirmPassword(e.target.value)} placeholder="Повторите пароль" className="rounded-xl" />
                    <button type="button" onClick={() => sp.setShowConfirm(!sp.showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {sp.showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <Button onClick={sp.handleChangePassword} disabled={sp.passwordSaving || !sp.newPassword} size="sm" className="w-full rounded-xl">
                    {sp.passwordSaving ? <SigmaSpinner size="sm" className="mr-2" /> : null}
                    Сменить пароль
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Theme settings inside profile */}
          <Card className="rounded-2xl border-border/60 shadow-sm">
            <CardHeader><CardTitle>Тема оформления</CardTitle></CardHeader>
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
                        theme === t.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
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
        </div>
      )}

      {/* Notifications */}
      {activeTab === "notifications" && (
        <Card className="rounded-2xl border-border/60 shadow-sm">
          <CardHeader><CardTitle>Настройки уведомлений</CardTitle></CardHeader>
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
                              checked={sp.notifSettings[nt.key]?.[ch.key] ?? false}
                              onCheckedChange={() => sp.toggleNotif(nt.key, ch.key)}
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

      {/* Documents */}
      {activeTab === "documents" && (
        <div className="space-y-6">
          <Card className="rounded-2xl border-border/60 shadow-sm">
            <CardHeader><CardTitle>Видеоидентификация</CardTitle></CardHeader>
            <CardContent>
              <VideoIdentification
                userId={effectiveUserId}
                userName={sp.profile?.full_name || "Ученик"}
                organizationId={sp.profile?.organization_id || undefined}
                embedded={true}
              />
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/60 shadow-sm">
            <CardHeader><CardTitle>Согласие на обработку ПД</CardTitle></CardHeader>
            <CardContent>
              <StudentConsentForm
                userId={effectiveUserId}
                userName={sp.profile?.full_name || "Ученик"}
                organizationId={sp.profile?.organization_id || ""}
                embedded={true}
              />
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/60 shadow-sm">
            <CardHeader><CardTitle>Документы</CardTitle></CardHeader>
            <CardContent>
              <StudentDocumentsUpload
                userId={effectiveUserId}
                organizationId={sp.profile?.organization_id || ""}
                isOpen={false}
                onOpenChange={() => {}}
                embedded={true}
              />
            </CardContent>
          </Card>

          {!isAdminView && (
            <StudentDataSubjectRequests
              userId={effectiveUserId}
              organizationId={sp.profile?.organization_id || ""}
              userEmail={user?.email}
            />
          )}
        </div>
      )}

      {/* Achievements */}
      {activeTab === "achievements" && sp.orgSettings?.showAchievements && (
        <Card className="rounded-2xl border-border/60 shadow-sm">
          <CardContent className="pt-6">
            <AchievementsPanel
              userId={effectiveUserId}
              isOpen={false}
              onOpenChange={() => {}}
              embedded={true}
            />
          </CardContent>
        </Card>
      )}

      {/* Radio */}
      {activeTab === "radio" && (
        <Card className="rounded-2xl border-border/60 shadow-sm">
          <CardContent className="pt-6">
            <RadioSettings />
          </CardContent>
        </Card>
      )}

      {/* Partner program */}
      {activeTab === "partner" && (
        <StudentPartnerTab
          userId={effectiveUserId}
          userEmail={user?.email}
          userName={sp.profile?.full_name || ""}
        />
      )}

      {/* Help */}
      {activeTab === "help" && <HelpCenter />}
    </div>
  );
}
