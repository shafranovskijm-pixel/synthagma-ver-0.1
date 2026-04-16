import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import type { QuizData, StaffMember } from "@/hooks/useSelfExaminationQuiz";

interface Props {
  data: QuizData;
  addStaffMember: () => void;
  removeStaffMember: (index: number) => void;
  updateStaffMember: (index: number, field: keyof StaffMember, value: string | number) => void;
}

export function QuizStepStaff({ data, addStaffMember, removeStaffMember, updateStaffMember }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Педагогические работники</Label>
        <Button variant="outline" size="sm" onClick={addStaffMember} className="rounded-lg gap-1">
          <Plus className="w-3 h-3" />Добавить
        </Button>
      </div>
      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
        {data.staff.map((member, index) => (
          <div key={index} className="bg-secondary/30 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 grid grid-cols-2 gap-2">
                <Input value={member.fio} onChange={(e) => updateStaffMember(index, 'fio', e.target.value)} placeholder="ФИО" className="rounded-lg" />
                <Input value={member.subject} onChange={(e) => updateStaffMember(index, 'subject', e.target.value)} placeholder="Предмет/дисциплина" className="rounded-lg" />
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeStaffMember(index)} className="flex-shrink-0 text-destructive">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Select value={member.education} onValueChange={(v) => updateStaffMember(index, 'education', v)}>
                <SelectTrigger className="rounded-lg text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Высшее профессиональное">Высшее</SelectItem>
                  <SelectItem value="Среднее профессиональное">Среднее проф.</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" value={member.experienceYears || ''} onChange={(e) => updateStaffMember(index, 'experienceYears', parseInt(e.target.value) || 0)} placeholder="Стаж (лет)" className="rounded-lg" />
              <Select value={member.employmentType} onValueChange={(v) => updateStaffMember(index, 'employmentType', v)}>
                <SelectTrigger className="rounded-lg text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="По договору">По договору</SelectItem>
                  <SelectItem value="В штате">В штате</SelectItem>
                  <SelectItem value="Совместитель">Совместитель</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
