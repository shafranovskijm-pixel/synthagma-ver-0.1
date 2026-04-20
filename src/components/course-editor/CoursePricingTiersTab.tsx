import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Tag, Star } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useCoursePageSettings } from "@/hooks/useCoursePageSettings";

interface Props {
  s: ReturnType<typeof useCoursePageSettings>;
}

export function CoursePricingTiersTab({ s }: Props) {
  const tiers = s.landingContent.pricing?.tiers || [];
  const title = s.landingContent.pricing?.title || "Выберите подходящий тариф";

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-lg bg-muted/50 border border-border/50 p-3">
        <Tag className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          Создайте несколько ценовых пакетов — они автоматически появятся на публичной странице курса.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Заголовок секции тарифов</Label>
        <Input
          value={title}
          onChange={(e) => s.updatePricingTitle(e.target.value)}
          placeholder="Выберите подходящий тариф"
        />
      </div>

      {tiers.length === 0 ? (
        <div className="flex flex-col items-center text-center py-10 px-4 rounded-lg border border-dashed border-border">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-3">
            <Tag className="w-6 h-6 text-primary" />
          </div>
          <h4 className="text-sm font-semibold mb-1.5">Тарифы пока не созданы</h4>
          <p className="text-xs text-muted-foreground max-w-sm mb-4">
            Создайте первый тариф — он автоматически появится на странице курса /c/{s.slug}.
          </p>
          <Button onClick={s.addTier} size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            Создать первый тариф
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {tiers.map((tier, i) => (
            <div
              key={i}
              className={`relative p-4 rounded-xl border-2 ${tier.is_popular ? "border-primary bg-primary/5" : "border-border bg-card"}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Название тарифа</Label>
                      <Input
                        value={tier.name}
                        onChange={(e) => s.updateTier(i, "name", e.target.value)}
                        placeholder="Базовый"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Цена (₽)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={tier.price}
                        onChange={(e) => s.updateTier(i, "price", Number(e.target.value) || 0)}
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={tier.is_popular}
                      onCheckedChange={(v) => s.updateTier(i, "is_popular", !!v)}
                    />
                    <Star className="w-3.5 h-3.5 text-primary" />
                    <span>Отметить как «Популярный»</span>
                  </label>

                  <div className="space-y-2">
                    <Label className="text-xs">Что входит</Label>
                    <div className="space-y-1.5">
                      {tier.features.map((feature, fi) => (
                        <div key={fi} className="flex items-center gap-2">
                          <Input
                            value={feature}
                            onChange={(e) => s.updateTierFeature(i, fi, e.target.value)}
                            placeholder="Пункт списка"
                            className="h-9"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            onClick={() => s.removeTierFeature(i, fi)}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => s.addTierFeature(i)}
                        className="gap-1.5 h-8"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Добавить пункт
                      </Button>
                    </div>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => s.removeTier(i)}
                  title="Удалить тариф"
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}

          {tiers.length < 4 && (
            <Button variant="outline" onClick={s.addTier} className="w-full gap-2">
              <Plus className="w-4 h-4" />
              Добавить тариф ({tiers.length}/4)
            </Button>
          )}
        </div>
      )}

      <Button onClick={s.handleSave} disabled={s.saving} className="w-full gap-2">
        {s.saving && <SigmaSpinner size="sm" />}
        Сохранить тарифы
      </Button>
    </div>
  );
}
