import { User, LogOut, Bell, Sparkles, HelpCircle, Sun, Moon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RadioPlayerButton } from "@/components/radio/RadioPlayerButton";
import { useTheme } from "next-themes";

interface StudentHeaderProps {
  fullName: string | null;
  orgName: string | null;
  logoUrl?: string;
  onLogout: () => void;
  setTheme: (t: string) => void;
  pendingCount: number;
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
  pendingCount, isVideoIdentified, showAchievements,
  onShowVideoId, onShowConsent, onShowDocs, onShowAchievements,
  onProfileClick,
}: StudentHeaderProps) {
  const navigate = useNavigate();
  const { theme: currentTheme, setTheme: setAppTheme } = useTheme();
  const toggleTheme = () => setAppTheme(currentTheme === "dark" ? "light" : "dark");
  const initials = fullName
    ? fullName.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase()
    : "У";

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-3">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="h-8 object-contain" />
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
        {/* Theme toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-xl w-10 h-10 hover:scale-105 transition-transform" onClick={toggleTheme}>
              <Sun className="w-5 h-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute w-5 h-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Сменить тему</TooltipContent>
        </Tooltip>

        {/* Radio */}
        <RadioPlayerButton />

        {/* Help */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-xl w-10 h-10 hover:scale-105 transition-transform" onClick={onProfileClick ? () => { onProfileClick(); /* switch to help tab handled inside */ } : () => navigate('/help')}>
              <HelpCircle className="w-6 h-6 text-muted-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Помощь</TooltipContent>
        </Tooltip>

        {/* Notifications bell */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-xl w-10 h-10 relative hover:scale-105 transition-transform">
              <Bell className="w-6 h-6 text-muted-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Уведомления</TooltipContent>
        </Tooltip>

        {/* Profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 hover:bg-secondary rounded-lg px-3 py-2 transition-colors relative">
              <Avatar className="w-10 h-10">
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">{initials}</AvatarFallback>
              </Avatar>
              {pendingCount > 0 && (
                <div className="absolute top-0 left-7 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-bold">
                  {pendingCount}
                </div>
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

            <DropdownMenuItem onClick={onProfileClick || (() => navigate("/student/profile"))}>
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
