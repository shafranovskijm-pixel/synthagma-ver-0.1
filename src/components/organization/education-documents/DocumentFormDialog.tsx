import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar as CalendarIcon, Hash, User, GraduationCap, Award } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { DOCUMENT_TYPES, DELIVERY_METHODS } from "@/hooks/useEducationDocumentsJournal";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface DocumentFormDialogProps {
  open: boolean;
  onClose: () => void;
  isEditing: boolean;
  formData: any;
  setFormData: (fn: (prev: any) => any) => void;
  saving: boolean;
  onSave: () => void;
  onGenerateRegNumber: () => void;
}

export function DocumentFormDialog({
  open, onClose, isEditing, formData, setFormData, saving, onSave, onGenerateRegNumber
}: DocumentFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Редактирование записи" : "Добавление записи в журнал"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {/* Registration Number */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Регистрационный номер *</Label>
              <div className="flex gap-2">
                <Input value={formData.reg_number} onChange={(e) => setFormData((prev: any) => ({ ...prev, reg_number: e.target.value }))} placeholder="ДОК-2025/0001" className="rounded-xl" />
                <Button type="button" variant="outline" onClick={onGenerateRegNumber} className="rounded-xl shrink-0"><Hash className="w-4 h-4 mr-1" />Генерировать</Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Дата выдачи документа *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal rounded-xl", !formData.issue_date && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.issue_date ? format(formData.issue_date, "dd MMMM yyyy", { locale: ru }) : "Выберите дату"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={formData.issue_date} onSelect={(date) => setFormData((prev: any) => ({ ...prev, issue_date: date || new Date() }))} locale={ru} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Graduate Info */}
          <div className="space-y-4">
            <h4 className="font-medium flex items-center gap-2"><User className="w-4 h-4" />Данные выпускника</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>ФИО выпускника (как в паспорте) *</Label>
                <Input value={formData.full_name} onChange={(e) => setFormData((prev: any) => ({ ...prev, full_name: e.target.value }))} placeholder="Иванов Иван Иванович" className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>Дата рождения</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal rounded-xl", !formData.birth_date && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.birth_date ? format(formData.birth_date, "dd MMMM yyyy", { locale: ru }) : "Выберите дату"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={formData.birth_date || undefined} onSelect={(date) => setFormData((prev: any) => ({ ...prev, birth_date: date || null }))} locale={ru} captionLayout="dropdown-buttons" fromYear={1940} toYear={new Date().getFullYear()} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          {/* Document Info */}
          <div className="space-y-4">
            <h4 className="font-medium flex items-center gap-2"><Award className="w-4 h-4" />Данные документа</h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Тип документа *</Label>
                <Select value={formData.document_type} onValueChange={(value) => setFormData((prev: any) => ({ ...prev, document_type: value as any }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{DOCUMENT_TYPES.map((type) => (<SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Серия документа</Label>
                <Input value={formData.document_series} onChange={(e) => setFormData((prev: any) => ({ ...prev, document_series: e.target.value }))} placeholder="ПП" className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>Номер документа *</Label>
                <Input value={formData.document_number} onChange={(e) => setFormData((prev: any) => ({ ...prev, document_number: e.target.value }))} placeholder="0000001" className="rounded-xl" />
              </div>
            </div>
          </div>

          {/* Education Info */}
          <div className="space-y-4">
            <h4 className="font-medium flex items-center gap-2"><GraduationCap className="w-4 h-4" />Сведения об образовании</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Наименование специальности / направления подготовки / профессии *</Label>
                <Textarea value={formData.specialty_name} onChange={(e) => setFormData((prev: any) => ({ ...prev, specialty_name: e.target.value }))} placeholder="Охрана труда" className="rounded-xl min-h-[80px]" />
              </div>
              <div className="space-y-2">
                <Label>Присвоенная квалификация</Label>
                <Textarea value={formData.qualification_name} onChange={(e) => setFormData((prev: any) => ({ ...prev, qualification_name: e.target.value }))} placeholder="Специалист по охране труда" className="rounded-xl min-h-[80px]" />
              </div>
            </div>
          </div>

          {/* Protocol & Order */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Номер протокола ГЭК</Label>
              <Input value={formData.protocol_number} onChange={(e) => setFormData((prev: any) => ({ ...prev, protocol_number: e.target.value }))} placeholder="№ 1" className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label>Дата протокола</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal rounded-xl", !formData.protocol_date && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.protocol_date ? format(formData.protocol_date, "dd MMMM yyyy", { locale: ru }) : "Выберите дату"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={formData.protocol_date || undefined} onSelect={(date) => setFormData((prev: any) => ({ ...prev, protocol_date: date || null }))} locale={ru} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Номер приказа об отчислении</Label>
              <Input value={formData.order_number} onChange={(e) => setFormData((prev: any) => ({ ...prev, order_number: e.target.value }))} placeholder="ПР-001" className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label>Дата приказа</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal rounded-xl", !formData.order_date && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.order_date ? format(formData.order_date, "dd MMMM yyyy", { locale: ru }) : "Выберите дату"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={formData.order_date || undefined} onSelect={(date) => setFormData((prev: any) => ({ ...prev, order_date: date || null }))} locale={ru} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Document Status */}
          <div className="space-y-3">
            <Label>Статус документа</Label>
            <RadioGroup value={formData.document_status} onValueChange={(value) => setFormData((prev: any) => ({ ...prev, document_status: value as "original" | "duplicate" }))} className="flex gap-4">
              <div className="flex items-center space-x-2"><RadioGroupItem value="original" id="original" /><Label htmlFor="original">Оригинал</Label></div>
              <div className="flex items-center space-x-2"><RadioGroupItem value="duplicate" id="duplicate" /><Label htmlFor="duplicate">Дубликат</Label></div>
            </RadioGroup>
            {formData.document_status === "duplicate" && (
              <div className="space-y-2">
                <Label>Данные оригинала документа</Label>
                <Textarea value={formData.original_document_data} onChange={(e) => setFormData((prev: any) => ({ ...prev, original_document_data: e.target.value }))} placeholder="Серия, номер и дата выдачи оригинала" className="rounded-xl" />
              </div>
            )}
          </div>

          {/* Delivery */}
          <div className="space-y-3">
            <Label>Способ получения документа</Label>
            <Select value={formData.delivery_method} onValueChange={(value) => setFormData((prev: any) => ({ ...prev, delivery_method: value as any }))}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>{DELIVERY_METHODS.map((m) => (<SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>))}</SelectContent>
            </Select>
            {formData.delivery_method !== "personal" && (
              <div className="space-y-2">
                <Label>{formData.delivery_method === "representative" ? "Данные представителя (ФИО, доверенность)" : "Почтовый адрес и номер отправления"}</Label>
                <Textarea value={formData.delivery_details} onChange={(e) => setFormData((prev: any) => ({ ...prev, delivery_details: e.target.value }))} className="rounded-xl" />
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Примечания</Label>
            <Textarea value={formData.notes} onChange={(e) => setFormData((prev: any) => ({ ...prev, notes: e.target.value }))} placeholder="Дополнительные сведения..." className="rounded-xl" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-xl">Отмена</Button>
          <Button onClick={onSave} disabled={saving} className="rounded-xl">
            {saving && <SigmaSpinner size="sm" className="mr-2" />}
            {isEditing ? "Сохранить" : "Добавить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
