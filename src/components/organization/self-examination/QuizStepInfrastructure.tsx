import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { QuizData } from "@/hooks/useSelfExaminationQuiz";

interface Props {
  data: QuizData;
  updateData: (updates: Partial<QuizData>) => void;
}

export function QuizStepInfrastructure({ data, updateData }: Props) {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <h4 className="font-medium">Материально-техническое обеспечение</h4>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: "hasWebsite" as const, title: "Официальный сайт", desc: "Сайт организации в сети Интернет" },
            { key: "hasDistancePlatform" as const, title: "Платформа ДОТ", desc: "Дистанционные образовательные технологии" },
            { key: "hasMultimedia" as const, title: "Мультимедийное оборудование", desc: "Проекторы, интерактивные доски и т.д." },
            { key: "hasLibrary" as const, title: "Библиотечный фонд", desc: "Учебная и методическая литература" },
          ].map((item) => (
            <label key={item.key} className="flex items-center gap-3 bg-secondary/50 rounded-xl p-4 cursor-pointer">
              <Checkbox checked={data[item.key]} onCheckedChange={(checked) => updateData({ [item.key]: !!checked })} />
              <div>
                <div className="font-medium text-sm">{item.title}</div>
                <div className="text-xs text-muted-foreground">{item.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Дополнительное оборудование</Label>
        <Textarea value={data.additionalEquipment} onChange={(e) => updateData({ additionalEquipment: e.target.value })} placeholder="Опишите дополнительное оборудование, учебные материалы и т.д." className="rounded-xl min-h-[80px]" />
      </div>
    </div>
  );
}
