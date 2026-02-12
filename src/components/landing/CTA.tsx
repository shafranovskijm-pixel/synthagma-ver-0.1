import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";


export function CTA() {
  return (
    <section className="section-padding relative overflow-hidden">
      {/* Rich gradient background */}
      <div className="absolute inset-0 bg-foreground" />
      <div className="absolute inset-0 bg-gradient-to-br from-accent/15 via-transparent to-accent/10" />
      <div className="absolute inset-0 bg-gradient-to-tl from-primary/20 via-transparent to-transparent" />
      
      {/* Radial glow effects */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-accent/10 rounded-full blur-[150px]" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-accent/8 rounded-full blur-[120px]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-background/5 rounded-full blur-[100px]" />
      
      {/* Decorative pattern */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
        backgroundSize: '32px 32px'
      }} />
      
      {/* Decorative elements */}
      <motion.div 
        className="absolute top-1/4 right-[15%] w-px h-40 bg-gradient-to-b from-transparent via-accent/40 to-transparent"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5 }}
      />
      <motion.div 
        className="absolute bottom-1/4 left-[12%] w-px h-32 bg-gradient-to-b from-transparent via-background/20 to-transparent"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, delay: 0.3 }}
      />
      <motion.div 
        className="absolute top-1/3 left-[8%] w-20 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, delay: 0.5 }}
      />
      
      {/* Corner decorations */}
      <motion.div
        className="absolute top-16 left-16 w-20 h-20 border-l border-t border-accent/20 rounded-tl-3xl"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1 }}
      />
      <motion.div
        className="absolute bottom-16 right-16 w-20 h-20 border-r border-b border-accent/20 rounded-br-3xl"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.2 }}
      />

      {/* Floating circles */}
      <motion.div
        className="absolute top-1/4 left-[20%] w-3 h-3 rounded-full bg-accent/20"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.6 }}
      />
      <motion.div
        className="absolute bottom-1/3 right-[25%] w-2 h-2 rounded-full border border-accent/30"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.8 }}
      />

      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-3xl mx-auto text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-accent/30 bg-accent/10 backdrop-blur-sm mb-10"
          >
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="text-sm text-background/90 font-medium">Начните бесплатно</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.1 }}
          >
            <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-medium text-background mb-8 leading-tight tracking-tight">Готовы автоматизировать обучение?</h2>
          </motion.div>

          {/* Decorative line with dots */}
          <motion.div
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: 0.4 }}
            className="flex items-center justify-center gap-2 mb-8"
          >
            <div className="w-2 h-2 rounded-full bg-accent/50" />
            <div className="w-20 h-px bg-accent" />
            <div className="w-2 h-2 rounded-full bg-accent/50" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="mb-12"
          >
            <p className="text-lg md:text-xl text-background/70 max-w-xl mx-auto leading-relaxed">Присоединяйтесь к организациям, которые уже используют нашу платформу</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link to="/register-organization">
              <Button
                size="lg"
                className="bg-background text-foreground hover:bg-background/90 rounded-xl px-10 h-14 text-base font-medium gap-2 group shadow-lg"
              >
                Попробовать бесплатно
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link to="/login">
              <Button
                size="lg"
                variant="outline"
                className="border-background/30 bg-transparent text-background hover:bg-background/10 hover:text-background rounded-xl px-8 h-14 text-base"
              >
                Уже есть аккаунт? Войти
              </Button>
            </Link>
          </motion.div>

          {/* Trust badges */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="mt-12 flex flex-wrap justify-center gap-6 text-background/60 text-sm"
          >
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-background/5 border border-background/10">
              <CheckCircle2 className="w-4 h-4 text-accent" />
              <span>14 дней бесплатно</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-background/5 border border-background/10">
              <CheckCircle2 className="w-4 h-4 text-accent" />
              <span>Не требуется карта</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-background/5 border border-background/10">
              <CheckCircle2 className="w-4 h-4 text-accent" />
              <span>Настройка за 5 минут</span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
