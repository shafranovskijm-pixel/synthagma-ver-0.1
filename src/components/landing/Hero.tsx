import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ArrowRight, Play, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

const features = [
  "Дистанционное обучение",
  "Документооборот",
  "Соответствие 273-ФЗ",
];

export function Hero() {
  return (
    <section className="relative min-h-screen overflow-hidden bg-background">
      {/* Subtle gradient background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-secondary/50 via-background to-background" />
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-accent/5 rounded-full blur-3xl translate-x-1/3 -translate-y-1/3" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-accent/3 rounded-full blur-3xl -translate-x-1/3 translate-y-1/3" />
      </div>

      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div 
          className="absolute top-1/4 right-[15%] w-px h-32 bg-gradient-to-b from-transparent via-accent/30 to-transparent"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 1.5, delay: 0.5 }}
        />
        <motion.div 
          className="absolute bottom-1/3 left-[10%] w-px h-24 bg-gradient-to-b from-transparent via-border to-transparent"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 1.5, delay: 0.8 }}
        />
        <motion.div 
          className="absolute top-1/2 left-[20%] w-16 h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 1.5, delay: 1 }}
        />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 container mx-auto px-6 py-8">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-lg bg-foreground flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
              <span className="font-display font-bold text-xl text-background">Σ</span>
            </div>
            <span className="font-display font-medium text-xl tracking-tight">СИНТАГМА</span>
          </Link>
          
          <div className="hidden md:flex items-center gap-10">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors text-sm tracking-wide">
              Возможности
            </a>
            <a href="#roadmap" className="text-muted-foreground hover:text-foreground transition-colors text-sm tracking-wide">
              Развитие
            </a>
            <a href="#calculator" className="text-muted-foreground hover:text-foreground transition-colors text-sm tracking-wide">
              Стоимость
            </a>
            <Link to="/blog" className="text-muted-foreground hover:text-foreground transition-colors text-sm tracking-wide">
              Блог
            </Link>
          </div>
          
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link to="/login">
              <Button variant="ghost" className="text-sm font-medium">
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
      </nav>

      {/* Hero content */}
      <div className="relative z-10 container mx-auto px-6 pt-20 pb-32 md:pt-32 md:pb-40">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-card/50 backdrop-blur-sm mb-10"
          >
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="text-sm text-muted-foreground">Система дистанционного обучения</span>
          </motion.div>

          {/* Main headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="font-display text-5xl md:text-6xl lg:text-7xl font-medium leading-[1.1] mb-8 tracking-tight"
          >
            Обучение и документы
            <br />
            <span className="text-muted-foreground">в одной системе</span>
          </motion.h1>

          {/* Decorative line */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1, delay: 0.4 }}
            className="w-16 h-px bg-accent mx-auto mb-8 origin-center"
          />

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="text-lg md:text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed"
          >
            Создавайте курсы, управляйте документами и отслеживайте прогресс учеников.
            Полное соответствие требованиям законодательства.
          </motion.p>

          {/* CTA buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12"
          >
            <Link to="/register-organization">
              <Button size="lg" className="btn-gradient rounded-xl px-8 h-14 text-base gap-2 group">
                Начать бесплатно
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <a href="#video-preview">
              <Button size="lg" variant="outline" className="rounded-xl px-8 h-14 text-base gap-2 border-border/60 hover:bg-secondary/50">
                <Play className="w-4 h-4" />
                Смотреть демо
              </Button>
            </a>
          </motion.div>

          {/* Feature tags */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.7 }}
            className="flex flex-wrap justify-center gap-3"
          >
            {features.map((feature, index) => (
              <motion.span
                key={feature}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.8 + index * 0.1 }}
                className="px-4 py-2 rounded-full bg-secondary/50 text-sm text-muted-foreground border border-border/30"
              >
                {feature}
              </motion.span>
            ))}
          </motion.div>
        </div>

        {/* Platform preview */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.9 }}
          className="mt-24 relative max-w-5xl mx-auto"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 pointer-events-none h-1/3 bottom-0 top-auto" />
          
          <div className="bg-card border border-border/50 rounded-2xl p-2 shadow-2xl overflow-hidden">
            <div className="bg-secondary/50 rounded-xl aspect-video flex items-center justify-center relative overflow-hidden">
              {/* Mock UI */}
              <div className="absolute top-3 left-3 right-3 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-foreground/20" />
                  <div className="w-2.5 h-2.5 rounded-full bg-foreground/20" />
                  <div className="w-2.5 h-2.5 rounded-full bg-foreground/20" />
                </div>
                <div className="flex-1 h-6 bg-foreground/5 rounded-md mx-4" />
              </div>
              
              <div className="text-center">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="w-20 h-20 rounded-2xl bg-foreground flex items-center justify-center mx-auto mb-4 cursor-pointer shadow-lg"
                >
                  <Play className="w-8 h-8 text-background ml-1" />
                </motion.div>
                <p className="text-muted-foreground text-sm">Смотреть видео о платформе</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
