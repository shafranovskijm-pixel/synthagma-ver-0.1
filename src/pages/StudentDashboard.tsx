import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BookOpen, MessageCircle, Trophy, Settings, LogOut, Video, FileCheck, FileText,
  Menu, Sun, Moon, Monitor, CheckCircle2, Clock, Eye, Store,
  Library, AlertCircle, Sparkles, Send, Loader2, X, Lock, ArrowLeft, Building2, Bot
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { PullToRefreshIndicator } from "@/components/ui/PullToRefreshIndicator";
import { OnboardingDialog } from "@/components/onboarding/OnboardingDialog";
import { studentOnboardingSteps, studentHelpTips } from "@/constants/onboardingSteps";
import { HelpButton } from "@/components/onboarding/HelpButton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { VideoIdentification } from "@/components/student/VideoIdentification";
import { StudentConsentForm } from "@/components/student/StudentConsentForm";
import { StudentDocumentsUpload } from "@/components/student/StudentDocumentsUpload";
import { AchievementsPanel } from "@/components/student/AchievementsPanel";
import { useStudentDashboard } from "@/hooks/useStudentDashboard";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { StudentCourseStore } from "@/components/student/StudentCourseStore";
import { StudentOrgChat } from "@/components/student/StudentOrgChat";


