import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  User,
  Calendar,
  FileText,
  Hash,
  Clock,
  MapPin,
  Phone,
  Mail,
  GraduationCap,
  Briefcase,
  CheckCircle2,
  MessageSquare,
  Award,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  Sparkles,
} from "lucide-react";

import { journalFieldsSchema, type JournalField as TypedJournalField } from '@/lib/customJournals/contract';
import { builtinJournalFields } from '@/lib/customJournals/legacy';

interface JournalField {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
  category: "person" | "document" | "event" | "result";
}

const AVAILABLE_FIELDS: JournalField[] = [
  // Person data
  { id: "full_name", label: "ФИО", icon: User, description: "Полное имя участника", category: "person" },
  { id: "phone", label: "Телефон", icon: Phone, description: "Контактный телефон", category: "person" },
  { id: "email", label: "Email", icon: Mail, description: "Электронная почта", category: "person" },
  { id: "position", label: "Должность", icon: Briefcase, description: "Должность/профессия", category: "person" },
  { id: "organization", label: "Организация", icon: GraduationCap, description: "Место работы/учёбы", category: "person" },
  
  // Document data
  { id: "doc_number", label: "Номер документа", icon: Hash, description: "Регистрационный номер", category: "document" },
  { id: "doc_date", label: "Дата документа", icon: Calendar, description: "Дата создания/выдачи", category: "document" },
  { id: "doc_type", label: "Тип документа", icon: FileText, description: "Вид документа", category: "document" },
  
  // Event data
  { id: "event_date", label: "Дата события", icon: Calendar, description: "Когда произошло", category: "event" },
  { id: "event_time", label: "Время", icon: Clock, description: "Время проведения", category: "event" },
  { id: "location", label: "Место", icon: MapPin, description: "Место проведения", category: "event" },
  { id: "topic", label: "Тема/Название", icon: BookOpen, description: "Тема занятия/мероприятия", category: "event" },
  
  // Result data
  { id: "result", label: "Результат", icon: CheckCircle2, description: "Итог/оценка", category: "result" },
  { id: "grade", label: "Оценка/Балл", icon: Award, description: "Числовая оценка", category: "result" },
  { id: "notes", label: "Примечания", icon: MessageSquare, description: "Дополнительные заметки", category: "result" },
  { id: "signature", label: "Подпись (текст, не ЭП)", icon: User, description: "Подпись ответственного", category: "result" },
];

const CATEGORY_LABELS: Record<string, string> = {
  person: "Данные участника",
  document: "Документы",
  event: "Событие/мероприятие",
  result: "Результаты",
};

interface JournalCreationWizardProps {
  open: boolean;
  onClose: () => void;
  onComplete: (journal: {
    id?: string;
    title: string;
    description: string;
    fields: string[];
    schemaFields: TypedJournalField[];
    reason: string;
  }) => void | Promise<unknown>;
  busy?: boolean;
  error?: string | null;
  canRetry?: boolean;
  onRetry?: () => void;
  editingJournal?: {
    id: string;
    title: string;
    description: string;
    fields: string[];
    schemaFields?: TypedJournalField[];
  } | null;
}

