import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  BookOpen, MessageCircle, Menu, Eye, X, Loader2, Building2, Bot,
  Library, ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { PullToRefreshIndicator } from "@/components/ui/PullToRefreshIndicator";
import { OnboardingDialog } from "@/components/onboarding/OnboardingDialog";
import { studentOnboardingSteps } from "@/constants/onboardingSteps";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { VideoIdentification } from "@/components/student/VideoIdentification";
import { StudentConsentForm } from "@/components/student/StudentConsentForm";
import { StudentDocumentsUpload } from "@/components/student/StudentDocumentsUpload";
import { AchievementsPanel } from "@/components/student/AchievementsPanel";
import { useStudentDashboard } from "@/hooks/useStudentDashboard";
import { toast } from "sonner";
import { StudentOrgChat } from "@/components/student/StudentOrgChat";
import { AvailablePaidCourses } from "@/components/student/AvailablePaidCourses";
import { StudentSidebar, type StudentTab } from "@/components/student/StudentSidebar";
import { StudentHeader } from "@/components/student/StudentHeader";
import { StudentFooter } from "@/components/student/StudentFooter";
import { OrgBanner } from "@/components/student/OrgBanner";
import { CourseCatalog } from "@/components/student/CourseCatalog";
import { StudentLibrary } from "@/components/student/StudentLibrary";
import { cn } from "@/lib/utils";
import { Video } from "lucide-react";
import { StudentWebinarsList } from "@/components/student/StudentWebinarsList";
import { Student3DTrainers } from "@/components/student/Student3DTrainers";
import { StudentProfileContent } from "@/components/student/StudentProfileContent";

