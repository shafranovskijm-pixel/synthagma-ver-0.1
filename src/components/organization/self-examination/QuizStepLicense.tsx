import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import type { QuizData } from "@/hooks/useSelfExaminationQuiz";

interface Props {
  data: QuizData;
  updateData: (updates: Partial<QuizData>) => void;
  toggleProgramType: (type: string) => void;
  addCommissionMember: () => void;
  removeCommissionMember: (index: number) => void;
  updateCommissionMember: (index: number, field: "fio" | "position", value: string) => void;
}

export function QuizStepLicense({ data, updateData, toggleProgramType, addCommissionMember, removeCommissionMember, updateCommissionMember }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Номер лицензии</Label>
          <Input value={data.licenseNumber} onChange={(e) => updateData({ licenseNumber: e.target.value })} placeholder="Л035-12345-67/00123456" className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label>Дата лицензии</Label>
          <Input type="date" value={data.licenseDate} onChange={(e) => updateData({ licenseDate: e.target.value })} className="rounded-xl" />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Виды программ (в приложении к лицензии)</Label>
        <div className="flex flex-wrap gap-2">
          {["дополнительное профессиональное образование", "профессиональное обучение"].map((type) => (
            <label key={type} className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2 cursor-pointer">
              <Checkbox checked={data.programTypes.includes(type)} onCheckedChange={() => toggleProgramType(type)} />
              <span className="text-sm">{type}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="border-t border-border pt-4 mt-4">
        <h4 className="font-medium mb-4">Период самообследования</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Дата начала *</Label>
            <Input type="date" value={data.periodStart} onChange={(e) => updateData({ periodStart: e.target.value })} className="rounded-xl" />
          </div>
          <div className="space-y-2">
            <Label>Дата окончания *</Label>
            <Input type="date" value={data.periodEnd} onChange={(e) => updateData({ periodEnd: e.target.value })} className="rounded-xl" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="space-y-2">
            <Label>Номер приказа</Label>
            <Input value={data.orderNumber} onChange={(e) => updateData({ orderNumber: e.target.value })} placeholder="2024-СО-01" className="rounded-xl" />
          </div>
          <div className="space-y-2">
            <Label>Дата приказа</Label>
            <Input type="date" value={data.orderDate} onChange={(e) => updateData({ orderDate: e.target.value })} className="rounded-xl" />
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-4 mt-4">
        <h4 className="font-medium mb-4">Состав комиссии</h4>
        <div className="space-y-4">
          <div className="bg-primary/5 rounded-xl p-4">
            <Label className="text-xs text-muted-foreground">Председатель комиссии</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Input value={data.commissionChairman.fio} onChange={(e) => updateData({ commissionChairman: { ...data.commissionChairman, fio: e.target.value } })} placeholder="ФИО" className="rounded-lg" />
              <Input value={data.commissionChairman.position} onChange={(e) => updateData({ commissionChairman: { ...data.commissionChairman, position: e.target.value } })} placeholder="Должность" className="rounded-lg" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Члены комиссии</Label>
            {data.commissionMembers.map((member, index) => (
              <div key={index} className="flex gap-2">
                <Input value={member.fio} onChange={(e) => updateCommissionMember(index, 'fio', e.target.value)} placeholder="ФИО" className="rounded-lg flex-1" />
                <Input value={member.position} onChange={(e) => updateCommissionMember(index, 'position', e.target.value)} placeholder="Должность" className="rounded-lg flex-1" />
                <Button variant="ghost" size="icon" onClick={() => removeCommissionMember(index)} className="flex-shrink-0 text-destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addCommissionMember} className="rounded-lg gap-1">
              <Plus className="w-3 h-3" />
              Добавить члена
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
