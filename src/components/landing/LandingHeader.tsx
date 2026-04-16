import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { RadioPlayerButton } from "@/components/radio/RadioPlayerButton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StarfieldCanvas } from "@/components/landing/StarfieldCanvas";


const logoLetters = "СИНТАГМА".split("");

export function LandingHeader({ showStars = true }: { showStars?: boolean }) {
  const [animKey, setAnimKey] = useState(0);
  const triggerAnim = useCallback(() => setAnimKey((k) => k + 1), []);
  const dark = showStars;

  return (
    <header className={`sticky top-0 z-50 relative ${dark ? 'bg-[#0a0e1a]' : 'bg-background border-b border-border'}`}>
      {dark && <StarfieldCanvas />}

      <div className="container mx-auto px-6 py-4 relative z-10">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-3"
            onMouseEnter={triggerAnim}
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center hover:scale-105 transition-transform duration-300 ${dark ? 'bg-white' : 'bg-foreground'}`}>
              <span className={`font-display font-bold text-xl ${dark ? 'text-[#0a0e1a]' : 'text-background'}`}>Σ</span>
            </div>
            <span className={`font-display font-medium text-xl tracking-tight flex ${dark ? 'text-white' : 'text-foreground'}`}>
              {logoLetters.map((letter, i) => (
                <span
                  key={`${i}-${animKey}`}
                  className="inline-block animate-[letterFlyIn_0.5s_cubic-bezier(0.34,1.56,0.64,1)_forwards]"
                  style={{
                    animationDelay: `${i * 0.07}s`,
                    opacity: 0,
                    transform: "translateX(24px)",
                  }}
                >
                  {letter}
                </span>
              ))}
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-10">
            <a href="/#pricing" className={`transition-colors text-sm tracking-wide ${dark ? 'text-white/60 hover:text-white' : 'text-muted-foreground hover:text-foreground'}`}>
              Стоимость
            </a>
            <Link to="/about" className={`transition-colors text-sm tracking-wide ${dark ? 'text-white/60 hover:text-white' : 'text-muted-foreground hover:text-foreground'}`}>
              О нас
            </Link>
            <Link to="/blog" className={`transition-colors text-sm tracking-wide ${dark ? 'text-white/60 hover:text-white' : 'text-muted-foreground hover:text-foreground'}`}>
              Блог
            </Link>
            <Link to="/presentation" className={`transition-colors text-sm tracking-wide ${dark ? 'text-white/60 hover:text-white' : 'text-muted-foreground hover:text-foreground'}`}>
              Презентация
            </Link>
          </div>

          <div className={`flex items-center gap-3 ${dark ? '[&_button]:text-white/80 [&_button:hover]:text-white [&_button:hover]:bg-white/10' : ''}`}>
            <TooltipProvider>
              <RadioPlayerButton />
            </TooltipProvider>
            <ThemeToggle />
            <Link to="/login">
              <Button variant="ghost" className={`text-sm font-medium ${dark ? 'text-white/80 hover:text-white hover:bg-white/10' : ''}`}>
                Войти
              </Button>
            </Link>
            <Link to="/register-organization" className="hidden sm:block">
              <Button className="btn-gradient rounded-lg px-5 text-sm">
                Начать
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
