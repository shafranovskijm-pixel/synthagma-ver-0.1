import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, Sparkles, ShieldCheck, CheckCircle2, FileSpreadsheet, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FrdoFileSanitizerDialog } from "@/components/organization/FrdoFileSanitizerDialog";

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
  const [sanitizerOpen, setSanitizerOpen] = useState(false);
  return (
    <>
      <div className="grid lg:grid-cols-2 gap-10 lg:gap-12 items-center">
      {/* Left column — pain copy + checklist */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-destructive/10 border border-destructive/20 mb-6">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <span className="text-sm font-medium text-destructive">Знакомо?</span>
        </div>

        <h3 className="font-display text-2xl md:text-3xl font-medium mb-4 tracking-tight leading-tight">
          Сократите ручную проверку файлов для <span className="text-destructive">ФИС ФРДО</span>
        </h3>

        <p className="text-base text-muted-foreground mb-6 leading-relaxed">
          При подготовке XLSX встречаются невидимые пробелы, лишние табуляции, незаполненные поля и разные форматы дат. Инструмент помогает найти и исправить часть таких проблем до загрузки файла.
        </p>

        <div className="space-y-2.5">
          <p className="text-sm font-semibold text-foreground mb-2">СИНТАГМА проверяет данные до выгрузки:</p>
          {[
            { icon: Sparkles, text: "Авто-форматирование СНИЛС, дат, ФИО" },
            { icon: ShieldCheck, text: "Очистка скрытых пробелов и табуляций" },
            { icon: CheckCircle2, text: "Проверка полноты данных ДО выгрузки" },
            { icon: FileSpreadsheet, text: "Шаблоны ДПО и ПО на 41/35 столбцов" },
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
          <Button
            size="lg"
            className="btn-accent px-7 gap-2"
            onClick={() => setSanitizerOpen(true)}
          >
            <Wrench className="w-4 h-4" />
            Проверить файл
          </Button>
          <Link to="/feature/frdo">
            <Button size="lg" variant="outline" className="px-7">
              Подробнее про ФРДО
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* Right column — factual checklist, not a simulated FRDO screen. */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="relative">
        <div className="relative rounded-3xl border border-border/50 bg-card/80 p-6 shadow-xl backdrop-blur-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10">
              <FileSpreadsheet className="h-6 w-6 text-accent" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-accent">Проверка XLSX</p>
              <h4 className="font-display text-xl font-medium">Перед формированием файла</h4>
            </div>
          </div>
          <div className="space-y-3">
            {[
              "Нормализация форматов СНИЛС и дат",
              "Очистка скрытых пробелов и табуляций",
              "Отметка строк с незаполненными обязательными полями",
              "Экспорт XLSX по шаблонам на 41 или 35 столбцов",
            ].map((text) => (
              <div key={text} className="flex items-start gap-3 rounded-xl border border-border/40 bg-background/60 p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                <p className="text-sm text-foreground/85">{text}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            Перед загрузкой в ФИС ФРДО ответственный сотрудник проверяет результат и при необходимости дополняет данные вручную.
          </p>
        </div>
      </motion.div>
      </div>

      <FrdoFileSanitizerDialog open={sanitizerOpen} onOpenChange={setSanitizerOpen} />
    </>
  );
}
