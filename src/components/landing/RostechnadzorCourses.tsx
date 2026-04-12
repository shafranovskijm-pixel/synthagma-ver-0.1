import { motion } from "framer-motion";
import { Shield, BookOpen, CheckCircle2, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FloatingParticles } from "./FloatingParticles";

const stats = [
  { value: "300+", label: "готовых курсов" },
  { value: "14", label: "направлений обучения" },
  { value: "24/7", label: "доступ к обучению" },
];

const highlights = [
  "Электробезопасность, энергетика, промышленная безопасность",
  "Охрана труда, пожарная безопасность, медицина",
  "Рабочие профессии, строительные специальности, экология",
  "Готовые курсы — подключите к организации за 5 минут",
];

export function RostechnadzorCourses() {
  return (
    <section className="py-16 md:py-20 relative overflow-hidden">
      {/* Floating particles */}
      <FloatingParticles mode="mixed" count={8} />

      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-background to-secondary/20" />
      <div className="absolute inset-0 opacity-[0.012]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
        backgroundSize: '32px 32px'
      }} />

      {/* Decorative elements */}
      <div className="absolute top-[8%] right-[5%] w-72 h-72 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[10%] left-[3%] w-64 h-64 bg-accent/4 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        className="absolute top-[20%] left-0 w-px h-32 bg-gradient-to-b from-transparent via-accent/25 to-transparent"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5 }}
      />
      <motion.div
        className="absolute bottom-[15%] right-0 w-px h-40 bg-gradient-to-b from-transparent via-accent/20 to-transparent"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, delay: 0.2 }}
      />

      {/* Corners */}
      <motion.div
        className="absolute top-12 left-8 w-14 h-14 border-l border-t border-accent/15 rounded-tl-2xl"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.5 }}
      />
      <motion.div
        className="absolute bottom-12 right-8 w-14 h-14 border-r border-b border-accent/15 rounded-br-2xl"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.6 }}
      />

      {/* Diamonds */}
      <motion.div
        className="absolute top-[35%] right-[8%] w-4 h-4 rotate-45 border border-accent/20"
        initial={{ opacity: 0, rotate: 0 }}
        whileInView={{ opacity: 1, rotate: 45 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.7 }}
      />
      <motion.div
        className="absolute bottom-[25%] left-[10%] w-3 h-3 rotate-45 bg-accent/10"
        initial={{ opacity: 0, rotate: 0 }}
        whileInView={{ opacity: 1, rotate: 45 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.9 }}
      />

      {/* Circles */}
      <motion.div
        className="absolute top-[55%] left-[5%] w-2.5 h-2.5 rounded-full bg-accent/30"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.8 }}
      />

      <div className="container mx-auto px-6 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left — content */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-accent/30 bg-accent/5 mb-6">
              <Shield className="w-4 h-4 text-accent" />
              <span className="text-sm text-foreground/80 font-medium">Готовые курсы · 14 направлений</span>
            </div>

            <h2 className="font-display text-3xl md:text-4xl font-medium mb-4 tracking-tight">
              300+ готовых курсов
              <br />
              <span className="text-accent">для обучения сотрудников</span>
            </h2>

            <div className="w-12 h-px bg-accent/60 mb-6" />

            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
              Полная библиотека курсов по 14 направлениям: от электробезопасности и охраны труда 
              до медицины и рабочих профессий. Подключите готовые программы к своей организации — 
              не нужно разрабатывать контент с нуля.
            </p>

            <div className="space-y-3 mb-8">
              {highlights.map((text) => (
                <div key={text} className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                  <span className="text-sm text-foreground/80">{text}</span>
                </div>
              ))}
            </div>

            <Link to="/rostechnadzor-courses">
              <Button className="btn-gradient rounded-xl px-8 h-12 text-sm gap-2 group">
                Подробнее о курсах
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </motion.div>

          {/* Right — stats cards */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          >
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
                className="relative rounded-2xl p-[1px] group"
              >
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-accent/30 via-border/30 to-accent/10 group-hover:from-accent/50 group-hover:to-accent/20 transition-all duration-500" />
                <div className="relative bg-card/90 backdrop-blur-md rounded-2xl p-6 text-center h-full">
                  <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-16 bg-accent/15 blur-2xl" />
                  </div>
                  <div className="relative z-10">
                    <div className="font-display text-3xl md:text-4xl font-medium text-accent mb-2">
                      {stat.value}
                    </div>
                    <div className="text-sm text-muted-foreground">{stat.label}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
