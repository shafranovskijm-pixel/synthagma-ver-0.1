import { User, LogOut, Settings, Sun, Moon, Monitor } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SigmaLogo } from "@/components/ui/SigmaLogo";

interface StudentHeaderProps {
  fullName: string | null;
  orgName: string | null;
  logoUrl?: string;
  onLogout: () => void;
  setTheme: (t: string) => void;
}

export function StudentHeader({ fullName, orgName, logoUrl, onLogout, setTheme }: StudentHeaderProps) {
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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 hover:bg-secondary rounded-lg px-2 py-1 transition-colors">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium hidden sm:block">{fullName || "Ученик"}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <div className="px-2 py-1.5">
            <p className="text-sm font-medium">{fullName || "Ученик"}</p>
            <p className="text-xs text-muted-foreground">Слушатель</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setTheme('light')}><Sun className="w-4 h-4 mr-2" />Светлая тема</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme('dark')}><Moon className="w-4 h-4 mr-2" />Тёмная тема</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme('system')}><Monitor className="w-4 h-4 mr-2" />Системная</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onLogout} className="text-destructive"><LogOut className="w-4 h-4 mr-2" />Выйти</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
