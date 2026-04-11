import { BookOpen, Library, MessageCircle, Video, FileCheck, FileText, Trophy, Settings, LogOut, Store, Sun, Moon, Monitor, CheckCircle2, Eye, X, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { HelpButton } from "@/components/onboarding/HelpButton";
import { studentHelpTips } from "@/constants/onboardingSteps";

export type StudentTab = "catalog" | "library" | "chat" | "store";

interface StudentSidebarProps {
  activeTab: StudentTab;
  setActiveTab: (tab: StudentTab) => void;
  branding: { logoUrl: string; showOrgName: boolean } | null;
  orgName: string | null;
  showAiChat: boolean;
  showAchievements: boolean;
  isVideoIdentified: boolean;
  documentsProgress: { completed: number; total: number };
  onShowVideoId: () => void;
  onShowConsent: () => void;
  onShowDocs: () => void;
  onShowAchievements: () => void;
  onLogout: () => void;
  setTheme: (t: string) => void;
  isPreviewMode?: boolean;
  isAdminView?: boolean;
}

const navItems: { id: StudentTab; icon: typeof BookOpen; label: string }[] = [
  { id: "catalog", icon: BookOpen, label: "Каталог курсов" },
  { id: "library", icon: Library, label: "Мои курсы" },
  { id: "chat", icon: MessageCircle, label: "Чат" },
];

export function StudentSidebar({
  activeTab, setActiveTab, branding, orgName, showAiChat,
  showAchievements, isVideoIdentified, documentsProgress,
  onShowVideoId, onShowConsent, onShowDocs, onShowAchievements, onLogout, setTheme,
  isPreviewMode, isAdminView,
}: StudentSidebarProps) {
  return (
    <aside className={cn(
      "hidden md:flex flex-col w-[68px] bg-card border-r border-border items-center py-4 gap-1 shrink-0",
      (isPreviewMode || isAdminView) && "mt-10"
    )}>
      {/* Logo */}
      <div className="mb-4">
        {branding?.logoUrl ? (
          <img src={branding.logoUrl} alt="Logo" className="w-9 h-9 object-contain rounded-lg" />
        ) : (
          <SigmaLogo size="sm" />
        )}
      </div>

      {/* Main nav */}
      <nav className="flex flex-col gap-1 flex-1">
        {navItems.map((item) => {
          if (item.id === "chat" && !showAiChat) return null;
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "w-11 h-11 rounded-xl flex items-center justify-center transition-all",
                    activeTab === item.id
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}

        <div className="h-px bg-border my-2 mx-2" />

        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onShowVideoId} className="w-11 h-11 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-all relative">
              <Video className="w-5 h-5" />
              {isVideoIdentified && <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-green-500" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Идентификация</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onShowConsent} className="w-11 h-11 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-all">
              <FileCheck className="w-5 h-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Согласие на ПД</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onShowDocs} className="w-11 h-11 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-all relative">
              <FileText className="w-5 h-5" />
              {documentsProgress.completed < documentsProgress.total && (
                <div className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-amber-500 text-[9px] text-white flex items-center justify-center font-bold">
                  {documentsProgress.total - documentsProgress.completed}
                </div>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Документы ({documentsProgress.completed}/{documentsProgress.total})</TooltipContent>
        </Tooltip>

        {showAchievements && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={onShowAchievements} className="w-11 h-11 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-all">
                <Trophy className="w-5 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Достижения</TooltipContent>
          </Tooltip>
        )}
      </nav>

      {/* Bottom */}
      <div className="flex flex-col gap-1 items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={() => setActiveTab("store")} className={cn(
              "w-11 h-11 rounded-xl flex items-center justify-center transition-all",
              activeTab === "store"
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}>
              <Store className="w-5 h-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Магазин курсов</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button className="w-11 h-11 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-all">
                  <Settings className="w-5 h-5" />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">Настройки</TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="right" align="end">
            <DropdownMenuItem onClick={() => setTheme('light')}><Sun className="w-4 h-4 mr-2" />Светлая</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('dark')}><Moon className="w-4 h-4 mr-2" />Тёмная</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('system')}><Monitor className="w-4 h-4 mr-2" />Системная</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onLogout} className="w-11 h-11 rounded-xl flex items-center justify-center text-destructive hover:bg-destructive/10 transition-all">
              <LogOut className="w-5 h-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Выйти</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
