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
            <div key={item.key} className="flex items-center gap-3 bg-secondary/50 rounded-xl p-4 cursor-pointer">
              <Checkbox id={item.key} checked={data[item.key] ?? "indeterminate"} onCheckedChange={(checked) => updateData({ [item.key]: checked === "indeterminate" ? null : checked })} />
              <div>
                <Label htmlFor={item.key} className="font-medium text-sm cursor-pointer">{item.title}</Label>
                <div className="text-xs text-muted-foreground">{item.desc}</div>
                {data[item.key] === null ? <span className="text-xs text-muted-foreground">Не заполнено</span> : <button type="button" className="text-xs text-muted-foreground underline" onClick={() => updateData({ [item.key]: null })}>Неизвестно</button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Дополнительное оборудование</Label>{data.hasEmployerParticipation === null ? <span className="text-xs text-muted-foreground">Не заполнено</span> : <button type="button" className="text-xs text-muted-foreground underline" onClick={() => updateData({ hasEmployerParticipation: null })}>Неизвестно</button>}{data.hasPedagogicalCouncil === null ? <span className="text-xs text-muted-foreground">Не заполнено</span> : <button type="button" className="text-xs text-muted-foreground underline" onClick={() => updateData({ hasPedagogicalCouncil: null })}>Неизвестно</button>}
        <Textarea value={data.additionalEquipment} onChange={(e) => updateData({ additionalEquipment: e.target.value })} placeholder="Опишите дополнительное оборудование, учебные материалы и т.д." className="rounded-xl min-h-[80px]" />
      </div>
    </div>
  );
}
