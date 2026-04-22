import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FilePlus, Sparkles } from "lucide-react";
import { useProposalPresets, PROPOSAL_PRESET_CATEGORIES, type ProposalPreset } from "@/hooks/useProposalPresets";

interface Props {
  open: boolean;
  organizationId: string;
  onClose: () => void;
  onPick: (preset: ProposalPreset | null) => void;
}

const CATEGORY_LABEL = Object.fromEntries(PROPOSAL_PRESET_CATEGORIES.map(c => [c.value, c.label]));

const CATEGORY_GRADIENT: Record<string, string> = {
  course_promo: "from-pink-500/20 to-rose-500/20 border-pink-500/30",
  corporate: "from-indigo-500/20 to-violet-500/20 border-indigo-500/30",
  webinar: "from-amber-500/20 to-orange-500/20 border-amber-500/30",
  consulting: "from-emerald-500/20 to-teal-500/20 border-emerald-500/30",
  subscription: "from-violet-500/20 to-purple-500/20 border-violet-500/30",
  custom: "from-slate-500/20 to-gray-500/20 border-slate-500/30",
};

export function ProposalPresetPicker({ open, organizationId, onClose, onPick }: Props) {
  const { presets, loading } = useProposalPresets(organizationId);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Выберите шаблон коммерческого предложения
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <button
            onClick={() => onPick(null)}
            className="w-full p-4 border-2 border-dashed border-border rounded-lg hover:border-primary hover:bg-primary/5 transition flex items-center gap-3 text-left"
          >
            <FilePlus className="w-5 h-5 text-muted-foreground" />
            <div>
              <div className="font-semibold">Пустое КП</div>
              <div className="text-xs text-muted-foreground">Начать с чистого листа</div>
            </div>
          </button>

          {loading && <p className="text-sm text-muted-foreground text-center py-4">Загрузка шаблонов...</p>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {presets.map(p => {
              const grad = CATEGORY_GRADIENT[p.category] || CATEGORY_GRADIENT.custom;
              const sum = (p.default_services || []).reduce((s, it) => s + (it.price || 0) * (it.quantity || 1), 0);
              const discounted = Math.round(sum * (1 - (p.default_discount_percent || 0) / 100));
              return (
                <Card
                  key={p.id}
                  className={`bg-gradient-to-br ${grad} border-2 cursor-pointer hover:scale-[1.02] transition`}
                  onClick={() => onPick(p)}
                >
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-xs">{CATEGORY_LABEL[p.category] || p.category}</Badge>
                      {p.scope === "platform" && <Badge variant="outline" className="text-[10px]">Шаблон</Badge>}
                    </div>
                    <h4 className="font-semibold leading-tight">{p.name}</h4>
                    {p.description && <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>}
                    <div className="flex items-center justify-between pt-2 border-t border-border/50">
                      <span className="text-xs text-muted-foreground">
                        {(p.default_services || []).length} услуг
                        {p.default_discount_percent > 0 && ` · −${p.default_discount_percent}%`}
                      </span>
                      <span className="font-bold text-sm">
                        от {discounted.toLocaleString("ru-RU")} ₽
                      </span>
                    </div>
                    <Button size="sm" className="w-full mt-1" variant="default">Выбрать шаблон</Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
