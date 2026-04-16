import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { QuizData } from "@/hooks/useSelfExaminationQuiz";

interface Props {
  data: QuizData;
  updateData: (updates: Partial<QuizData>) => void;
  toggleControlType: (type: string) => void;
}

export function QuizStepQuality({ data, updateData, toggleControlType }: Props) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Виды контроля</Label>
        <div className="grid grid-cols-2 gap-2">
          {["входной", "текущий", "промежуточный", "итоговый"].map((type) => (
            <label key={type} className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2 cursor-pointer">
              <Checkbox checked={data.controlTypes.includes(type)} onCheckedChange={() => toggleControlType(type)} />
              <span className="text-sm capitalize">{type}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="border-t border-border pt-4 mt-4">
        <h4 className="font-medium mb-4">Платформа тестирования</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Название платформы</Label>
            <Input value={data.testingPlatformName} onChange={(e) => updateData({ testingPlatformName: e.target.value })} placeholder="Образовательная платформа" className="rounded-xl" />
          </div>
          <div className="space-y-2">
            <Label>URL платформы</Label>
            <Input value={data.testingPlatformUrl} onChange={(e) => updateData({ testingPlatformUrl: e.target.value })} placeholder="https://platform.example.ru" className="rounded-xl" />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Форма итоговой аттестации</Label>
        <Select value={data.finalAttestationForm} onValueChange={(v) => updateData({ finalAttestationForm: v })}>
          <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="квалификационный экзамен">Квалификационный экзамен</SelectItem>
            <SelectItem value="итоговое тестирование">Итоговое тестирование</SelectItem>
            <SelectItem value="защита проекта">Защита проекта</SelectItem>
            <SelectItem value="комплексный экзамен">Комплексный экзамен</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3">
        <Checkbox id="employer-participation" checked={data.hasEmployerParticipation} onCheckedChange={(checked) => updateData({ hasEmployerParticipation: !!checked })} />
        <Label htmlFor="employer-participation" className="cursor-pointer">Участие работодателей в оценке качества образования</Label>
      </div>
    </div>
  );
}
