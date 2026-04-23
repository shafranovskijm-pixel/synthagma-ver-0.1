import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, Sparkles, ShieldCheck, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import frdoErrorsPain from "@/assets/features/frdo-errors-pain.png";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

/**
 * Slide showcasing the FRDO "недопустимый символ" pain — adapted from
 * FeatureFRDO page so it can live inside the landing-page slider next to
 * the editor demo.
 */
export function FrdoPainSlide() {
  return (
    <div className="grid lg:grid-cols-2 gap-10 lg:gap-12 items-center">
      {/* Left column — pain copy + checklist */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-destructive/10 border border-destructive/20 mb-6">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <span className="text-sm font-medium text-destructive">Знакомо?</span>
        </div>

        <h3 className="font-display text-2xl md:text-3xl font-medium mb-4 tracking-tight leading-tight">
          Забудь про ручной ввод и <span className="text-destructive">«недопустимый символ»</span> в ФИС ФРДО
        </h3>

        <p className="text-base text-muted-foreground mb-6 leading-relaxed">
          Невидимые пробелы в СНИЛС, неправильные форматы дат, лишние табуляции — и так каждый месяц. Часы ручной чистки Excel перед каждой выгрузкой.
        </p>

        <div className="space-y-2.5">
          <p className="text-sm font-semibold text-foreground mb-2">С Синтагмой — ноль ошибок:</p>
          {[
            { icon: Sparkles, text: "Авто-форматирование СНИЛС, дат, ФИО" },
            { icon: ShieldCheck, text: "Очистка скрытых пробелов и табуляций" },
            { icon: CheckCircle2, text: "Проверка полноты данных ДО выгрузки" },
            { icon: FileSpreadsheet, text: "Шаблоны 35/41 столбцов под актуальные требования" },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-card/80 border border-border/50">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                <item.icon className="w-4 h-4 text-accent" />
              </div>
              <p className="text-sm text-foreground/90 pt-1.5 font-medium">{item.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/register-organization">
            <Button size="lg" className="btn-accent px-7">
              Попробовать бесплатно
            </Button>
          </Link>
          <Link to="/feature/frdo#frdo-file-fixer">
            <Button size="lg" variant="secondary" className="px-7">
              Проверить файл
            </Button>
          </Link>
          <Link to="/feature/frdo">
            <Button size="lg" variant="outline" className="px-7">
              Подробнее про ФРДО
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* Right column — pseudo-browser screenshot of validator errors */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="relative">
        <div
          className="relative rounded-xl overflow-hidden shadow-2xl border border-border/50 bg-card"
          style={{ transform: "rotate(1.5deg)" }}
        >
          <div className="flex items-center gap-1.5 px-4 py-3 bg-muted/60 border-b border-border/50">
            <div className="w-3 h-3 rounded-full bg-destructive/60" />
            <div className="w-3 h-3 rounded-full bg-muted-foreground/40" />
            <div className="w-3 h-3 rounded-full bg-accent/60" />
            <div className="ml-3 px-3 py-1 rounded-md bg-background/80 text-xs text-muted-foreground font-mono truncate">
              fis-frdo.obrnadzor.gov.ru — лог ошибок
            </div>
          </div>
          <img
            src={frdoErrorsPain}
            alt="Реальный лог ошибок валидатора ФИС ФРДО — десятки строк «недопустимый символ»"
            className="w-full h-auto block"
            loading="lazy"
          />
        </div>

        <div className="absolute -top-4 -right-4 px-3 py-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold shadow-lg rotate-6">
          Реальный кейс клиента
        </div>
      </motion.div>
    </div>
  );
}
