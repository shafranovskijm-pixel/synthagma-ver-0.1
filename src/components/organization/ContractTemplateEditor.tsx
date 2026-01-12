import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  FileText,
  Eye,
  Save,
  Loader2,
  RotateCcw,
  Copy,
  Info,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ContractTemplateEditorProps {
  organizationId: string;
  organizationName: string;
}

const DEFAULT_CONTRACT_TEMPLATE = `ДОГОВОР НА ОКАЗАНИЕ ОБРАЗОВАТЕЛЬНЫХ УСЛУГ

№ {{contract_number}} от {{contract_date}}

{{org_name}}, именуемое в дальнейшем «Исполнитель», в лице {{org_director_position}} {{org_director_name}}, действующего на основании Устава, с одной стороны, и

{{company_name}}, именуемое в дальнейшем «Заказчик», в лице {{company_director}}, действующего на основании Устава, с другой стороны, заключили настоящий Договор о нижеследующем:

1. ПРЕДМЕТ ДОГОВОРА

1.1. Исполнитель обязуется оказать Заказчику образовательные услуги по программе «{{course_title}}»{{course_duration}}, а Заказчик обязуется оплатить эти услуги.

1.2. Количество обучающихся: {{students_count}} чел.

2. СТОИМОСТЬ УСЛУГ И ПОРЯДОК РАСЧЁТОВ

2.1. Стоимость обучения одного слушателя составляет {{price}} рублей.

2.2. Общая стоимость услуг по настоящему Договору составляет {{total_price}} рублей.

2.3. Оплата производится путём перечисления денежных средств на расчётный счёт Исполнителя в течение 5 (пяти) банковских дней с момента подписания настоящего Договора.

3. ПРАВА И ОБЯЗАННОСТИ СТОРОН

3.1. Исполнитель обязуется:
- обеспечить качественное проведение обучения;
- предоставить необходимые учебные материалы;
- выдать документы об обучении установленного образца.

3.2. Заказчик обязуется:
- своевременно оплатить услуги;
- обеспечить явку обучающихся.

4. СРОК ДЕЙСТВИЯ ДОГОВОРА

4.1. Настоящий Договор вступает в силу с момента подписания и действует до полного исполнения сторонами своих обязательств.

{{additional_terms}}

5. РЕКВИЗИТЫ И ПОДПИСИ СТОРОН

ИСПОЛНИТЕЛЬ:
{{org_name}}
ИНН: {{org_inn}}
КПП: {{org_kpp}}
ОГРН: {{org_ogrn}}
Адрес: {{org_address}}
Банк: {{org_bank_name}}
БИК: {{org_bank_bik}}
Р/с: {{org_bank_account}}
К/с: {{org_bank_corr_account}}

{{org_director_position}}
_______________ / {{org_director_name}} /

ЗАКАЗЧИК:
{{company_name}}
ИНН: {{company_inn}}
КПП: {{company_kpp}}
ОГРН: {{company_ogrn}}
Адрес: {{company_address}}

{{company_director}}
_______________ / _________________ /`;

const PLACEHOLDERS = [
  { key: "{{contract_number}}", label: "Номер договора", example: "2026-01-001" },
  { key: "{{contract_date}}", label: "Дата договора", example: "«12» января 2026 г." },
  { key: "{{org_name}}", label: "Название организации", example: "ООО «Учебный центр»" },
  { key: "{{org_director_position}}", label: "Должность руководителя", example: "Генерального директора" },
  { key: "{{org_director_name}}", label: "ФИО руководителя", example: "Иванова И.И." },
  { key: "{{org_inn}}", label: "ИНН организации", example: "7700000000" },
  { key: "{{org_kpp}}", label: "КПП организации", example: "770001001" },
  { key: "{{org_ogrn}}", label: "ОГРН организации", example: "1027700000000" },
  { key: "{{org_address}}", label: "Адрес организации", example: "г. Москва, ул. Примерная, д. 1" },
  { key: "{{org_bank_name}}", label: "Название банка", example: "ПАО Сбербанк" },
  { key: "{{org_bank_bik}}", label: "БИК банка", example: "044525225" },
  { key: "{{org_bank_account}}", label: "Расчётный счёт", example: "40702810000000000000" },
  { key: "{{org_bank_corr_account}}", label: "Корр. счёт", example: "30101810400000000225" },
  { key: "{{company_name}}", label: "Название компании-заказчика", example: "ООО «Заказчик»" },
  { key: "{{company_director}}", label: "Руководитель компании", example: "Генерального директора Петрова П.П." },
  { key: "{{company_inn}}", label: "ИНН компании", example: "7700000001" },
  { key: "{{company_kpp}}", label: "КПП компании", example: "770001002" },
  { key: "{{company_ogrn}}", label: "ОГРН компании", example: "1027700000001" },
  { key: "{{company_address}}", label: "Адрес компании", example: "г. Москва, ул. Заказная, д. 2" },
  { key: "{{course_title}}", label: "Название курса", example: "Охрана труда" },
  { key: "{{course_duration}}", label: "Длительность курса", example: " продолжительностью 40 часов" },
  { key: "{{students_count}}", label: "Количество обучающихся", example: "10" },
  { key: "{{price}}", label: "Цена за 1 человека", example: "5 000,00" },
  { key: "{{total_price}}", label: "Общая сумма", example: "50 000,00" },
  { key: "{{additional_terms}}", label: "Дополнительные условия", example: "" },
];

