import { EditorDemoCard } from "./EditorDemoCard";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

export function EditorDemoSection() {
  return (
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
              Блочный редактор с ИИ-генерацией и профессиональной озвучкой помогает быстро
              подготовить учебные материалы под вашу программу.
            </p>
          </div>
        </ScrollReveal>

        <EditorDemoCard />
      </div>
    </section>
  );
}
