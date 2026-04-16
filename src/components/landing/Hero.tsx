import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Shield, FileCheck, GraduationCap, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { FloatingParticles } from "./FloatingParticles";
import { TypewriterText } from "@/components/ui/TypewriterText";


const features = [
  { icon: GraduationCap, label: "Дистанционное обучение" },
  { icon: FileCheck, label: "Документооборот" },
  { icon: Shield, label: "Соответствие 273-ФЗ" },
  { icon: BookOpen, label: "200+ готовых курсов", href: "/rostechnadzor-courses" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-background">
      {/* Rich gradient background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/8 via-background to-secondary/30" />
        <div className="absolute top-0 right-0 w-[1000px] h-[1000px] bg-accent/10 rounded-full blur-[120px] translate-x-1/4 -translate-y-1/4" />
        <div className="absolute bottom-0 left-0 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[100px] -translate-x-1/4 translate-y-1/4" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[80px]" />
      </div>

      {/* Decorative pattern overlay */}
      <div className="absolute inset-0 opacity-[0.015]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
        backgroundSize: '40px 40px'
      }} />

      {/* Floating particles that interact with cursor */}
      <FloatingParticles count={15} mode="icons" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Vertical lines */}
        <motion.div 
          className="absolute top-20 right-[20%] w-px h-48 bg-gradient-to-b from-transparent via-accent/40 to-transparent"
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={{ duration: 1.5, delay: 0.5 }}
        />
        <motion.div 
          className="absolute top-40 right-[18%] w-px h-32 bg-gradient-to-b from-transparent via-accent/20 to-transparent"
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={{ duration: 1.5, delay: 0.7 }}
        />
        <motion.div 
          className="absolute bottom-32 left-[12%] w-px h-40 bg-gradient-to-b from-transparent via-border to-transparent"
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={{ duration: 1.5, delay: 0.8 }}
        />
        <motion.div 
          className="absolute top-[60%] left-[8%] w-px h-24 bg-gradient-to-b from-transparent via-accent/30 to-transparent"
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={{ duration: 1.5, delay: 0.9 }}
        />
        <motion.div 
          className="absolute top-[45%] right-[5%] w-px h-36 bg-gradient-to-b from-transparent via-accent/25 to-transparent"
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={{ duration: 1.5, delay: 1.1 }}
        />
        
        {/* Horizontal lines */}
        <motion.div 
          className="absolute top-1/3 left-[8%] w-24 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 1.5, delay: 1 }}
        />
        <motion.div 
          className="absolute top-2/3 right-[10%] w-20 h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 1.5, delay: 1.2 }}
        />
        <motion.div 
          className="absolute top-[55%] left-[20%] w-16 h-px bg-gradient-to-r from-transparent via-accent/25 to-transparent"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 1.5, delay: 1.3 }}
        />
        <motion.div 
          className="absolute bottom-[40%] right-[15%] w-28 h-px bg-gradient-to-r from-transparent via-border to-transparent"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 1.5, delay: 1.4 }}
        />

        {/* Decorative circles */}
        <motion.div
          className="absolute top-1/4 left-[15%] w-2 h-2 rounded-full bg-accent/30"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.3 }}
        />
        <motion.div
          className="absolute top-1/2 right-[25%] w-3 h-3 rounded-full border border-accent/30"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.4 }}
        />
        <motion.div
          className="absolute bottom-1/3 left-[25%] w-1.5 h-1.5 rounded-full bg-accent/40"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.5 }}
        />
        <motion.div
          className="absolute top-[35%] right-[8%] w-2.5 h-2.5 rounded-full border border-accent/25"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.6 }}
        />
        <motion.div
          className="absolute bottom-[25%] right-[30%] w-1.5 h-1.5 rounded-full bg-accent/35"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.7 }}
        />
        <motion.div
          className="absolute top-[70%] left-[5%] w-2 h-2 rounded-full border border-border"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.8 }}
        />

        {/* Corner decorations */}
        <motion.div
          className="absolute top-32 left-8 w-16 h-16 border-l border-t border-accent/20 rounded-tl-3xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.6 }}
        />
        <motion.div
          className="absolute bottom-32 right-8 w-16 h-16 border-r border-b border-accent/20 rounded-br-3xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.7 }}
        />
        <motion.div
          className="absolute top-48 right-16 w-12 h-12 border-r border-t border-border/40 rounded-tr-2xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.9 }}
        />
        <motion.div
          className="absolute bottom-48 left-16 w-10 h-10 border-l border-b border-border/30 rounded-bl-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 2 }}
        />

        {/* Floating diamonds */}
        <motion.div
          className="absolute top-1/3 right-[30%] w-4 h-4 rotate-45 border border-accent/20"
          initial={{ opacity: 0, rotate: 0 }}
          animate={{ opacity: 1, rotate: 45 }}
          transition={{ duration: 1, delay: 1.8 }}
        />
        <motion.div
          className="absolute bottom-[45%] left-[18%] w-3 h-3 rotate-45 border border-accent/30"
          initial={{ opacity: 0, rotate: 0 }}
          animate={{ opacity: 1, rotate: 45 }}
          transition={{ duration: 1, delay: 2.1 }}
        />
        <motion.div
          className="absolute top-[60%] right-[12%] w-2.5 h-2.5 rotate-45 bg-accent/15"
          initial={{ opacity: 0, rotate: 0 }}
          animate={{ opacity: 1, rotate: 45 }}
          transition={{ duration: 1, delay: 2.2 }}
        />

        {/* Cross patterns */}
        <motion.div
          className="absolute top-[40%] left-[30%]"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 2.3 }}
        >
          <div className="w-4 h-px bg-accent/20" />
          <div className="w-px h-4 bg-accent/20 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </motion.div>
        <motion.div
          className="absolute bottom-[35%] right-[22%]"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 2.4 }}
        >
          <div className="w-3 h-px bg-border" />
          <div className="w-px h-3 bg-border absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </motion.div>

        {/* Floating dots grid */}
        <motion.div
          className="absolute top-[25%] right-[35%] grid grid-cols-3 gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 2.5 }}
        >
          {[...Array(9)].map((_, i) => (
            <div key={i} className="w-1 h-1 rounded-full bg-accent/15" />
          ))}
        </motion.div>
      </div>

      {/* Falling stars transition from header to content */}
      <div className="relative h-10 overflow-hidden pointer-events-none -mt-1">
        {[...Array(14)].map((_, i) => {
          const left = 5 + (i * 7) % 90;
          const size = 1 + (i % 3) * 0.5;
          const duration = 1.8 + (i % 4) * 0.5;
          const delay = (i * 0.3) % 2;
          return (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                left: `${left}%`,
                top: 0,
                width: size,
                height: size,
                background: `rgba(255,255,255,${0.15 + (i % 3) * 0.1})`,
                animation: `star-fall ${duration}s ease-in ${delay}s infinite`,
              }}
            />
          );
        })}
      </div>

      {/* Hero content */}
      <div className="relative z-10 container mx-auto px-6 pt-12 pb-8 md:pt-16 md:pb-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-accent/30 bg-accent/5 backdrop-blur-sm mb-10"
          >
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="text-sm text-foreground/80 font-medium">Система дистанционного обучения</span>
          </motion.div>

          {/* Main headline */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
          >
            <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-medium leading-[1.1] mb-8 tracking-tight">
              <TypewriterText text="Обучение и документы" speed={60} delay={400} />
              <br />
              <span className="text-muted-foreground">
                <TypewriterText text="в одной системе" speed={60} delay={1700} />
              </span>
            </h1>
          </motion.div>

          {/* Decorative line with dots */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1, delay: 0.4 }}
            className="flex items-center justify-center gap-2 mb-8"
          >
            <div className="w-2 h-2 rounded-full bg-accent/40" />
            <div className="w-20 h-px bg-accent" />
            <div className="w-2 h-2 rounded-full bg-accent/40" />
          </motion.div>

          {/* Subtitle */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="mb-12"
          >
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">Создавайте курсы, управляйте документами и отслеживайте прогресс учеников. Полное соответствие требованиям законодательства.</p>
          </motion.div>

          {/* Single CTA button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="flex justify-center mb-16"
          >
            <Link to="/register-organization">
              <Button size="lg" className="btn-gradient rounded-xl px-10 h-14 text-base gap-2 group shadow-lg shadow-accent/20">
                Начать бесплатно
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </motion.div>

          {/* Feature cards */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.7 }}
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto"
          >
            {features.map((feature, index) => {
              const content = (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                    <feature.icon className="w-5 h-5 text-accent" />
                  </div>
                  <span className="text-sm font-medium text-foreground/80">{feature.label}</span>
                </div>
              );
              return (
                <motion.div
                  key={feature.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.8 + index * 0.1 }}
                  className="group relative px-5 py-4 rounded-2xl bg-card/60 backdrop-blur-sm border border-border/50 hover:border-accent/30 hover:bg-card transition-all duration-300"
                >
                  {feature.href ? (
                    <Link to={feature.href}>{content}</Link>
                  ) : content}
                </motion.div>
              );
            })}
          </motion.div>
        </div>

      </div>
    </section>
  );
}
