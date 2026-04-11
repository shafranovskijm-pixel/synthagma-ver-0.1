import { User, LogOut, Sun, Moon, Monitor, Bell, Video, FileCheck, FileText, Trophy, Sparkles, HelpCircle } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

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
}

export function StudentHeader({
  fullName, orgName, logoUrl, onLogout, setTheme,
  pendingCount, isVideoIdentified, showAchievements,
  onShowVideoId, onShowConsent, onShowDocs, onShowAchievements,
}: StudentHeaderProps) {
  const navigate = useNavigate();
  const initials = fullName
    ? fullName.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase()
    : "У";

  return (
    <header className="h-14 bg-card border-b border-border flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-3">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="h-8 object-contain" />
        ) : (
          <SigmaLogo size="sm" />
        )}
        {orgName && <span className="text-sm font-medium text-muted-foreground hidden sm:block">{orgName}</span>}
      </div>

      <div className="flex items-center gap-2">
        {/* Notifications bell */}
        <Button variant="ghost" size="icon" className="rounded-xl relative">
          <Bell className="w-5 h-5 text-muted-foreground" />
        </Button>

        {/* Profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 hover:bg-secondary rounded-lg px-2 py-1 transition-colors relative">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{initials}</AvatarFallback>
              </Avatar>
              {pendingCount > 0 && (
                <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-bold">
                  {pendingCount}
                </div>
              )}
              <span className="text-sm font-medium hidden sm:block">{fullName || "Ученик"}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-3 py-2">
              <p className="text-sm font-medium">{fullName || "Ученик"}</p>
              <p className="text-xs text-muted-foreground">Слушатель</p>
            </div>
            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={onShowVideoId}>
              <Video className="w-4 h-4 mr-2" />
              Идентификация
              {isVideoIdentified && <span className="ml-auto text-green-500 text-xs">✓</span>}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onShowConsent}>
              <FileCheck className="w-4 h-4 mr-2" />
              Согласие на ПД
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onShowDocs}>
              <FileText className="w-4 h-4 mr-2" />
              Документы
              {pendingCount > 0 && (
                <span className="ml-auto w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center font-bold">
                  {pendingCount}
                </span>
              )}
            </DropdownMenuItem>

            {showAchievements && (
              <DropdownMenuItem onClick={onShowAchievements}>
                <Trophy className="w-4 h-4 mr-2" />
                Достижения
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={() => navigate("/whats-new")}>
              <Sparkles className="w-4 h-4 mr-2" />
              Что нового?
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setTheme('light')}><Sun className="w-4 h-4 mr-2" />Светлая тема</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('dark')}><Moon className="w-4 h-4 mr-2" />Тёмная тема</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('system')}><Monitor className="w-4 h-4 mr-2" />Системная</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout} className="text-destructive"><LogOut className="w-4 h-4 mr-2" />Выйти</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
