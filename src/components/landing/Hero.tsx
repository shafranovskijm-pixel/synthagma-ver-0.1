import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Shield, FileCheck, GraduationCap, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { TypewriterText } from "@/components/ui/TypewriterText";
import { StarfieldCanvas } from "@/components/landing/StarfieldCanvas";

const features = [
  { icon: GraduationCap, label: "Дистанционное обучение" },
  { icon: FileCheck, label: "Документооборот" },
  { icon: Shield, label: "Соответствие 273-ФЗ" },
  { icon: BookOpen, label: "200+ готовых курсов", href: "/rostechnadzor-courses" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#0a0e1a]">
      <StarfieldCanvas />

      {/* Hero content */}
      <div className="relative z-10 container mx-auto px-6 pt-12 pb-8 md:pt-16 md:pb-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-white/20 bg-white/5 backdrop-blur-sm mb-10"
          >
            <Sparkles className="w-4 h-4 text-[hsl(174,72%,46%)]" />
            <span className="text-sm text-white/80 font-medium">Система дистанционного обучения</span>
          </motion.div>

          {/* Main headline */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
          >
            <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-medium leading-[1.1] mb-8 tracking-tight text-white">
              <TypewriterText text="Обучение и документы" speed={60} delay={400} />
              <br />
              <span className="text-white/50">
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
            <div className="w-2 h-2 rounded-full bg-[hsl(174,72%,46%)]/40" />
            <div className="w-20 h-px bg-[hsl(174,72%,46%)]" />
            <div className="w-2 h-2 rounded-full bg-[hsl(174,72%,46%)]/40" />
          </motion.div>

          {/* Subtitle */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="mb-12"
          >
            <p className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto leading-relaxed">Создавайте курсы, управляйте документами и отслеживайте прогресс учеников. Полное соответствие требованиям законодательства.</p>
          </motion.div>

          {/* Single CTA button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="flex justify-center mb-16"
          >
            <Link to="/register-organization">
              <Button size="lg" className="btn-gradient rounded-xl px-10 h-14 text-base gap-2 group shadow-lg shadow-[hsl(174,72%,46%)]/20">
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
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center group-hover:bg-white/15 transition-colors">
                    <feature.icon className="w-5 h-5 text-[hsl(174,72%,46%)]" />
                  </div>
                  <span className="text-sm font-medium text-white/80">{feature.label}</span>
                </div>
              );
              return (
                <motion.div
                  key={feature.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.8 + index * 0.1 }}
                  className="group relative px-5 py-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-white/20 hover:bg-white/10 transition-all duration-300"
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