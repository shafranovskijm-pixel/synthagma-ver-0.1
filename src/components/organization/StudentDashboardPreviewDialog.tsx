import { useState, type CSSProperties } from "react";
import { BookOpen, GraduationCap, MessageCircle, User, Trophy, Radio, Megaphone } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CourseCatalog } from "@/components/student/CourseCatalog";
import { ADMIN_THEMES, getThemeById } from "@/constants/admin-themes";
import type { StudentDashboardSettings } from "./SettingsStudentDashboardTab";
import { getOrganizationCoverPresentation } from "@/lib/organization/branding";
import { proxiedAssetUrl } from "@/utils/proxyFetch";

export interface StudentPreviewBranding { coverUrl?: string; coverPosition?: string; logoUrl?: string }

const enrolledCourses = [{
  id: "preview-assigned-course", title: "Введение в обучение", description: "Пример назначенной учебной программы",
  duration: "8 часов", progress: 25, totalLessons: 8, completedLessons: 2, status: "in_progress" as const,
}];
const catalogCourses = [{
  id: "preview-catalog-course", title: "Безопасность на рабочем месте", description: "Пример программы в каталоге",
  duration: "16 часов", total_lessons: 12, is_enrolled: false, category_name: "Учебные программы",
}];

/** Synthetic, presentational preview. No user/org IDs, Auth, dashboard hooks,
 * enrollment callbacks, learning progress, radio player or analytics. */
export function StudentDashboardPreviewDialog({ open, onOpenChange, settings, organizationName, branding = {} }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  settings: StudentDashboardSettings; organizationName: string;
  branding?: StudentPreviewBranding;
}) {
  const [tab, setTab] = useState("catalog");
  const [notice, setNotice] = useState("");
  const theme = (settings.studentTheme && getThemeById(settings.studentTheme)) || ADMIN_THEMES[0];
  const customCover = proxiedAssetUrl(branding.coverUrl);
  const coverPresentation = getOrganizationCoverPresentation(branding.coverPosition);
  const style = {
    "--primary": theme.accent, "--primary-foreground": theme.accentForeground,
    "--accent": theme.accent, "--accent-foreground": theme.accentForeground,
  } as CSSProperties;
  const showDemoNotice = () => setNotice("Это пример. В рабочем кабинете здесь откроется выбранный раздел.");
  const navigation = [{ id: "catalog", label: "Курсы", icon: BookOpen },
    { id: "chat", label: "Чат", icon: MessageCircle },
    { id: "profile", label: "Профиль", icon: User }];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[1400px] h-[90dvh] p-0 gap-0 overflow-hidden flex flex-col rounded-2xl" style={style}>
        <DialogHeader className="px-5 py-4 border-b pr-12">
          <DialogTitle>Предпросмотр кабинета ученика</DialogTitle>
          <DialogDescription>Пример с демонстрационными данными и текущими настройками, в том числе ещё не сохранёнными.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-1 min-h-0 bg-background">
          <nav aria-label="Разделы предпросмотра" className="hidden md:flex w-20 shrink-0 border-r bg-card flex-col items-center gap-3 py-5">
            <GraduationCap className="w-8 h-8 text-primary mb-4" />
            {navigation.map(item => <Button key={item.id} title={item.label} aria-label={item.label} variant={tab === item.id ? "secondary" : "ghost"} size="icon" onClick={() => { setTab(item.id); setNotice(""); }}><item.icon className="w-5 h-5" /></Button>)}
          </nav>
          <div className="flex flex-1 flex-col min-w-0 min-h-0">
            <header className="flex items-center justify-between gap-3 p-4 border-b bg-card">
              <span className="font-semibold truncate">{organizationName || "Учебная организация"}</span>
              <div className="flex items-center gap-1">
                {settings.showAchievements && <Button size="icon" variant="ghost" aria-label="Достижения" onClick={showDemoNotice}><Trophy className="w-5 h-5" /></Button>}
                {settings.showRadio && <Button size="icon" variant="ghost" aria-label="Радио" onClick={showDemoNotice}><Radio className="w-5 h-5" /></Button>}
                {settings.showAnnouncements && <Button size="icon" variant="ghost" aria-label="Новости платформы" onClick={showDemoNotice}><Megaphone className="w-5 h-5" /></Button>}
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm">ДУ</div>
              </div>
            </header>
            <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
              {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
              {tab === "catalog" && <>
                <div className="relative h-48 md:h-52 rounded-2xl overflow-hidden text-white bg-muted" style={customCover ? undefined : { backgroundImage: `url(${theme.bannerUrl})`, backgroundSize: "cover", backgroundPosition: theme.bannerPosition || "center" }}>
                  {customCover && <img src={customCover} alt="Обложка организации" className="absolute inset-0 w-full h-full bg-muted" style={{ objectFit: coverPresentation.fit, objectPosition: coverPresentation.position }} />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/25 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-5 md:p-6 space-y-3">
                    {branding.logoUrl && <img src={proxiedAssetUrl(branding.logoUrl) || branding.logoUrl} alt="Логотип организации" className="w-12 h-12 object-contain rounded-xl bg-white/90 p-1.5" />}
                    <h2 className="font-display text-xl md:text-2xl font-bold">{organizationName || "Учебная организация"}</h2>
                    <p className="text-sm text-white/80">Ваше обучение начинается здесь</p>
                    <div className="flex gap-6 text-sm"><span>Прогресс: 25%</span><span>2 урока пройдено</span><span>1 курс</span></div>
                  </div>
                </div>
                <CourseCatalog courses={settings.catalogMode === "assigned" ? [] : catalogCourses} categories={[]} enrolledCourses={enrolledCourses} isVideoIdentified onCourseClick={showDemoNotice} onEnroll={showDemoNotice} onBuy={showDemoNotice} />
              </>}
              {tab === "chat" && <div className="rounded-2xl border bg-card p-6 space-y-3"><h2 className="font-semibold">Чат с организацией</h2><p className="text-sm text-muted-foreground">Здесь ученик сможет написать сотрудникам организации.</p>{settings.showAiChat && <><h3 className="font-semibold">ИИ-помощник</h3><p className="text-sm text-muted-foreground">Помощь с вопросами по обучению.</p></>}</div>}
              {tab === "profile" && <div className="rounded-2xl border bg-card p-6"><h2 className="font-semibold">Демонстрационный ученик</h2><p className="text-sm text-muted-foreground mt-2">Пример личного профиля</p></div>}
            </main>
            <nav className="md:hidden flex justify-around border-t bg-card py-2" aria-label="Мобильные разделы предпросмотра">
              {navigation.map(item => <Button key={item.id} variant="ghost" className="gap-1 flex-col h-auto text-xs" onClick={() => { setTab(item.id); setNotice(""); }}><item.icon className="w-5 h-5" />{item.label}</Button>)}
            </nav>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
