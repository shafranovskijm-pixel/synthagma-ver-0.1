import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { defaultLandingTheme, type LandingTheme } from "@/lib/landing-templates/types";
import { cn } from "@/lib/utils";
import { RotateCcw } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  theme: Partial<LandingTheme> | null | undefined;
  onChange: (next: LandingTheme) => void;
}

/**
 * Боковая панель ручной настройки оформления лендинга.
 * Выставляет любую поднабор полей `LandingTheme` поверх текущей темы и
 * прокидывает результат наружу через `onChange`. Не сохраняет сама — за это
 * отвечает родитель (handleSave в редакторе).
 */
export function LandingThemePanel({ open, onOpenChange, theme, onChange }: Props) {
  const current: LandingTheme = { ...defaultLandingTheme, ...(theme ?? {}) };

  const update = <K extends keyof LandingTheme>(key: K, value: LandingTheme[K]) => {
    onChange({ ...current, [key]: value });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Оформление страницы</SheetTitle>
          <SheetDescription>Меняйте композицию, шрифты и стиль секций. Результат виден сразу в редакторе.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <Group label="Композиция Hero">
            <ChoiceRow
              value={current.hero_layout}
              onChange={(v) => update("hero_layout", v)}
              options={[
                { value: "overlay", label: "Фото-фон" },
                { value: "split-right", label: "Текст + фото справа" },
                { value: "split-left", label: "Фото слева + текст" },
                { value: "centered-photo", label: "Центр + полароид" },
                { value: "dark-promo", label: "Тёмный промо" },
              ]}
            />
          </Group>

          <Group label="Тарифы">
            <ChoiceRow
              value={current.pricing_layout}
              onChange={(v) => update("pricing_layout", v)}
              options={[
                { value: "cards", label: "Карточки" },
                { value: "highlight-middle", label: "Акцент по центру" },
                { value: "comparison", label: "Сравнение" },
              ]}
            />
          </Group>

          <Group label="Кому подойдёт">
            <ChoiceRow
              value={current.audience_layout}
              onChange={(v) => update("audience_layout", v)}
              options={[
                { value: "grid", label: "Сетка" },
                { value: "icons-row", label: "Иконки в ряд" },
                { value: "stacked-cards", label: "Стопка карточек" },
              ]}
            />
          </Group>

          <Group label="Отзывы">
            <ChoiceRow
              value={current.reviews_layout}
              onChange={(v) => update("reviews_layout", v)}
              options={[
                { value: "cards", label: "Карточки" },
                { value: "masonry", label: "Кладка" },
                { value: "carousel-mini", label: "Карусель" },
              ]}
            />
          </Group>

          <Group label="Преимущества">
            <ChoiceRow
              value={current.benefits_layout}
              onChange={(v) => update("benefits_layout", v)}
              options={[
                { value: "grid", label: "Сетка" },
                { value: "icon-list", label: "Список с иконками" },
              ]}
            />
          </Group>

          <Separator />

          <Group label="Шрифт заголовков">
            <ChoiceRow
              value={current.font_heading}
              onChange={(v) => update("font_heading", v)}
              options={[
                { value: "inter", label: "Inter" },
                { value: "manrope", label: "Manrope" },
                { value: "playfair", label: "Playfair" },
                { value: "unbounded", label: "Unbounded" },
                { value: "jetbrains", label: "JetBrains" },
              ]}
            />
          </Group>

          <Group label="Шрифт текста">
            <ChoiceRow
              value={current.font_body}
              onChange={(v) => update("font_body", v)}
              options={[
                { value: "inter", label: "Inter" },
                { value: "manrope", label: "Manrope" },
                { value: "pt-serif", label: "PT Serif" },
              ]}
            />
          </Group>

          <Group label="Скругления">
            <ChoiceRow
              value={current.radius}
              onChange={(v) => update("radius", v)}
              options={[
                { value: "sharp", label: "Острые" },
                { value: "soft", label: "Мягкие" },
                { value: "pill", label: "Пилюли" },
              ]}
            />
          </Group>

          <Group label="Кнопки">
            <ChoiceRow
              value={current.button_style}
              onChange={(v) => update("button_style", v)}
              options={[
                { value: "solid", label: "Заливка" },
                { value: "outline", label: "Контур" },
                { value: "gradient", label: "Градиент" },
                { value: "neon", label: "Неон" },
              ]}
            />
          </Group>

          <Group label="Карточки">
            <ChoiceRow
              value={current.card_style}
              onChange={(v) => update("card_style", v)}
              options={[
                { value: "flat", label: "Плоские" },
                { value: "shadow", label: "С тенью" },
                { value: "glass", label: "Стекло" },
                { value: "bordered", label: "Рамка" },
              ]}
            />
          </Group>

          <Group label="Декор фона">
            <ChoiceRow
              value={current.decor}
              onChange={(v) => update("decor", v)}
              options={[
                { value: "none", label: "Нет" },
                { value: "dots", label: "Точки" },
                { value: "grid", label: "Сетка" },
                { value: "noise", label: "Шум" },
                { value: "aurora", label: "Аврора" },
                { value: "sparkles", label: "Искры" },
              ]}
            />
          </Group>

          <Group label="Отступы секций">
            <ChoiceRow
              value={current.section_spacing}
              onChange={(v) => update("section_spacing", v)}
              options={[
                { value: "compact", label: "Компактные" },
                { value: "normal", label: "Обычные" },
                { value: "roomy", label: "Просторные" },
              ]}
            />
          </Group>

          <Group label="Цветовая схема">
            <ChoiceRow
              value={current.scheme}
              onChange={(v) => update("scheme", v)}
              options={[
                { value: "light", label: "Светлая" },
                { value: "dark", label: "Тёмная" },
              ]}
            />
          </Group>

          <Separator />

          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => onChange(defaultLandingTheme)}
          >
            <RotateCcw className="w-4 h-4" />
            Сбросить к стандартной теме
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Separator() {
  return <div className="h-px bg-border" />;
}

function ChoiceRow<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-3 py-1.5 rounded-md text-sm border transition-colors",
            value === opt.value
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-foreground border-border hover:bg-muted",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
