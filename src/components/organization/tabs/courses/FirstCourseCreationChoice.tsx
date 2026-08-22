import { ArrowLeft, BookOpen, FileUp, PenLine, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface FirstCourseCreationChoiceProps {
  onImportMaterials: () => void;
  onOpenMarketplace: () => void;
  onCreateManually: () => void;
  onBack?: () => void;
  onSkip?: () => void;
  hasWelcomeCourse?: boolean;
}

export function FirstCourseCreationChoice({
  onImportMaterials,
  onOpenMarketplace,
  onCreateManually,
  onBack,
  onSkip,
  hasWelcomeCourse = false,
}: FirstCourseCreationChoiceProps) {
  return (
    <section
      id="first-course-creation-options"
      tabIndex={-1}
      aria-labelledby="first-course-creation-title"
      className="scroll-mt-32 rounded-2xl border border-primary/20 bg-card p-5 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40 lg:p-7"
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад к шагам
        </button>
      )}
      <div className="mx-auto max-w-4xl text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BookOpen className="h-5 w-5" />
        </div>
        <h2 id="first-course-creation-title" className="font-display text-xl font-semibold lg:text-2xl">
          Как создать первый курс?
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
          Выберите подходящий способ. Все варианты сохранят курс в вашем кабинете.
        </p>
      </div>

      <div className="mx-auto mt-6 grid max-w-4xl gap-4 md:grid-cols-2">
        <Card className="flex flex-col border-primary/40 bg-primary/[0.04] p-5 shadow-sm md:row-span-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <FileUp className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">Создать из материалов</h3>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
            Загрузите готовый файл, а импорт соберёт из него структуру курса и уроки.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">DOCX</span>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">PPTX</span>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">TXT</span>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">HTML</span>
            <span
              className="rounded-full bg-amber-500/10 px-2.5 py-1 font-medium text-amber-700 dark:text-amber-300"
              title="Старый бинарный DOC импортируется в Beta-режиме. Для предсказуемого результата сохраните файл как DOCX."
            >
              DOC — Beta
            </span>
            <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground" title="Текущий импорт пока не принимает PDF">
              PDF — скоро
            </span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Для документов рекомендуем DOCX. Старый формат DOC работает в Beta-режиме и требует проверки результата.
          </p>
          <Button className="mt-5 w-full gap-2" onClick={onImportMaterials}>
            <FileUp className="h-4 w-4" />
            Создать из материалов
          </Button>
        </Card>

        <Card className="flex items-start gap-4 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/20 text-accent-foreground">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">Взять готовый курс</h3>
              <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
                Beta
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Выберите программу в магазине и добавьте её в кабинет.</p>
            <Button variant="outline" className="mt-4 w-full gap-2" onClick={onOpenMarketplace}>
              <ShoppingBag className="h-4 w-4" />
              Открыть магазин
            </Button>
          </div>
        </Card>

        <Card className="flex items-start gap-4 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
            <PenLine className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">Создать вручную</h3>
            <p className="mt-1 text-sm text-muted-foreground">Начните с пустого курса и заполните уроки в конструкторе.</p>
            <Button variant="ghost" className="mt-4 w-full gap-2" onClick={onCreateManually}>
              <PenLine className="h-4 w-4" />
              Создать вручную
            </Button>
          </div>
        </Card>
      </div>

      {hasWelcomeCourse && onSkip && (
        <div className="mt-5 text-center">
          <button type="button" onClick={onSkip} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Пока пропустить и открыть приветственный курс
          </button>
        </div>
      )}
    </section>
  );
}
