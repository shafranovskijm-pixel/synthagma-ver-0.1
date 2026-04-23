import { User, LogOut, Bell, Sparkles, HelpCircle } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RadioPlayerButton } from "@/components/radio/RadioPlayerButton";
import { AnnouncementsBell } from "@/components/shared/AnnouncementsBell";
import { useTheme } from "next-themes";

interface StudentHeaderProps {
  fullName: string | null;
  orgName: string | null;
  logoUrl?: string;
  onLogout: () => void;
  setTheme: (t: string) => void;
  pendingCount: number;
  /** Human-readable list of pending actions, used in the badge tooltip. */
  pendingReasons?: string[];
  isVideoIdentified: boolean;
  showAchievements: boolean;
  onShowVideoId: () => void;
  onShowConsent: () => void;
  onShowDocs: () => void;
  onShowAchievements: () => void;
  onProfileClick?: () => void;
}

export function StudentHeader({
  fullName, orgName, logoUrl, onLogout, setTheme,
  pendingCount, pendingReasons, isVideoIdentified, showAchievements,
  onShowVideoId, onShowConsent, onShowDocs, onShowAchievements,
  onProfileClick,
}: StudentHeaderProps) {
  const navigate = useNavigate();
  const { theme: currentTheme, setTheme: setAppTheme } = useTheme();
  const toggleTheme = () => setAppTheme(currentTheme === "dark" ? "light" : "dark");
  const initials = fullName
    ? fullName.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase()
    : "У";

  const goToProfile = () => {
    if (onProfileClick && pendingCount === 0) {
      onProfileClick();
      return;
    }
    if (pendingCount > 0) {
      navigate("/student/profile?section=documents");
    } else if (onProfileClick) {
      onProfileClick();
    } else {
      navigate("/student/profile");
    }
  };

  const reasonsTooltip = pendingCount > 0
    ? (pendingReasons && pendingReasons.length > 0
        ? `${pendingCount} ${pendingCount === 1 ? "действие требует" : "действия требуют"} внимания: ${pendingReasons.join(", ")}`
        : "Требуются документы")
    : null;

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-3">
        {logoUrl ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={toggleTheme} className="hover:opacity-80 transition-opacity">
                <img src={logoUrl} alt="Logo" className="h-8 object-contain" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Сменить тему</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={toggleTheme} className="hover:opacity-80 transition-opacity">
                <SigmaLogo size="sm" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Сменить тему</TooltipContent>
          </Tooltip>
        )}
        {orgName && <span className="text-sm font-medium text-muted-foreground hidden sm:block">{orgName}</span>}
      </div>

      <div className="flex items-center gap-3">
        {/* Radio */}
        <RadioPlayerButton />

        {/* Что нового — bell с бейджем */}
        <AnnouncementsBell />

        {/* Notifications bell (заглушка под персональные уведомления) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-xl w-10 h-10 relative hover:scale-105 transition-transform" disabled>
              <Bell className="w-6 h-6 text-muted-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Скоро: уведомления</TooltipContent>
        </Tooltip>

        {/* Profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 hover:bg-secondary rounded-lg px-3 py-2 transition-colors relative">
              <Avatar className="w-10 h-10">
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">{initials}</AvatarFallback>
              </Avatar>
              {pendingCount > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={reasonsTooltip || "Требуются документы"}
                      onClick={(e) => { e.stopPropagation(); navigate("/student/profile?section=documents"); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          navigate("/student/profile?section=documents");
                        }
                      }}
                      className="absolute top-0 left-7 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-bold cursor-pointer hover:scale-110 transition-transform"
                    >
                      {pendingCount}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">{reasonsTooltip}</TooltipContent>
                </Tooltip>
              )}
              <span className="text-base font-medium hidden sm:block">{fullName || "Ученик"}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-3 py-2">
              <p className="text-sm font-medium">{fullName || "Ученик"}</p>
              <p className="text-xs text-muted-foreground">Слушатель</p>
            </div>
            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={goToProfile}>
              <User className="w-4 h-4 mr-2" />
              Мой профиль
              {pendingCount > 0 && (
                <span className="ml-auto w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold">
                  {pendingCount}
                </span>
              )}
            </DropdownMenuItem>

            <DropdownMenuItem onClick={() => navigate("/student/whats-new")}>
              <Sparkles className="w-4 h-4 mr-2" />
              Что нового?
            </DropdownMenuItem>

            <DropdownMenuItem onClick={() => navigate("/help")}>
              <HelpCircle className="w-4 h-4 mr-2" />
              Помощь
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout} className="text-destructive">
              <LogOut className="w-4 h-4 mr-2" />
              Выйти
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