export function JournalCreationWizard({
  open,
  onClose,
  onComplete,
  editingJournal, busy = false, error, canRetry, onRetry,
}: JournalCreationWizardProps) {
  const [step, setStep] = useState(1);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [journalTitle, setJournalTitle] = useState("");
  const [journalDescription, setJournalDescription] = useState("");

  const [fieldDefinitions, setFieldDefinitions] = useState<TypedJournalField[]>([]);
  const [customLabel, setCustomLabel] = useState('');
  const [customType, setCustomType] = useState<TypedJournalField['type']>('text');
  const [customOptions, setCustomOptions] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const getField = (id: string) => { const base = AVAILABLE_FIELDS.find(f => f.id === id); const typed = fieldDefinitions.find(f => f.id === id);
    return typed ? {...typed, icon: base?.icon ?? FileText, description: base?.description ?? 'Пользовательское поле', category: base?.category ?? 'event'} : base; };
  const addCustomField = () => {
    const field: TypedJournalField = {id: crypto.randomUUID(),label:customLabel.trim(),type:customType,semantic:'custom',...(customType==='select'?{options:customOptions.split(',').map(v=>v.trim()).filter(Boolean)}:{})};
    const parsed=journalFieldsSchema.safeParse([...selectedFields.map(id=>fieldDefinitions.find(f=>f.id===id)??builtinJournalFields[id]),field]);
    if(!parsed.success){setValidationError('Проверьте название, тип и варианты поля. Всего можно выбрать до 32 полей.');return;}
    setFieldDefinitions(prev=>[...prev,field]);setSelectedFields(prev=>[...prev,field.id]);setCustomLabel('');setCustomOptions('');setValidationError(null);
  };
  const isEditMode = !!editingJournal;
  const totalSteps = 3;

  // Initialize with editing data when opening
  useEffect(() => {
    if (open && editingJournal) {
      setSelectedFields(editingJournal.fields || []);
      setFieldDefinitions(editingJournal.schemaFields ?? editingJournal.fields.map(id=>builtinJournalFields[id]).filter(Boolean));
      setValidationError(null);
      setJournalTitle(editingJournal.title || "");
      setJournalDescription(editingJournal.description || "");
      setStep(1);
    } else if (!open) {
      setFieldDefinitions([]); setCustomLabel(''); setCustomOptions(''); setValidationError(null); setChangeReason('');
      // Reset when closing
      setStep(1);
      setSelectedFields([]);
      setJournalTitle("");
      setJournalDescription("");
    }
  }, [open, editingJournal]);

  const toggleField = (fieldId: string) => {
    setSelectedFields((prev) =>
      prev.includes(fieldId)
        ? prev.filter((id) => id !== fieldId)
        : [...prev, fieldId]
    );
  };

  const handleNext = () => {
    if (step === 1 && selectedFields.length === 0) {
      return;
    }
    if (step < totalSteps) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleComplete = async () => {
    if (busy || !journalTitle.trim()) return;
    if(isEditMode&&!changeReason.trim()){setValidationError('Укажите причину изменения схемы.');return;}
    const parsed=journalFieldsSchema.safeParse(selectedFields.map(id=>fieldDefinitions.find(f=>f.id===id)??builtinJournalFields[id]));
    if(!parsed.success){setValidationError('Структура журнала не подтверждена. Проверьте поля.');return;}
    try { await onComplete({id:editingJournal?.id,title:journalTitle.trim(),description:journalDescription.trim()||generateDescription(),fields:selectedFields,schemaFields:parsed.data,reason:changeReason.trim()}); }
    catch { /* Parent retains values and displays a normalized server error. */ }
  };

  const generateDescription = () => {
    const fieldLabels = selectedFields
      .map((id) => getField(id)?.label)
      .filter(Boolean)
      .slice(0, 3);
    
    return `Учёт: ${fieldLabels.join(", ")}${selectedFields.length > 3 ? " и др." : ""}`;
  };

  const handleClose = () => {
    if (busy) return;
    setStep(1);
    setSelectedFields([]);
    setJournalTitle("");
    setJournalDescription("");
    onClose();
  };

  const groupedFields = AVAILABLE_FIELDS.reduce((acc, field) => {
    if (!acc[field.category]) {
      acc[field.category] = [];
    }
    acc[field.category].push(field);
    return acc;
  }, {} as Record<string, JournalField[]>);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            {isEditMode ? "Редактирование журнала" : "Создание журнала"}
          </DialogTitle>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center flex-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  s === step
                    ? "bg-primary text-primary-foreground"
                    : s < step
                    ? "bg-primary/20 text-primary"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {s < step ? <CheckCircle2 className="w-4 h-4" /> : s}
              </div>
              {s < 3 && (
                <div
                  className={`flex-1 h-1 mx-2 rounded ${
                    s < step ? "bg-primary/50" : "bg-secondary"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Select fields */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">
                Какие данные вы планируете записывать?
              </h3>
              <p className="text-sm text-muted-foreground">
                Выберите поля, которые будут в вашем журнале. Можно выбрать несколько.
              </p>
            </div>

            <div className="space-y-6">
              {Object.entries(groupedFields).map(([category, fields]) => (
                <div key={category}>
                  <h4 className="text-sm font-medium text-muted-foreground mb-3">
                    {CATEGORY_LABELS[category]}
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {fields.map((field) => {
                      const Icon = field.icon;
                      const isSelected = selectedFields.includes(field.id);
                      return (
                        <div
                          key={field.id}
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50 hover:bg-secondary/50"
                          }`}
                          onClick={() => toggleField(field.id)}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleField(field.id)}
                          />
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              isSelected ? "bg-primary/10" : "bg-secondary"
                            }`}
                          >
                            <Icon
                              className={`w-4 h-4 ${
                                isSelected ? "text-primary" : "text-muted-foreground"
                              }`}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{field.label}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {field.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3 border border-border rounded-xl p-3">
              <p className="text-sm font-medium">Своё поле</p>
              <Input aria-label="Название нового поля" value={customLabel} onChange={e=>setCustomLabel(e.target.value)} maxLength={120} className="rounded-xl" />
              <select aria-label="Тип нового поля" value={customType} onChange={e=>setCustomType(e.target.value as TypedJournalField['type'])} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm">
                <option value="text">Текст</option><option value="long_text">Длинный текст</option><option value="date">Дата</option><option value="time">Время</option><option value="decimal">Число</option><option value="integer">Целое число</option><option value="boolean">Да / нет</option><option value="select">Выбор из списка</option>
              </select>
              {customType==='select'&&<Input aria-label="Варианты нового поля через запятую" value={customOptions} onChange={e=>setCustomOptions(e.target.value)} className="rounded-xl" />}
              <Button type="button" variant="outline" className="rounded-xl" onClick={addCustomField} disabled={busy||selectedFields.length>=32}>Добавить поле</Button>
              {fieldDefinitions.filter(f=>f.semantic==='custom').map(f=><div key={f.id} className="flex items-center gap-2 text-sm"><Checkbox checked={selectedFields.includes(f.id)} onCheckedChange={()=>toggleField(f.id)} /><span>{f.label}</span></div>)}
            </div>
            {selectedFields.length > 0 && (
              <div className="bg-primary/5 rounded-xl p-3 border border-primary/20">
                <p className="text-sm">
                  <span className="font-medium">Выбрано полей:</span>{" "}
                  {selectedFields.length}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Preview and customize */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">
                Предпросмотр структуры журнала
              </h3>
              <p className="text-sm text-muted-foreground">
                Так будут выглядеть колонки вашего журнала
              </p>
            </div>

            <div className="bg-secondary/30 rounded-xl p-4 overflow-x-auto">
              <div className="flex gap-2 min-w-max">
                <div className="bg-muted rounded-lg px-3 py-2 text-sm font-medium">
                  №
                </div>
                {selectedFields.map((fieldId) => {
                  const field = getField(fieldId);
                  if (!field) return null;
                  const Icon = field.icon;
                  return (
                    <div
                      key={fieldId}
                      className="bg-card border border-border rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2"
                    >
                      <Icon className="w-4 h-4 text-primary" />
                      {field.label}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border border-dashed border-border rounded-xl p-4">
              <p className="text-sm text-muted-foreground text-center">
                Пример записи будет отображаться здесь
              </p>
            </div>
          </div>
        )}

        {step===2&&<div className="space-y-3">{selectedFields.map(id=>{const field=fieldDefinitions.find(f=>f.id===id)??builtinJournalFields[id];return field&&<div key={id} className="space-y-1"><label className="text-sm text-muted-foreground">Название колонки</label><Input aria-label={'Название поля '+id} value={field.label} maxLength={120} className="rounded-xl" onChange={e=>{const label=e.target.value;setFieldDefinitions(prev=>[...prev.filter(f=>f.id!==id),{...field,label}]);}} /></div>;})}</div>}
        {/* Step 3: Name and description */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">
                Название и описание журнала
              </h3>
              <p className="text-sm text-muted-foreground">
                Придумайте понятное название для вашего журнала
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Название журнала *</label>
                <Input
                  placeholder="Например: Журнал учёта консультаций"
                  value={journalTitle}
                  onChange={(e) => setJournalTitle(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Описание</label>
                <Input
                  placeholder={generateDescription() || "Краткое описание назначения журнала"}
                  value={journalDescription}
                  onChange={(e) => setJournalDescription(e.target.value)}
                  className="rounded-xl"
                />
                <p className="text-xs text-muted-foreground">
                  Если оставить пустым, описание будет сгенерировано автоматически
                </p>
              </div>
            </div>

            {isEditMode&&<Input aria-label="Причина изменения схемы" className="rounded-xl" value={changeReason} maxLength={1000} onChange={e=>setChangeReason(e.target.value)} placeholder="Причина изменения схемы" />}
            <div className="bg-secondary/30 rounded-xl p-4">
              <h4 className="text-sm font-medium mb-2">Выбранные поля:</h4>
              <div className="flex flex-wrap gap-2">
                {selectedFields.map((fieldId) => {
                  const field = getField(fieldId);
                  if (!field) return null;
                  return (
                    <span
                      key={fieldId}
                      className="bg-primary/10 text-primary text-xs px-2 py-1 rounded-lg"
                    >
                      {field.label}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {(validationError||error)&&<p role="alert" className="text-sm text-destructive">{validationError||error}</p>}
        {canRetry&&<Button type="button" variant="outline" onClick={onRetry} disabled={busy} className="rounded-xl">Повторить тот же запрос</Button>}
        {/* Navigation buttons */}
        <div className="flex justify-between pt-4 border-t border-border">
          <Button
            variant="outline"
            onClick={step === 1 ? handleClose : handleBack}
            className="rounded-xl"
          >
            {step === 1 ? (
              "Отмена"
            ) : (
              <>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Назад
              </>
            )}
          </Button>

          {step < totalSteps ? (
            <Button
              onClick={handleNext}
              disabled={busy || (step === 1 && selectedFields.length === 0)}
              className="rounded-xl"
            >
              Далее
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleComplete}
              disabled={busy || canRetry || !journalTitle.trim() || (isEditMode&&!changeReason.trim())}
              className="rounded-xl"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {isEditMode ? "Сохранить изменения" : "Создать журнал"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
