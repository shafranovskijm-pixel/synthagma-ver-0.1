import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreditCard, LogOut, Moon, Sun, Palette, ChevronRight, User, HelpCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { RadioPlayerButton } from "@/components/radio/RadioPlayerButton";
import { AnnouncementsBell } from "@/components/shared/AnnouncementsBell";
import { HeroBannerSwiper } from "@/components/shared/HeroBannerSwiper";
import { CompanyCard } from "./CompanyCard";
import { ADMIN_THEMES, getStoredThemeId, storeThemeId } from "@/constants/admin-themes";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  activeLabel: string;
  onSignOut: () => void;
}

export function SalesDashboardHeader({ activeLabel, onSignOut }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [themeId, setThemeId] = useState<string | null>(() => getStoredThemeId());
  const [cardOpen, setCardOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch {}
  }, [dark]);

  const applyTheme = (id: string | null) => {
    setThemeId(id);
    storeThemeId(id);
    window.dispatchEvent(new CustomEvent("visual-theme-change", { detail: id }));
  };

  const initials = (user?.email?.[0] || "?").toUpperCase();

  return (
    <>
      {/* Sticky top bar */}
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur-md border-b border-border">
        <div className="flex items-center justify-between gap-3 px-4 lg:px-8 h-14 max-w-[1600px] mx-auto">
          <div className="flex items-center gap-3 min-w-0">
            <SigmaLogo size="sm" showText={false} />
            <div className="hidden sm:flex items-center gap-2 min-w-0">
              <span className="font-display font-bold truncate">Кабинет менеджера</span>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground truncate">{activeLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <AnnouncementsBell />
            <RadioPlayerButton />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-xl w-10 h-10" title="Оформление">
                  <Palette className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 max-h-[60vh] overflow-y-auto">
                <DropdownMenuLabel>Оформление</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setDark(!dark)}>
                  {dark ? <Sun className="w-4 h-4 mr-2" /> : <Moon className="w-4 h-4 mr-2" />}
                  {dark ? "Светлая тема" : "Тёмная тема"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">Визуальная тема</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => applyTheme(null)}>
                  <span className="mr-2">⚪</span>Без темы
                  {!themeId && <span className="ml-auto text-primary">✓</span>}
                </DropdownMenuItem>
                {ADMIN_THEMES.map(t => (
                  <DropdownMenuItem key={t.id} onClick={() => applyTheme(t.id)}>
                    <span className="mr-2">{t.emoji}</span>{t.label}
                    {themeId === t.id && <span className="ml-auto text-primary">✓</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={cardOpen} onOpenChange={setCardOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="rounded-xl gap-1.5 hidden md:inline-flex">
                  <CreditCard className="w-3.5 h-3.5" />
                  Реквизиты
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-2xl max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Реквизиты компании</DialogTitle></DialogHeader>
                <CompanyCard />
              </DialogContent>
            </Dialog>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full w-9 h-9 bg-primary/10 hover:bg-primary/20">
                  <span className="text-sm font-semibold text-primary">{initials}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">{user?.email || "Менеджер"}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/help")}>
                  <HelpCircle className="w-4 h-4 mr-2" /> Помощь
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCardOpen(true)}>
                  <CreditCard className="w-4 h-4 mr-2" /> Реквизиты
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onSignOut} className="text-destructive focus:text-destructive">
                  <LogOut className="w-4 h-4 mr-2" /> Выйти
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Hero banner — same swiper as organization */}
      <div className="max-w-[1600px] mx-auto px-4 lg:px-8 pt-4">
        <HeroBannerSwiper className="rounded-3xl overflow-hidden">
          <div className="flex items-end h-full p-6 lg:p-8">
            <div className="space-y-1.5">
              <h1 className="text-2xl lg:text-3xl font-display font-bold text-white drop-shadow-lg">
                Кабинет менеджера по продажам
              </h1>
              <p className="text-sm lg:text-base text-white/85 drop-shadow">
                Лиды, КП, договоры и звонки — в одном окне. Раздел: <span className="font-medium">{activeLabel}</span>
              </p>
            </div>
          </div>
        </HeroBannerSwiper>
      </div>
    </>
  );
}
