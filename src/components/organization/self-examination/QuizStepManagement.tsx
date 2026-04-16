import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { QuizData } from "@/hooks/useSelfExaminationQuiz";

interface Props {
  data: QuizData;
  updateData: (updates: Partial<QuizData>) => void;
}

export function QuizStepManagement({ data, updateData }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>ФИО директора *</Label>
          <Input value={data.directorFio} onChange={(e) => updateData({ directorFio: e.target.value })} placeholder="Иванов Иван Иванович" className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label>Должность</Label>
          <Input value={data.directorPosition} onChange={(e) => updateData({ directorPosition: e.target.value })} placeholder="Директор" className="rounded-xl" />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Срок полномочий (лет)</Label>
        <Select value={data.directorTermYears.toString()} onValueChange={(v) => updateData({ directorTermYears: parseInt(v) })}>
          <SelectTrigger className="rounded-xl w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1 год</SelectItem>
            <SelectItem value="2">2 года</SelectItem>
            <SelectItem value="3">3 года</SelectItem>
            <SelectItem value="5">5 лет</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border-t border-border pt-4 mt-4">
        <div className="flex items-center gap-3 mb-4">
          <Checkbox id="pedagogical-council" checked={data.hasPedagogicalCouncil} onCheckedChange={(checked) => updateData({ hasPedagogicalCouncil: !!checked })} />
          <Label htmlFor="pedagogical-council" className="cursor-pointer font-medium">Педагогический совет</Label>
        </div>
        {data.hasPedagogicalCouncil && (
          <div className="grid grid-cols-2 gap-4 ml-7">
            <div className="space-y-2">
              <Label>Номер протокола</Label>
              <Input value={data.pedagogicalCouncilProtocolNumber} onChange={(e) => updateData({ pedagogicalCouncilProtocolNumber: e.target.value })} placeholder="1" className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label>Дата протокола</Label>
              <Input type="date" value={data.pedagogicalCouncilProtocolDate} onChange={(e) => updateData({ pedagogicalCouncilProtocolDate: e.target.value })} className="rounded-xl" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
