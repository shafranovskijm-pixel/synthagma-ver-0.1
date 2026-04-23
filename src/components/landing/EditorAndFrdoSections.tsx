import { EditorDemoCard } from "./EditorDemoCard";
import { FrdoPainSlide } from "./FrdoPainSlide";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

/**
 * Two stacked landing sections (no slider):
 * 1) "Забудьте про «недопустимый ФРДО»" — pain story.
 * 2) "Создавайте курсы за минуты" — interactive editor demo.
 */
export function EditorAndFrdoSections() {
  return (
    <>
      {/* Section 1: FRDO pain */}
      <section className="py-20 lg:py-28 relative overflow-hidden bg-gradient-to-b from-background via-muted/10 to-background">
        <div className="container mx-auto max-w-6xl px-6 relative z-10">
          <ScrollReveal>
            <div className="text-center mb-10">
              <span className="inline-block px-4 py-1.5 rounded-full text-sm font-medium mb-4 bg-destructive/10 text-destructive">
                Боль клиента
              </span>
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-4 tracking-tight">
                Забудьте про «недопустимый символ» в ФИС ФРДО
              </h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Невидимые пробелы, табуляции, кривой СНИЛС — Синтагма чистит и переупаковывает Excel в эталонный шаблон 35/41
              </p>
            </div>
          </ScrollReveal>

          <FrdoPainSlide />
        </div>
      </section>

      {/* Section 2: Editor demo */}
      <section className="py-20 lg:py-28 relative overflow-hidden bg-gradient-to-b from-background via-muted/10 to-background">
        <div className="container mx-auto max-w-6xl px-6 relative z-10">
          <ScrollReveal>
            <div className="text-center mb-10">
              <span className="inline-block px-4 py-1.5 rounded-full text-sm font-medium mb-4 bg-primary/10 text-primary">
                Интерактивный редактор
              </span>
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-4 tracking-tight">
                Создавайте курсы за минуты
              </h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Блоковый редактор с AI-генерацией и профессиональной озвучкой
              </p>
            </div>
          </ScrollReveal>

          <EditorDemoCard />
        </div>
      </section>
    </>
  );
}
