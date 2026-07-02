import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { DemoVideoDialog } from "@/components/landing/DemoVideoDialog";

export function FinalCta() {
  const [demoOpen, setDemoOpen] = useState(false);
  return (
    <section className="py-20 md:py-28 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-secondary/20 to-background" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/5 rounded-full blur-3xl pointer-events-none" />

      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="max-w-3xl mx-auto"
        >
          <div className="relative rounded-3xl p-[1px] bg-gradient-to-br from-accent/40 via-accent/15 to-border/40">
            <div className="relative rounded-3xl bg-card/90 backdrop-blur-md p-10 md:p-14 text-center">
              <h2 className="font-display text-3xl md:text-4xl font-medium tracking-tight mb-4">
                Хотите запустить дистанционное обучение без хаоса?
              </h2>
              <p className="text-base md:text-lg text-muted-foreground max-w-xl mx-auto mb-8 leading-relaxed">
                Оставьте заявку — покажем, как СИНТАГМА может работать именно в вашем учебном центре.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link to="/register-organization">
                  <Button size="lg" className="btn-gradient rounded-xl px-8 h-13 gap-2 group shadow-lg shadow-accent/20 w-full sm:w-auto">
                    Оставить заявку на запуск
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <Link to="/demonstration">
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    className="rounded-xl px-8 gap-2 w-full sm:w-auto"
                  >
                    <Play className="w-4 h-4" />
                    Демонстрация возможностей
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
      <DemoVideoDialog open={demoOpen} onOpenChange={setDemoOpen} />
    </section>
  );
}
