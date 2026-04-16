import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import type { QuizData, Program } from "@/hooks/useSelfExaminationQuiz";

interface Props {
  data: QuizData;
  updateData: (updates: Partial<QuizData>) => void;
  addProgram: () => void;
  removeProgram: (index: number) => void;
  updateProgram: (index: number, field: keyof Program, value: string | number) => void;
}

export function QuizStepEducation({ data, updateData, addProgram, removeProgram, updateProgram }: Props) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Образовательные программы</Label>
          <Button variant="outline" size="sm" onClick={addProgram} className="rounded-lg gap-1">
            <Plus className="w-3 h-3" />Добавить
          </Button>
        </div>
        <div className="space-y-3">
          {data.programs.map((program, index) => (
            <div key={index} className="bg-secondary/30 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <Input value={program.name} onChange={(e) => updateProgram(index, 'name', e.target.value)} placeholder="Название программы" className="rounded-lg" />
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeProgram(index)} className="flex-shrink-0 text-destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select value={program.type} onValueChange={(v) => updateProgram(index, 'type', v)}>
                  <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="повышение квалификации">Повышение квалификации</SelectItem>
                    <SelectItem value="профессиональная переподготовка">Профессиональная переподготовка</SelectItem>
                    <SelectItem value="профессиональное обучение">Профессиональное обучение</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="number" value={program.studentsCount || ''} onChange={(e) => updateProgram(index, 'studentsCount', parseInt(e.target.value) || 0)} placeholder="Кол-во обучающихся" className="rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-border pt-4 mt-4">
        <h4 className="font-medium mb-4">Статистика обучающихся</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Всего обучающихся за период</Label>
            <Input type="number" value={data.totalStudents || ''} onChange={(e) => updateData({ totalStudents: parseInt(e.target.value) || 0 })} placeholder="0" className="rounded-xl" />
          </div>
          <div className="space-y-2">
            <Label>Успешно завершили обучение</Label>
            <Input type="number" value={data.completedStudents || ''} onChange={(e) => updateData({ completedStudents: parseInt(e.target.value) || 0 })} placeholder="0" className="rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