export function ContractTemplateEditor({
  organizationId,
  organizationName,
}: ContractTemplateEditorProps) {
  const [template, setTemplate] = useState(DEFAULT_CONTRACT_TEMPLATE);
  const [originalTemplate, setOriginalTemplate] = useState(DEFAULT_CONTRACT_TEMPLATE);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [activeTab, setActiveTab] = useState<"edit" | "placeholders">("edit");

  useEffect(() => {
    loadTemplate();
  }, [organizationId]);

  const loadTemplate = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("organizations")
        .select("branding")
        .eq("id", organizationId)
        .single();

      if (error) throw error;

      const branding = data?.branding as Record<string, unknown> | null;
      if (branding?.contractTemplate) {
        setTemplate(branding.contractTemplate as string);
        setOriginalTemplate(branding.contractTemplate as string);
      }
    } catch (error) {
      console.error("Error loading template:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // First get current branding
      const { data: orgData } = await supabase
        .from("organizations")
        .select("branding")
        .eq("id", organizationId)
        .single();

      const currentBranding = (orgData?.branding as Record<string, unknown>) || {};

      const { error } = await supabase
        .from("organizations")
        .update({
          branding: {
            ...currentBranding,
            contractTemplate: template,
          },
        })
        .eq("id", organizationId);

      if (error) throw error;

      setOriginalTemplate(template);
      toast.success("Шаблон договора сохранён");
    } catch (error) {
      console.error("Error saving template:", error);
      toast.error("Ошибка сохранения шаблона");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setTemplate(DEFAULT_CONTRACT_TEMPLATE);
  };

  const insertPlaceholder = (placeholder: string) => {
    const textarea = document.getElementById("contract-template") as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newText = template.substring(0, start) + placeholder + template.substring(end);
      setTemplate(newText);
      // Focus and set cursor position after placeholder
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + placeholder.length, start + placeholder.length);
      }, 0);
    } else {
      setTemplate(template + placeholder);
    }
  };

  const getPreviewText = () => {
    let preview = template;
    PLACEHOLDERS.forEach((p) => {
      preview = preview.split(p.key).join(p.example || "_______________");
    });
    return preview;
  };

  const hasChanges = template !== originalTemplate;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Конструктор шаблона договора</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl gap-2"
            onClick={() => setShowPreview(true)}
          >
            <Eye className="w-4 h-4" />
            Предпросмотр
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl gap-2"
            onClick={handleReset}
          >
            <RotateCcw className="w-4 h-4" />
            Сбросить
          </Button>
          <Button
            size="sm"
            className="rounded-xl gap-2"
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Сохранить
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "edit" | "placeholders")}>
        <TabsList className="grid w-full grid-cols-2 rounded-xl">
          <TabsTrigger value="edit" className="rounded-xl">Редактор</TabsTrigger>
          <TabsTrigger value="placeholders" className="rounded-xl">Переменные</TabsTrigger>
        </TabsList>

        <TabsContent value="edit" className="mt-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="w-4 h-4" />
              <span>Используйте переменные в формате {"{{переменная}}"} для автоподстановки данных</span>
            </div>
            <Textarea
              id="contract-template"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="min-h-[500px] font-mono text-sm rounded-xl"
              placeholder="Введите текст шаблона договора..."
            />
          </div>
        </TabsContent>

        <TabsContent value="placeholders" className="mt-4">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Нажмите на переменную, чтобы вставить её в шаблон
            </p>
            <div className="grid gap-2">
              {PLACEHOLDERS.map((p) => (
                <div
                  key={p.key}
                  className="flex items-center justify-between p-3 bg-secondary/30 rounded-xl hover:bg-secondary/50 cursor-pointer transition-colors"
                  onClick={() => {
                    insertPlaceholder(p.key);
                    setActiveTab("edit");
                  }}
                >
                  <div className="flex-1">
                    <p className="font-medium text-sm">{p.label}</p>
                    <p className="text-xs text-muted-foreground">Пример: {p.example || "(пусто)"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-background px-2 py-1 rounded-lg border">
                      {p.key}
                    </code>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(p.key);
                            toast.success("Скопировано");
                          }}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Копировать</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Предпросмотр договора
            </DialogTitle>
          </DialogHeader>
          <div className="bg-white text-black p-8 rounded-xl border shadow-inner">
            <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed">
              {getPreviewText()}
            </pre>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setShowPreview(false)}
            >
              Закрыть
            </Button>
            <Button
              className="rounded-xl gap-2"
              onClick={() => {
                const printWindow = window.open("", "_blank");
                if (printWindow) {
                  printWindow.document.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                      <title>Предпросмотр договора</title>
                      <style>
                        body { font-family: 'Times New Roman', serif; padding: 2cm; line-height: 1.6; }
                        pre { white-space: pre-wrap; font-family: inherit; }
                      </style>
                    </head>
                    <body>
                      <pre>${getPreviewText()}</pre>
                    </body>
                    </html>
                  `);
                  printWindow.document.close();
                  printWindow.print();
                }
              }}
            >
              <FileText className="w-4 h-4" />
              Печать
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