function CatalogContent({ catalogCourses, categories, profile, branding, handleCourseClick }: any) {
  const [contentTab, setContentTab] = useState<"courses" | "webinars" | "trainers">("courses");

  const tabs = [
    { id: "courses" as const, label: "Курсы" },
    { id: "webinars" as const, label: "Вебинары" },
    { id: "trainers" as const, label: "3D-тренажёры" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto flex-1">
      <OrgBanner
        orgName={profile?.organization_name || null}
        orgDescription={profile?.org_description}
        coverUrl={branding?.coverUrl}
        logoUrl={branding?.logoUrl}
        primaryColor={branding?.primaryColor}
        secondaryColor={branding?.secondaryColor}
      />

      <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setContentTab(t.id)}
            className={cn(
              "px-5 py-2 rounded-md text-sm font-medium transition-all",
              contentTab === t.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {contentTab === "courses" && (
        <CourseCatalog
          courses={catalogCourses}
          categories={categories}
          onCourseClick={(id: string, enrolled: boolean) => handleCourseClick(id, enrolled)}
        />
      )}
      {contentTab === "webinars" && <StudentWebinarsList />}
      {contentTab === "trainers" && <Student3DTrainers />}
    </div>
  );
}

export default function StudentDashboard() {
  const [chatMode, setChatMode] = useState<'select' | 'org' | 'ai'>('select');
  const { userRole } = useAuth();

  const isAdminViewFromStorage = (() => {
    try { return !!localStorage.getItem('adminViewAsStudent'); } catch { return false; }
  })();
  const isPreviewFromStorage = (() => {
    try { return localStorage.getItem('previewStudentDashboard') === 'true'; } catch { return false; }
  })();

  const {
    user, navigate, isMobile, theme, setTheme,
    activeTab, setActiveTab: setActiveTabRaw, messages, inputValue, setInputValue, isAiLoading, handleSendMessage,
    courses, catalogCourses, categories, profile, branding, dashboardSettings, loading,
    totalTimeSpent, totalCompletedLessons, totalProgress, firstName, formatTime,
    isPreviewMode, showVideoIdentification, setShowVideoIdentification,
    showConsentForm, setShowConsentForm, showDocumentsUpload, setShowDocumentsUpload,
    showAchievements, setShowAchievements, mobileMenuOpen, setMobileMenuOpen,
    documentsProgress, isVideoIdentified, setIsVideoIdentified, showOnboarding, handleOnboardingClose,
    handleLogout, pullToRefreshRef, pullDistance, isRefreshing, canRefresh, orgPlan,
    isAdminView, adminViewStudentName,
  } = useStudentDashboard();

  // Narrow the tab type (hook may still have "store" internally)
  const setActiveTab = (tab: StudentTab) => setActiveTabRaw(tab as any);
  const currentTab: StudentTab = (activeTab === "store" ? "catalog" : activeTab) as StudentTab;

  const pendingDocsCount = documentsProgress.total - documentsProgress.completed;

  if (userRole && userRole !== 'student' && !isAdminView && !isAdminViewFromStorage && !isPreviewMode && !isPreviewFromStorage) {
    if (userRole === 'organization') return <Navigate to="/organization" replace />;
    if (userRole === 'company') return <Navigate to="/company" replace />;
    if (userRole === 'admin') return <Navigate to="/admin" replace />;
    if (userRole === 'sales_manager') return <Navigate to="/sales" replace />;
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const handleCourseClick = (courseId: string, isEnrolled: boolean) => {
    if (isEnrolled) {
      const course = courses.find(c => c.id === courseId);
      const needsVerification = course?.skip_video_identification === false && !isVideoIdentified;
      if (needsVerification) {
        toast.error("Требуется видеоидентификация", { description: "Пройдите видеоидентификацию перед началом курса" });
        setShowVideoIdentification(true);
        return;
      }
      navigate(`/course/${courseId}/learn`);
    } else {
      navigate(`/course/${courseId}/landing`);
    }
  };

  // Mobile sidebar content
  const MobileSidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border">
        {branding?.logoUrl ? (
          <img src={branding.logoUrl} alt="Logo" className="h-8 object-contain" />
        ) : <SigmaLogo size="sm" />}
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {([
          { id: "catalog" as StudentTab, icon: BookOpen, label: "Каталог курсов" },
          { id: "library" as StudentTab, icon: Library, label: "Мои курсы" },
          ...(dashboardSettings.showAiChat ? [{ id: "chat" as StudentTab, icon: MessageCircle, label: "Чат" }] : []),
        ]).map(item => (
          <button
            key={item.id}
            onClick={() => { setActiveTab(item.id); onNavigate?.(); }}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors",
              currentTab === item.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"
            )}
          >
            <item.icon className="w-5 h-5" />{item.label}
          </button>
        ))}
      </nav>
      <div className="p-3 border-t border-border">
        <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-destructive hover:bg-destructive/10 transition-colors">
          Выйти
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Admin/preview bar */}
      {isAdminView && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-primary text-primary-foreground py-2 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            <span className="text-sm font-medium">Режим просмотра: {adminViewStudentName}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => {
            const raw = localStorage.getItem('adminViewAsStudent');
            let returnPath = '/admin';
            try { const d = JSON.parse(raw || '{}'); if (d.orgReturn) returnPath = d.orgReturn; } catch {}
            localStorage.removeItem('adminViewAsStudent');
            navigate(returnPath);
          }} className="gap-1">
            <X className="w-3 h-3" />Выйти
          </Button>
        </div>
      )}
      {isPreviewMode && !isAdminView && (
        <div className="fixed top-0 inset-x-0 bg-primary text-primary-foreground py-2 px-4 text-center text-sm z-50 flex items-center justify-center gap-2">
          <Eye className="w-4 h-4" />Режим предпросмотра
          <Button size="sm" variant="secondary" className="ml-4 h-7" onClick={() => window.close()}>Закрыть</Button>
        </div>
      )}

      {/* Desktop sidebar */}
      <StudentSidebar
        activeTab={currentTab}
        setActiveTab={setActiveTab}
        branding={branding}
        orgName={profile?.organization_name || null}
        showAiChat={dashboardSettings.showAiChat}
        isPreviewMode={isPreviewMode}
        isAdminView={isAdminView}
      />

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 inset-x-0 bg-card border-b border-border z-40 px-4 py-3 flex items-center justify-between">
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild><Button variant="ghost" size="icon"><Menu className="w-5 h-5" /></Button></SheetTrigger>
          <SheetContent side="left" className="w-72 p-0"><MobileSidebarContent onNavigate={() => setMobileMenuOpen(false)} /></SheetContent>
        </Sheet>
        {branding?.logoUrl ? <img src={branding.logoUrl} className="h-8 object-contain" /> : <SigmaLogo size="sm" />}
        <div className="w-10" />
      </div>

      {/* Main content */}
      <div className={cn("flex-1 flex flex-col min-w-0", (isPreviewMode || isAdminView) && "md:mt-10")}>
        {/* Top header */}
        <div className="hidden md:block">
          <StudentHeader
            fullName={profile?.full_name || null}
            orgName={profile?.organization_name || null}
            logoUrl={branding?.logoUrl}
            onLogout={handleLogout}
            setTheme={setTheme}
            pendingCount={pendingDocsCount}
            isVideoIdentified={isVideoIdentified}
            showAchievements={dashboardSettings.showAchievements}
            onShowVideoId={() => setShowVideoIdentification(true)}
            onShowConsent={() => setShowConsentForm(true)}
            onShowDocs={() => setShowDocumentsUpload(true)}
            onShowAchievements={() => setShowAchievements(true)}
            onProfileClick={() => setActiveTab("profile" as any)}
          />
        </div>

        <main
          ref={isMobile ? pullToRefreshRef : undefined}
          className="flex-1 overflow-auto pt-14 md:pt-0 flex flex-col"
        >
          {isMobile && <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} canRefresh={canRefresh} threshold={80} />}

          {/* Catalog tab */}
          {currentTab === "catalog" && (
            <CatalogContent
              catalogCourses={catalogCourses}
              categories={categories}
              profile={profile}
              branding={branding}
              handleCourseClick={handleCourseClick}
            />
          )}

          {/* Library tab */}
          {currentTab === "library" && (
            <div className="p-6 max-w-[1400px] mx-auto flex-1">
              <StudentLibrary
                courses={courses}
                totalProgress={totalProgress}
                totalTimeSpent={totalTimeSpent}
                totalCompletedLessons={totalCompletedLessons}
                formatTime={formatTime}
                isVideoIdentified={isVideoIdentified}
                onCourseClick={(id) => handleCourseClick(id, true)}
                branding={branding}
              />
              {user && profile?.organization_id && (
                <div className="mt-8">
                  <AvailablePaidCourses userId={user.id} organizationId={profile.organization_id} userEmail={user.email} />
                </div>
              )}
            </div>
          )}

          {/* Chat tab */}
          {currentTab === "chat" && chatMode === "select" && (
            <div className="flex flex-col items-center justify-center h-full p-8 flex-1">
              <MessageCircle className="w-12 h-12 text-primary mb-6" />
              <h2 className="font-bold text-xl mb-2">Выберите чат</h2>
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

          {currentTab === "chat" && chatMode === "org" && user && profile?.organization_id && (
            <div className="flex flex-col h-full flex-1">
              <div className="p-4 border-b border-border">
                <Button variant="ghost" size="sm" onClick={() => setChatMode("select")} className="gap-1"><ArrowLeft className="w-4 h-4" />Назад</Button>
              </div>
              <StudentOrgChat studentUserId={user.id} organizationId={profile.organization_id} organizationName={profile.organization_name || "Организация"} />
            </div>
          )}

          {currentTab === "chat" && chatMode === "ai" && (
            <div className="flex flex-col h-full flex-1">
              <div className="p-4 border-b border-border">
                <Button variant="ghost" size="sm" onClick={() => setChatMode("select")} className="gap-1"><ArrowLeft className="w-4 h-4" />Назад</Button>
              </div>
              <div className="flex-1 overflow-auto p-6 space-y-4">
                {messages.map((msg, i) => (
                  <div key={i} className={cn("max-w-[80%] rounded-2xl p-4", msg.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-secondary")}>
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ))}
                {isAiLoading && <div className="bg-secondary rounded-2xl p-4 max-w-[80%]"><Loader2 className="w-4 h-4 animate-spin" /></div>}
              </div>
              <div className="p-4 border-t border-border flex gap-2">
                <input
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSendMessage()}
                  placeholder="Задайте вопрос..."
                  className="flex-1 bg-secondary rounded-xl px-4 py-2 text-sm outline-none"
                />
                <Button size="sm" onClick={handleSendMessage} disabled={isAiLoading}>Отправить</Button>
              </div>
            </div>
          )}

          {/* Footer — show on catalog and library tabs */}
          {(currentTab === "catalog" || currentTab === "library") && (
            <StudentFooter
              orgName={profile?.organization_name || null}
              logoUrl={branding?.logoUrl}
              orgDescription={profile?.org_description}
            />
          )}
        </main>
      </div>

      {/* Dialogs */}
      {showVideoIdentification && user && (
        <VideoIdentification
          userId={user.id}
          userName={profile?.full_name || "Ученик"}
          organizationId={profile?.organization_id || undefined}
          isOpen={showVideoIdentification}
          onOpenChange={setShowVideoIdentification}
          onVerified={() => setIsVideoIdentified(true)}
        />
      )}
      {showConsentForm && user && profile?.organization_id && (
        <StudentConsentForm
          userId={user.id}
          userName={profile?.full_name || "Ученик"}
          organizationId={profile.organization_id}
          isOpen={showConsentForm}
          onOpenChange={setShowConsentForm}
        />
      )}
      {showDocumentsUpload && user && profile?.organization_id && (
        <StudentDocumentsUpload
          userId={user.id}
          organizationId={profile.organization_id}
          isOpen={showDocumentsUpload}
          onOpenChange={setShowDocumentsUpload}
        />
      )}
      {showAchievements && user && (
        <AchievementsPanel
          userId={user.id}
          isOpen={showAchievements}
          onOpenChange={setShowAchievements}
        />
      )}
      {showOnboarding && <OnboardingDialog open={showOnboarding} onClose={handleOnboardingClose} steps={studentOnboardingSteps} />}
    </div>
  );
}
