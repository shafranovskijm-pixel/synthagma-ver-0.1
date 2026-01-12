import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  FileText,
  Eye,
  Save,
  Loader2,
  RotateCcw,
  Upload,
  Sparkles,
  FileUp,
} from "lucide-react";
import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";

// Set worker path for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

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
  { key: "{{contract_number}}", label: "Номер договора", example: "2026-01-001", patterns: ["№", "номер договора", "договор №"] },
  { key: "{{contract_date}}", label: "Дата договора", example: "«12» января 2026 г.", patterns: ["от «", "дата"] },
  { key: "{{org_name}}", label: "Название организации", example: "ООО «Учебный центр»", patterns: ["исполнитель"] },
  { key: "{{org_director_position}}", label: "Должность руководителя", example: "Генерального директора", patterns: ["в лице"] },
  { key: "{{org_director_name}}", label: "ФИО руководителя", example: "Иванова И.И.", patterns: ["директора", "руководителя"] },
  { key: "{{org_inn}}", label: "ИНН организации", example: "7700000000", patterns: ["инн:"] },
  { key: "{{org_kpp}}", label: "КПП организации", example: "770001001", patterns: ["кпп:"] },
  { key: "{{org_ogrn}}", label: "ОГРН организации", example: "1027700000000", patterns: ["огрн:"] },
  { key: "{{org_address}}", label: "Адрес организации", example: "г. Москва, ул. Примерная, д. 1", patterns: ["адрес:"] },
  { key: "{{org_bank_name}}", label: "Название банка", example: "ПАО Сбербанк", patterns: ["банк:"] },
  { key: "{{org_bank_bik}}", label: "БИК банка", example: "044525225", patterns: ["бик:"] },
  { key: "{{org_bank_account}}", label: "Расчётный счёт", example: "40702810000000000000", patterns: ["р/с:", "расч"] },
  { key: "{{org_bank_corr_account}}", label: "Корр. счёт", example: "30101810400000000225", patterns: ["к/с:", "корр"] },
  { key: "{{company_name}}", label: "Название компании-заказчика", example: "ООО «Заказчик»", patterns: ["заказчик"] },
  { key: "{{company_director}}", label: "Руководитель компании", example: "Генерального директора Петрова П.П.", patterns: [] },
  { key: "{{company_inn}}", label: "ИНН компании", example: "7700000001", patterns: [] },
  { key: "{{company_kpp}}", label: "КПП компании", example: "770001002", patterns: [] },
  { key: "{{company_ogrn}}", label: "ОГРН компании", example: "1027700000001", patterns: [] },
  { key: "{{company_address}}", label: "Адрес компании", example: "г. Москва, ул. Заказная, д. 2", patterns: [] },
  { key: "{{course_title}}", label: "Название курса", example: "Охрана труда", patterns: ["программе", "курс"] },
  { key: "{{course_duration}}", label: "Длительность курса", example: " продолжительностью 40 часов", patterns: ["продолжительность", "часов"] },
  { key: "{{students_count}}", label: "Количество обучающихся", example: "10", patterns: ["количество", "обучающихся", "слушателей"] },
  { key: "{{price}}", label: "Цена за 1 человека", example: "5 000,00", patterns: ["стоимость", "цена"] },
  { key: "{{total_price}}", label: "Общая сумма", example: "50 000,00", patterns: ["общая стоимость", "итого"] },
  { key: "{{additional_terms}}", label: "Дополнительные условия", example: "", patterns: [] },
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
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isAddingVariables, setIsAddingVariables] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const extractTextFromPDF = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = "";
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ");
      text += pageText + "\n";
    }
    
    return text;
  };

  const extractTextFromDOCX = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isPDF = fileName.endsWith(".pdf");
    const isDOCX = fileName.endsWith(".docx") || fileName.endsWith(".doc");

    if (!isPDF && !isDOCX) {
      toast.error("Поддерживаются только PDF и DOC/DOCX файлы");
      return;
    }

    setIsProcessingFile(true);
    try {
      let text = "";
      
      if (isPDF) {
        text = await extractTextFromPDF(file);
      } else if (isDOCX) {
        text = await extractTextFromDOCX(file);
      }

      if (text.trim()) {
        setTemplate(text.trim());
        toast.success("Текст документа загружен. Нажмите «Добавить переменные» для автоматической разметки.");
      } else {
        toast.error("Не удалось извлечь текст из документа");
      }
    } catch (error) {
      console.error("Error processing file:", error);
      toast.error("Ошибка обработки файла");
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const addVariablesToTemplate = async () => {
    setIsAddingVariables(true);
    try {
      // Call edge function to use AI for variable detection
      const { data, error } = await supabase.functions.invoke("process-contract-template", {
        body: { text: template, placeholders: PLACEHOLDERS },
      });

      if (error) throw error;

      if (data?.processedText) {
        setTemplate(data.processedText);
        toast.success("Переменные добавлены в шаблон");
      } else {
        toast.error("Не удалось добавить переменные");
      }
    } catch (error) {
      console.error("Error adding variables:", error);
      // Fallback: simple pattern matching
      let processedText = template;
      
      // Replace common patterns with variables
      const patterns = [
        { regex: /ИНН:\s*\d{10,12}/gi, replacement: "ИНН: {{org_inn}}" },
        { regex: /КПП:\s*\d{9}/gi, replacement: "КПП: {{org_kpp}}" },
        { regex: /ОГРН:\s*\d{13,15}/gi, replacement: "ОГРН: {{org_ogrn}}" },
        { regex: /БИК:\s*\d{9}/gi, replacement: "БИК: {{org_bank_bik}}" },
        { regex: /Р\/с:\s*\d{20}/gi, replacement: "Р/с: {{org_bank_account}}" },
        { regex: /К\/с:\s*\d{20}/gi, replacement: "К/с: {{org_bank_corr_account}}" },
        { regex: /№\s*[\d\-\/]+\s+от/gi, replacement: "№ {{contract_number}} от" },
        { regex: /от\s*«?\d{1,2}»?\s*[а-яё]+\s*\d{4}\s*г?\.?/gi, replacement: "от {{contract_date}}" },
        { regex: /(\d+[\s,]*)+\s*руб/gi, replacement: "{{price}} руб" },
        { regex: /Количество обучающихся:\s*\d+/gi, replacement: "Количество обучающихся: {{students_count}}" },
      ];

      patterns.forEach(({ regex, replacement }) => {
        processedText = processedText.replace(regex, replacement);
      });

      setTemplate(processedText);
      toast.success("Базовые переменные добавлены. Проверьте и дополните вручную.");
    } finally {
      setIsAddingVariables(false);
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
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="contract-editor" className="border-none">
        <AccordionTrigger className="hover:no-underline py-0">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <span className="font-semibold">Конструктор шаблона договора</span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="pt-4">
          <div className="space-y-4">
            {/* Upload and Actions */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessingFile}
              >
                {isProcessingFile ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                Загрузить DOC/PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl gap-2"
                onClick={addVariablesToTemplate}
                disabled={isAddingVariables}
              >
                {isAddingVariables ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Добавить переменные
              </Button>
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

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx"
              className="hidden"
              onChange={handleFileUpload}
            />

            {/* Template Editor */}
            <Textarea
              id="contract-template"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="min-h-[400px] font-mono text-sm rounded-xl"
              placeholder="Введите текст шаблона договора или загрузите файл..."
            />

            <p className="text-xs text-muted-foreground">
              Загрузите существующий договор в формате DOC или PDF, затем нажмите «Добавить переменные» для автоматической разметки полей.
            </p>
          </div>
        </AccordionContent>
      </AccordionItem>

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
    </Accordion>
  );
}
