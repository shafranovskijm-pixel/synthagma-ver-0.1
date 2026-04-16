import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, CheckCircle } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import type { QuizData } from "@/hooks/useSelfExaminationQuiz";

interface Props {
  data: QuizData;
  updateData: (updates: Partial<QuizData>) => void;
  isLoadingInn: boolean;
  innLoaded: boolean;
  onInnLoad: () => void;
  setInnLoaded: (v: boolean) => void;
}

export function QuizStepOrganization({ data, updateData, isLoadingInn, innLoaded, onInnLoad, setInnLoaded }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-2">
          <Label>Полное наименование организации *</Label>
          <Input value={data.fullName} onChange={(e) => updateData({ fullName: e.target.value })} placeholder="ООО «Название»" className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label>Сокращённое наименование</Label>
          <Input value={data.shortName} onChange={(e) => updateData({ shortName: e.target.value })} placeholder="ООО «Название»" className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label>Организационно-правовая форма</Label>
          <Select value={data.legalForm} onValueChange={(v) => updateData({ legalForm: v })}>
            <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Общество с ограниченной ответственностью">ООО</SelectItem>
              <SelectItem value="Акционерное общество">АО</SelectItem>
              <SelectItem value="Индивидуальный предприниматель">ИП</SelectItem>
              <SelectItem value="Автономная некоммерческая организация">АНО</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Юридический адрес *</Label>
        <Input value={data.legalAddress} onChange={(e) => updateData({ legalAddress: e.target.value })} placeholder="123456, г. Москва, ул. Примерная, д. 1" className="rounded-xl" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Телефон</Label>
          <Input value={data.phone} onChange={(e) => updateData({ phone: e.target.value })} placeholder="+7 (XXX) XXX-XX-XX" className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label>Email *</Label>
          <Input type="email" value={data.email} onChange={(e) => updateData({ email: e.target.value })} placeholder="info@example.ru" className="rounded-xl" />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Адрес сайта</Label>
        <Input value={data.website} onChange={(e) => updateData({ website: e.target.value })} placeholder="https://example.ru" className="rounded-xl" />
      </div>

      {/* INN с автоподгрузкой */}
      <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Search className="h-4 w-4" />
          <span>Автозаполнение по ИНН</span>
          {innLoaded && (
            <span className="flex items-center gap-1 text-green-600 ml-auto">
              <CheckCircle className="h-4 w-4" />
              Загружено
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              value={data.inn}
              onChange={(e) => { updateData({ inn: e.target.value }); setInnLoaded(false); }}
              placeholder="Введите ИНН организации"
              className="rounded-xl"
            />
          </div>
          <Button type="button" variant="default" onClick={onInnLoad} disabled={isLoadingInn || !data.inn || data.inn.length < 10} className="rounded-xl">
            {isLoadingInn ? <SigmaSpinner size="sm" /> : <><Search className="h-4 w-4 mr-2" />Найти</>}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Введите ИНН и нажмите «Найти» для автоматического заполнения реквизитов</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>ОГРН</Label>
          <Input value={data.ogrn} onChange={(e) => updateData({ ogrn: e.target.value })} placeholder="1234567890123" className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label>ИНН</Label>
          <Input value={data.inn} onChange={(e) => updateData({ inn: e.target.value })} placeholder="1234567890" className="rounded-xl" disabled />
        </div>
        <div className="space-y-2">
          <Label>КПП</Label>
          <Input value={data.kpp} onChange={(e) => updateData({ kpp: e.target.value })} placeholder="123456789" className="rounded-xl" />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Учредители (через запятую)</Label>
        <Textarea value={data.founders} onChange={(e) => updateData({ founders: e.target.value })} placeholder="Иванов И.И., Петров П.П." className="rounded-xl min-h-[60px]" />
      </div>
    </div>
  );
}
