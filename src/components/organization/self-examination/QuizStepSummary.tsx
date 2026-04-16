import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles } from "lucide-react";
import type { QuizData } from "@/hooks/useSelfExaminationQuiz";

interface Props {
  data: QuizData;
  updateData: (updates: Partial<QuizData>) => void;
}

export function QuizStepSummary({ data, updateData }: Props) {
  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-2xl p-6 border border-primary/20">
        <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          Проверьте данные
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Организация:</span>
            <div className="font-medium">{data.fullName || "Не указано"}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Директор:</span>
            <div className="font-medium">{data.directorFio || "Не указано"}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Период:</span>
            <div className="font-medium">
              {data.periodStart && data.periodEnd
                ? `${new Date(data.periodStart).toLocaleDateString('ru-RU')} — ${new Date(data.periodEnd).toLocaleDateString('ru-RU')}`
                : "Не указан"}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">Программ:</span>
            <div className="font-medium">{data.programs.filter(p => p.name).length}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Обучающихся:</span>
            <div className="font-medium">{data.totalStudents}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Педагогов:</span>
            <div className="font-medium">{data.staff.filter(s => s.fio).length}</div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Дополнительные примечания к отчёту</Label>
        <Textarea value={data.additionalNotes} onChange={(e) => updateData({ additionalNotes: e.target.value })} placeholder="Любые дополнительные сведения для включения в отчёт..." className="rounded-xl min-h-[100px]" />
      </div>

      <div className="bg-secondary/50 rounded-xl p-4 text-sm space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Стоимость услуги:</span>
          <span className="font-bold text-primary text-xl">3 500 ₽</span>
        </div>
        <p className="text-xs text-muted-foreground">
          После отправки заявки с вами свяжется менеджер для подтверждения и оплаты.
          После оплаты отчёт будет сгенерирован автоматически.
        </p>
      </div>
    </div>
  );
}
