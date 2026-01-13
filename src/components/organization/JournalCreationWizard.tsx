import { useState } from "react";
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
  { id: "signature", label: "Подпись", icon: User, description: "Подпись ответственного", category: "result" },
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
    title: string;
    description: string;
    fields: string[];
  }) => void;
}

export function JournalCreationWizard({
  open,
  onClose,
  onComplete,
}: JournalCreationWizardProps) {
  const [step, setStep] = useState(1);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [journalTitle, setJournalTitle] = useState("");
  const [journalDescription, setJournalDescription] = useState("");

  const totalSteps = 3;

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

  const handleComplete = () => {
    if (!journalTitle.trim()) return;
    
    onComplete({
      title: journalTitle.trim(),
      description: journalDescription.trim() || generateDescription(),
      fields: selectedFields,
    });

    // Reset state
    setStep(1);
    setSelectedFields([]);
    setJournalTitle("");
    setJournalDescription("");
  };

  const generateDescription = () => {
    const fieldLabels = selectedFields
      .map((id) => AVAILABLE_FIELDS.find((f) => f.id === id)?.label)
      .filter(Boolean)
      .slice(0, 3);
    
    return `Учёт: ${fieldLabels.join(", ")}${selectedFields.length > 3 ? " и др." : ""}`;
  };

  const handleClose = () => {
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
            Создание журнала
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
                  const field = AVAILABLE_FIELDS.find((f) => f.id === fieldId);
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

            <div className="bg-secondary/30 rounded-xl p-4">
              <h4 className="text-sm font-medium mb-2">Выбранные поля:</h4>
              <div className="flex flex-wrap gap-2">
                {selectedFields.map((fieldId) => {
                  const field = AVAILABLE_FIELDS.find((f) => f.id === fieldId);
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
              disabled={step === 1 && selectedFields.length === 0}
              className="rounded-xl"
            >
              Далее
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleComplete}
              disabled={!journalTitle.trim()}
              className="rounded-xl"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Создать журнал
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
