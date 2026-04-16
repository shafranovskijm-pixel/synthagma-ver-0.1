import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { RadioPlayerButton } from "@/components/radio/RadioPlayerButton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StarfieldCanvas } from "./StarfieldCanvas";

const logoLetters = "СИНТАГМА".split("");

export function LandingHeader() {
  const [hovered, setHovered] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-[#0a0e1a] relative overflow-hidden">
      <StarfieldCanvas />

      <div className="container mx-auto px-6 py-4 relative z-10">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-3"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center hover:scale-105 transition-transform duration-300">
              <span className="font-display font-bold text-xl text-[#0a0e1a]">Σ</span>
            </div>
            <span className="font-display font-medium text-xl tracking-tight text-white flex">
              {logoLetters.map((letter, i) => (
                <span
                  key={i}
                  className="inline-block"
                  style={{
                    opacity: hovered ? 0 : 1,
                    transform: hovered ? "translateX(30px)" : "translateX(0)",
                    transition: `transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 0.08}s, opacity 0.4s ease ${i * 0.08}s`,
                  }}
                >
                  {letter}
                </span>
              ))}
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-10">
            <a href="/#pricing" className="text-white/60 hover:text-white transition-colors text-sm tracking-wide">
              Стоимость
            </a>
            <Link to="/about" className="text-white/60 hover:text-white transition-colors text-sm tracking-wide">
              О нас
            </Link>
            <Link to="/blog" className="text-white/60 hover:text-white transition-colors text-sm tracking-wide">
              Блог
            </Link>
            <Link to="/presentation" className="text-white/60 hover:text-white transition-colors text-sm tracking-wide">
              Презентация
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <TooltipProvider>
              <RadioPlayerButton />
            </TooltipProvider>
            <ThemeToggle />
            <Link to="/login">
              <Button variant="ghost" className="text-sm font-medium text-white/80 hover:text-white hover:bg-white/10">
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