export default function StudentDashboard() {
  const [chatMode, setChatMode] = useState<'select' | 'org' | 'ai'>('select');
  const {
    user, navigate, isMobile, theme, setTheme,
    activeTab, setActiveTab, messages, inputValue, setInputValue, isAiLoading, handleSendMessage,
    courses, profile, branding, dashboardSettings, loading,
    totalTimeSpent, totalCompletedLessons, totalProgress, firstName, formatTime,
    isPreviewMode, showVideoIdentification, setShowVideoIdentification,
    showConsentForm, setShowConsentForm, showDocumentsUpload, setShowDocumentsUpload,
    showAchievements, setShowAchievements, mobileMenuOpen, setMobileMenuOpen,
    documentsProgress, isVideoIdentified, setIsVideoIdentified, showOnboarding, handleOnboardingClose,
    handleLogout, pullToRefreshRef, pullDistance, isRefreshing, canRefresh, orgPlan,
    isAdminView, adminViewStudentName,
  } = useStudentDashboard();

  const isFreePlan = orgPlan === 'free';

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      <div className="p-6 border-b border-border">
        {branding?.logoUrl ? (
          <div className="flex items-center gap-3"><img src={branding.logoUrl} alt="Logo" className="w-10 h-10 object-contain rounded-lg" />{branding.showOrgName && <span className="font-display font-bold text-lg truncate">{profile?.organization_name}</span>}</div>
        ) : <SigmaLogo size="md" />}
        <div className="mt-4 p-3 bg-secondary rounded-xl"><div className="font-semibold text-sm">{profile?.full_name || "Ученик"}</div><div className="text-xs text-muted-foreground">{profile?.organization_name || "Организация"}</div></div>
      </div>
      <nav className="flex-1 p-4 overflow-y-auto space-y-1">
        <button onClick={() => { setActiveTab("courses"); onNavigate?.(); }} className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors", activeTab === "courses" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary")}><BookOpen className="w-5 h-5" />Мои курсы</button>
        {dashboardSettings.showAiChat && <button onClick={() => { setActiveTab("chat"); setChatMode("select"); onNavigate?.(); }} className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors", activeTab === "chat" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary")}><MessageCircle className="w-5 h-5" />Чат<span className="ml-auto w-2 h-2 rounded-full bg-sigma-green animate-pulse" /></button>}
        {dashboardSettings.showLibrary && <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-secondary transition-colors"><Library className="w-5 h-5" />Библиотека</button>}
        {dashboardSettings.showAchievements && <button onClick={() => { setShowAchievements(true); onNavigate?.(); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-secondary transition-colors"><Trophy className="w-5 h-5" />Достижения</button>}
        <button onClick={() => { setActiveTab("webinars"); onNavigate?.(); }} className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors", activeTab === "webinars" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary")}><Video className="w-5 h-5" />Вебинары</button>
        <button onClick={() => { 
          if (isFreePlan) { toast.info("Эта функция доступна на другом тарифе"); return; }
          setShowVideoIdentification(true); onNavigate?.(); 
        }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-secondary transition-colors"><Video className="w-5 h-5" />Идентификация{isFreePlan ? <Lock className="w-4 h-4 ml-auto text-amber-500" /> : isVideoIdentified && <CheckCircle2 className="w-4 h-4 ml-auto text-green-500" />}</button>
        <button onClick={() => { setShowConsentForm(true); onNavigate?.(); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-secondary transition-colors"><FileCheck className="w-5 h-5" />Согласие на ПД</button>
        <button onClick={() => { 
          if (isFreePlan) { toast.info("Эта функция доступна на другом тарифе"); return; }
          setShowDocumentsUpload(true); onNavigate?.(); 
        }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-secondary transition-colors"><FileText className="w-5 h-5" />Мои документы{isFreePlan ? <Lock className="w-4 h-4 ml-auto text-amber-500" /> : documentsProgress.completed < documentsProgress.total ? <span className="ml-auto text-xs text-amber-600 font-medium">{documentsProgress.completed}/{documentsProgress.total}</span> : <CheckCircle2 className="w-4 h-4 ml-auto text-green-500" />}</button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-secondary transition-colors"><Settings className="w-5 h-5" />Настройки</button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => setTheme('light')}><Sun className="w-4 h-4 mr-2" />Светлая</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('dark')}><Moon className="w-4 h-4 mr-2" />Тёмная</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('system')}><Monitor className="w-4 h-4 mr-2" />Системная</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
      <div className="p-4 border-t border-border space-y-1">
        <button onClick={() => { setActiveTab("store"); onNavigate?.(); }} className={cn("w-full flex items-center gap-3 px-4 py-2 rounded-xl text-sm transition-colors", activeTab === "store" ? "bg-primary/10 text-primary" : "text-muted-foreground/70 hover:bg-secondary/50")}><Store className="w-4 h-4" />Магазин курсов</button>
        <HelpButton tips={studentHelpTips} />
        <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-destructive hover:bg-destructive/10 transition-colors"><LogOut className="w-5 h-5" />Выйти</button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {isAdminView && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-primary text-primary-foreground py-2 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            <span className="text-sm font-medium">Режим просмотра: {adminViewStudentName}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => { localStorage.removeItem('adminViewAsStudent'); navigate('/admin'); }} className="gap-1">
            <X className="w-3 h-3" />
            Выйти
          </Button>
        </div>
      )}
      {isPreviewMode && !isAdminView && <div className="fixed top-0 inset-x-0 bg-primary text-primary-foreground py-2 px-4 text-center text-sm z-50 flex items-center justify-center gap-2"><Eye className="w-4 h-4" />Режим предпросмотра<Button size="sm" variant="secondary" className="ml-4 h-7" onClick={() => window.close()}>Закрыть</Button></div>}
      
      <div className="md:hidden fixed top-0 inset-x-0 bg-card border-b border-border z-40 px-4 py-3 flex items-center justify-between">
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}><SheetTrigger asChild><Button variant="ghost" size="icon"><Menu className="w-5 h-5" /></Button></SheetTrigger><SheetContent side="left" className="w-72 p-0 flex flex-col"><SidebarContent onNavigate={() => setMobileMenuOpen(false)} /></SheetContent></Sheet>
        {branding?.logoUrl ? <img src={branding.logoUrl} className="h-8 object-contain" /> : <SigmaLogo size="sm" />}
        <div className="w-10" />
      </div>

      <aside className={`hidden md:flex w-64 bg-card border-r border-border flex-col ${isPreviewMode || isAdminView ? 'mt-10' : ''}`}><SidebarContent /></aside>

      <main ref={isMobile ? pullToRefreshRef : undefined} className={`flex-1 overflow-auto pt-14 md:pt-0 relative ${isPreviewMode || isAdminView ? 'md:mt-10' : ''}`}>
        {isMobile && <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} canRefresh={canRefresh} threshold={80} />}
        
        {activeTab === "courses" && (
          <>
            <header className={cn("bg-card border-b border-border", branding?.coverUrl ? "h-40 relative" : "px-8 py-6")} style={branding?.coverUrl ? { backgroundImage: `url(${branding.coverUrl})`, backgroundSize: 'cover' } : {}}>
              {branding?.coverUrl && <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/80" />}
              <div className={cn(branding?.coverUrl ? "absolute bottom-4 left-8 text-white" : "")}>
                <h1 className="font-display text-2xl font-bold">Добро пожаловать, {firstName}!</h1>
                <p className={branding?.coverUrl ? "text-white/80" : "text-muted-foreground"}>Продолжайте обучение</p>
              </div>
            </header>

            <div className="p-8">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={cn("rounded-2xl p-6 mb-8 text-white", !branding && "bg-gradient-to-r from-primary via-accent to-sigma-purple")} style={branding ? { background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})` } : {}}>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-xl font-semibold mb-2">Общий прогресс</h2>
                    <p className="text-white/80 mb-4">Вы прошли {totalProgress}% всех курсов</p>
                    <div className="flex gap-4"><div className="flex gap-2 items-center"><Clock className="w-5 h-5" />{formatTime(totalTimeSpent)}</div><div className="flex gap-2 items-center"><CheckCircle2 className="w-5 h-5" />{totalCompletedLessons} уроков</div></div>
                  </div>
                  <div className="relative w-32 h-32">
                    <svg className="w-32 h-32 -rotate-90"><circle cx="64" cy="64" r="56" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="12" /><circle cx="64" cy="64" r="56" fill="none" stroke="white" strokeWidth="12" strokeDasharray={`${totalProgress * 3.52} 352`} strokeLinecap="round" /></svg>
                    <div className="absolute inset-0 flex items-center justify-center text-3xl font-bold">{totalProgress}%</div>
                  </div>
                </div>
              </motion.div>

              <h2 className="font-display text-xl font-semibold mb-4">Мои курсы</h2>
              {courses.length === 0 ? (
                <div className="glass-card rounded-2xl p-12 text-center"><BookOpen className="w-10 h-10 text-primary mx-auto mb-6" /><h3 className="text-xl font-semibold">Пока нет курсов</h3></div>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {courses.map((course, i) => (
                    <motion.div key={course.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} 
                      className="group bg-card rounded-2xl border border-border p-5 hover:shadow-lg transition-all cursor-pointer relative overflow-hidden"
                      onClick={() => navigate(`/course/${course.id}/learn`)}>
                      <div className="flex justify-between items-start mb-4">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform"><BookOpen className="w-6 h-6 text-primary" /></div>
                        {course.status === "completed" && <div className="bg-green-500/10 text-green-600 px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Завершён</div>}
                      </div>
                      <h3 className="font-semibold mb-2 line-clamp-2">{course.title}</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm text-muted-foreground"><span>Прогресс</span><span>{Math.round(course.progress)}%</span></div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${course.progress}%` }} /></div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
                          <div className="flex items-center gap-1"><Clock className="w-3 h-3" />{course.duration || "2ч"}</div>
                          <div className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{course.completedLessons}/{course.totalLessons}</div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "chat" && chatMode === "select" && (
          <div className="flex flex-col items-center justify-center h-full p-8">
            <MessageCircle className="w-12 h-12 text-primary mb-6" />
            <h2 className="font-display text-xl font-semibold mb-2">Выберите чат</h2>
            <p className="text-muted-foreground mb-8 text-center">С кем вы хотите пообщаться?</p>
            <div className="grid gap-4 w-full max-w-md">
              <button onClick={() => setChatMode("org")} className="flex items-center gap-4 p-5 rounded-2xl border border-border bg-card hover:bg-secondary/50 transition-colors text-left">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Building2 className="w-6 h-6 text-primary" /></div>
                <div><div className="font-semibold">Чат с учебным центром</div><div className="text-sm text-muted-foreground">Переписка с {profile?.organization_name || "организацией"}</div></div>
              </button>
              <button onClick={() => setChatMode("ai")} className="flex items-center gap-4 p-5 rounded-2xl border border-border bg-card hover:bg-secondary/50 transition-colors text-left">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center shrink-0"><Bot className="w-6 h-6 text-accent" /></div>
                <div><div className="font-semibold">ИИ-помощник</div><div className="text-sm text-muted-foreground">Ответит на вопросы по обучению</div></div>
              </button>
            </div>
          </div>
        )}

        {activeTab === "chat" && chatMode === "org" && user && profile?.organization_id && (
          <div className="flex flex-col h-full">
            <header className="bg-card border-b border-border p-4 flex items-center gap-3">
              <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => setChatMode("select")}><ArrowLeft className="w-5 h-5" /></Button>
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><Building2 className="w-5 h-5 text-primary" /></div>
              <div><h1 className="font-bold">{profile.organization_name || "Учебный центр"}</h1><p className="text-xs text-muted-foreground">Чат с организацией</p></div>
            </header>
            <StudentOrgChat studentUserId={user.id} organizationId={profile.organization_id} organizationName={profile.organization_name || "Учебный центр"} />
          </div>
        )}

        {activeTab === "chat" && chatMode === "ai" && (
          <div className="flex flex-col h-full">
            <header className="bg-card border-b border-border p-4 flex items-center gap-3">
              <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => setChatMode("select")}><ArrowLeft className="w-5 h-5" /></Button>
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-primary to-accent flex items-center justify-center"><Sparkles className="w-5 h-5 text-white" /></div>
              <div><h1 className="font-bold">ИИ-помощник</h1><p className="text-xs text-muted-foreground">Ответит на вопросы по обучению</p></div>
            </header>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((m, i) => (
                <div key={i} className={cn("flex", m.role === 'user' ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[80%] rounded-2xl px-4 py-3", m.role === 'user' ? "bg-primary text-primary-foreground rounded-br-none" : "bg-secondary rounded-bl-none")}>{m.content}</div>
                </div>
              ))}
              {isAiLoading && <div className="flex justify-start"><div className="bg-secondary rounded-2xl rounded-bl-none px-4 py-3 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Печатает...</span></div></div>}
            </div>
            <div className="p-4 border-t border-border bg-card"><div className="flex gap-2"><input value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="Задайте вопрос..." className="flex-1 bg-secondary rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20" disabled={isAiLoading} /><Button onClick={handleSendMessage} disabled={!inputValue.trim() || isAiLoading} className="rounded-xl aspect-square p-0"><Send className="w-5 h-5" /></Button></div></div>
          </div>
        )}

        {activeTab === "store" && user && (
          <div className="p-8">
            <StudentCourseStore 
              userId={user.id} 
              organizationId={profile?.organization_id || ""} 
            />
          </div>
        )}

        {activeTab === "webinars" && user && profile?.organization_id && (
          <StudentWebinars userId={user.id} organizationId={profile.organization_id} />
        )}
      </main>

      {user && <VideoIdentification userId={user.id} userName={profile?.full_name || "Ученик"} organizationId={profile?.organization_id} isOpen={showVideoIdentification} onOpenChange={setShowVideoIdentification} onVerified={() => { setIsVideoIdentified(true); setShowVideoIdentification(false); }} />}
      {user && profile?.organization_id && <StudentConsentForm userId={user.id} userName={profile.full_name || "Ученик"} organizationId={profile.organization_id} isOpen={showConsentForm} onOpenChange={setShowConsentForm} />}
      {user && profile?.organization_id && <StudentDocumentsUpload userId={user.id} organizationId={profile.organization_id} isOpen={showDocumentsUpload} onOpenChange={setShowDocumentsUpload} />}
      {user && <AchievementsPanel userId={user.id} isOpen={showAchievements} onOpenChange={setShowAchievements} />}
      <OnboardingDialog open={showOnboarding} onClose={handleOnboardingClose} steps={studentOnboardingSteps} onNavigateToTab={(tab) => { if(tab === "chat") setActiveTab("chat"); else if(tab === "achievements") setShowAchievements(true); else if(tab === "video-id") setShowVideoIdentification(true); else if(tab === "documents") setShowDocumentsUpload(true); }} />
    </div>
  );
}
