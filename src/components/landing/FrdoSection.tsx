import { FrdoPainSlide } from "./FrdoPainSlide";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

export function FrdoSection() {
  return (
    <section className="py-20 lg:py-28 relative overflow-hidden bg-gradient-to-b from-background via-muted/10 to-background">
      <div className="container mx-auto max-w-6xl px-6 relative z-10">
        <ScrollReveal>
          <div className="text-center mb-10 max-w-3xl mx-auto">
            <span className="inline-block px-4 py-1.5 rounded-full text-sm font-medium mb-4 bg-accent/10 text-accent">
              ФИС ФРДО
            </span>
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4 tracking-tight">
              ФИС ФРДО без ручной чистки таблиц и скрытых ошибок
            </h2>
            <p className="text-muted-foreground text-lg">
              СИНТАГМА помогает подготовить данные к выгрузке: форматирует СНИЛС, даты и ФИО,
              очищает скрытые пробелы и проверяет заполненность перед отправкой.
            </p>
          </div>
        </ScrollReveal>

        <FrdoPainSlide />
      </div>
    </section>
  );
}
