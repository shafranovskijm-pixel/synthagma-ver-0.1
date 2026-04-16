import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import {
  FileText,
  Eye,
  Save,
  RotateCcw,
  Upload,
  Sparkles,
  History,
  Plus,
  Trash2 } from "lucide-react";
import { HighlightedTemplateEditor } from "./HighlightedTemplateEditor";
import { BUILT_IN_TEMPLATES, type ContractTemplate } from "./contract-template/builtInTemplates";
import { TemplateHistoryDialog, type TemplateHistoryEntry } from "./contract-template/TemplateHistoryDialog";
import { CONTRACT_PLACEHOLDERS, extractTextFromPDF, extractTextFromDOCX, getPreviewText, FALLBACK_VARIABLE_PATTERNS } from "./contract-template/contractTemplateHelpers";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface ContractTemplateEditorProps {
  organizationId: string;
  organizationName: string;
  fullPage?: boolean;
}

export function ContractTemplateEditor({
  organizationId,
  organizationName,
  fullPage = false }: ContractTemplateEditorProps) {
  const [template, setTemplate] = useState(BUILT_IN_TEMPLATES[0].text);
  const [originalTemplate, setOriginalTemplate] = useState(BUILT_IN_TEMPLATES[0].text);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isAddingVariables, setIsAddingVariables] = useState(false);
  const [templateBeforeAI, setTemplateBeforeAI] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Template library state
  const [templates, setTemplates] = useState<ContractTemplate[]>([...BUILT_IN_TEMPLATES]);
  const [activeTemplateId, setActiveTemplateId] = useState("legal");
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");

  // History state
  const [history, setHistory] = useState<TemplateHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

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
      
      if (branding?.contractTemplates && Array.isArray(branding.contractTemplates)) {
        const savedTemplates = branding.contractTemplates as ContractTemplate[];
        const customTemplates = savedTemplates.filter(t => !t.isBuiltIn);
        const mergedBuiltIn = BUILT_IN_TEMPLATES.map(bi => {
          const saved = savedTemplates.find(s => s.id === bi.id && s.isBuiltIn);
          return saved ? { ...bi, text: saved.text } : bi;
        });
        setTemplates([...mergedBuiltIn, ...customTemplates]);
        
        const activeId = (branding.activeContractTemplateId as string) || "legal";
        setActiveTemplateId(activeId);
        const activeTemplate = [...mergedBuiltIn, ...customTemplates].find(t => t.id === activeId);
        if (activeTemplate) {
          setTemplate(activeTemplate.text);
          setOriginalTemplate(activeTemplate.text);
        }
      } else if (branding?.contractTemplate) {
        const oldTemplate = branding.contractTemplate as string;
        setTemplate(oldTemplate);
        setOriginalTemplate(oldTemplate);
        const migrated = BUILT_IN_TEMPLATES.map(t => 
          t.id === "legal" ? { ...t, text: oldTemplate } : t
        );
        setTemplates(migrated);
        setActiveTemplateId("legal");
      }

      if (branding?.contractTemplateHistory && Array.isArray(branding.contractTemplateHistory)) {
        setHistory(branding.contractTemplateHistory as TemplateHistoryEntry[]);
      }
    } catch (error) {
      console.error("Error loading template:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveBranding = async (updates: Record<string, unknown>) => {
    const { data: orgData } = await supabase
      .from("organizations")
      .select("branding")
      .eq("id", organizationId)
      .single();

    const currentBranding = (orgData?.branding as Record<string, unknown>) || {};

    const { error } = await supabase
      .from("organizations")
      .update({
        branding: { ...currentBranding, ...updates } as any })
      .eq("id", organizationId);

    if (error) throw error;
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const activeT = templates.find(t => t.id === activeTemplateId);
      const newHistoryEntry: TemplateHistoryEntry = {
        text: originalTemplate,
        savedAt: new Date().toISOString(),
        templateName: activeT?.name || "Без имени" };
      const updatedHistory = [newHistoryEntry, ...history].slice(0, 10);

      const updatedTemplates = templates.map(t =>
        t.id === activeTemplateId ? { ...t, text: template } : t
      );

      await saveBranding({
        contractTemplate: template,
        contractTemplates: updatedTemplates,
        activeContractTemplateId: activeTemplateId,
        contractTemplateHistory: updatedHistory });

      setTemplates(updatedTemplates);
      setHistory(updatedHistory);
      setOriginalTemplate(template);
      toast.success("Шаблон договора сохранён");
    } catch (error) {
      console.error("Error saving template:", error);
      toast.error("Ошибка сохранения шаблона");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectTemplate = (templateId: string) => {
    const t = templates.find(t => t.id === templateId);
    if (t) {
      setActiveTemplateId(templateId);
      setTemplate(t.text);
      setOriginalTemplate(t.text);
    }
  };

  const handleSaveAs = async () => {
    if (!newTemplateName.trim()) return;
    const id = `custom_${Date.now()}`;
    const newTemplate: ContractTemplate = {
      id,
      name: newTemplateName.trim(),
      text: template,
      isBuiltIn: false };
    const updatedTemplates = [...templates, newTemplate];
    setTemplates(updatedTemplates);
    setActiveTemplateId(id);
    setOriginalTemplate(template);

    try {
      await saveBranding({
        contractTemplates: updatedTemplates,
        activeContractTemplateId: id });
      toast.success(`Шаблон «${newTemplate.name}» сохранён`);
    } catch {
      toast.error("Ошибка сохранения");
    }
    setShowSaveAsDialog(false);
    setNewTemplateName("");
  };

  const handleDeleteTemplate = async () => {
    const active = templates.find(t => t.id === activeTemplateId);
    if (!active || active.isBuiltIn) {
      toast.error("Встроенные шаблоны нельзя удалить");
      return;
    }
    const updatedTemplates = templates.filter(t => t.id !== activeTemplateId);
    setTemplates(updatedTemplates);
    handleSelectTemplate("legal");

    try {
      await saveBranding({
        contractTemplates: updatedTemplates,
        activeContractTemplateId: "legal" });
      toast.success(`Шаблон «${active.name}» удалён`);
    } catch {
      toast.error("Ошибка удаления");
    }
  };

  const handleReset = () => {
    const builtIn = BUILT_IN_TEMPLATES.find(t => t.id === activeTemplateId);
    if (builtIn) {
      setTemplate(builtIn.text);
    } else {
      setTemplate(BUILT_IN_TEMPLATES[0].text);
    }
  };

  const handleRestoreFromHistory = (text: string) => {
    setTemplate(text);
    toast.info("Версия восстановлена. Нажмите «Сохранить» для применения.");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileName = file.name.toLowerCase();
    const isPDF = fileName.endsWith(".pdf");
    const isDOCX = fileName.endsWith(".docx") || fileName.endsWith(".doc");
    if (!isPDF && !isDOCX) { toast.error("Поддерживаются только PDF и DOC/DOCX файлы"); return; }
    setIsProcessingFile(true);
    try {
      let text = isPDF ? await extractTextFromPDF(file) : await extractTextFromDOCX(file);
      if (text.trim()) {
        setTemplateBeforeAI(template);
        toast.info("Загружаем и обрабатываем документ...");
        const { data, error } = await safeInvoke<any>("process-contract-template", {
          body: { text: text.trim(), placeholders: CONTRACT_PLACEHOLDERS } });
        if (error) throw error;
        if (data?.processedText) {
          if (data.processedText.length < text.trim().length * 0.6) {
            toast.warning("AI мог сократить текст. Проверьте результат.");
          }
          setTemplate(data.processedText);
          toast.success("Документ загружен и переменные добавлены автоматически");
        } else {
          setTemplate(text.trim());
          toast.success("Текст загружен. Нажмите «Добавить переменные» для разметки.");
        }
      } else { toast.error("Не удалось извлечь текст из документа"); }
    } catch {
      toast.error("Ошибка обработки файла");
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const addVariablesToTemplate = async () => {
    setTemplateBeforeAI(template);
    setIsAddingVariables(true);
    try {
      const { data, error } = await safeInvoke<any>("process-contract-template", {
        body: { text: template, placeholders: CONTRACT_PLACEHOLDERS } });
      if (error) throw error;
      if (data?.processedText) {
        if (data.processedText.length < template.length * 0.6) {
          toast.warning("AI сократил текст. Проверьте результат или отмените изменение.");
        }
        setTemplate(data.processedText);
        toast.success("Переменные добавлены в шаблон");
      } else { toast.error("Не удалось добавить переменные"); }
    } catch {
      let processedText = template;
      FALLBACK_VARIABLE_PATTERNS.forEach(({ regex, replacement }) => { processedText = processedText.replace(regex, replacement); });
      setTemplate(processedText);
      toast.success("Базовые переменные добавлены.");
    } finally { setIsAddingVariables(false); }
  };


  const hasChanges = template !== originalTemplate;
  const activeTemplate = templates.find(t => t.id === activeTemplateId);
  const isBuiltInActive = activeTemplate?.isBuiltIn ?? true;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <SigmaSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <FileText className="w-5 h-5 text-primary" />
        <span className="font-semibold text-base">Конструктор шаблона договора</span>
      </div>

      {/* Compact Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl border bg-muted/30">
        {/* Left group: template selector + library */}
        <Select value={activeTemplateId} onValueChange={handleSelectTemplate}>
          <SelectTrigger className="w-[180px] h-8 rounded-lg text-xs">
            <SelectValue placeholder="Шаблон" />
          </SelectTrigger>
          <SelectContent>
            {templates.map(t => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}{t.isBuiltIn ? "" : " ✦"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="ghost" size="sm" className="h-8 px-2 rounded-lg gap-1" onClick={() => setShowSaveAsDialog(true)} title="Сохранить как...">
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-xs">Сохранить как</span>
        </Button>

        {!isBuiltInActive && (
          <Button variant="ghost" size="sm" className="h-8 px-2 rounded-lg text-destructive hover:text-destructive" onClick={handleDeleteTemplate} title="Удалить шаблон">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}

        <Button variant="ghost" size="sm" className="h-8 px-2 rounded-lg gap-1" onClick={() => setShowHistory(true)} title="История версий">
          <History className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-xs">История</span>
        </Button>

        {/* Separator */}
        <div className="w-px h-5 bg-border mx-0.5 hidden sm:block" />

        {/* Right group: actions */}
        <Button variant="ghost" size="sm" className="h-8 px-2 rounded-lg gap-1" onClick={() => fileInputRef.current?.click()} disabled={isProcessingFile} title="Загрузить DOC/PDF">
          {isProcessingFile ? <SigmaSpinner size="xs" className=".5 .5" /> : <Upload className="w-3.5 h-3.5" />}
          <span className="hidden md:inline text-xs">Загрузить</span>
        </Button>

        <Button variant="ghost" size="sm" className="h-8 px-2 rounded-lg gap-1" onClick={addVariablesToTemplate} disabled={isAddingVariables} title="Добавить переменные (AI)">
          {isAddingVariables ? <SigmaSpinner size="xs" className=".5 .5" /> : <Sparkles className="w-3.5 h-3.5" />}
          <span className="hidden md:inline text-xs">AI</span>
        </Button>

        <Button variant="ghost" size="sm" className="h-8 px-2 rounded-lg gap-1" onClick={() => setShowPreview(true)} title="Предпросмотр">
          <Eye className="w-3.5 h-3.5" />
          <span className="hidden md:inline text-xs">Просмотр</span>
        </Button>

        {templateBeforeAI && (
          <Button variant="ghost" size="sm" className="h-8 px-2 rounded-lg text-destructive hover:text-destructive gap-1" onClick={() => { setTemplate(templateBeforeAI); setTemplateBeforeAI(null); toast.info("Текст восстановлен"); }} title="Отменить разметку">
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        )}

        <Button variant="ghost" size="sm" className="h-8 px-2 rounded-lg gap-1" onClick={handleReset} title="Сбросить к исходному">
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden md:inline text-xs">Сброс</span>
        </Button>

        <div className="flex-1" />

        <Button size="sm" className="h-8 px-3 rounded-lg gap-1.5 text-xs" onClick={handleSave} disabled={isSaving || !hasChanges}>
          {isSaving ? <SigmaSpinner size="xs" className=".5 .5" /> : <Save className="w-3.5 h-3.5" />}
          Сохранить
        </Button>
      </div>

      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFileUpload} />

      {/* Template Editor - full width, taller */}
      <HighlightedTemplateEditor
        value={template}
        onChange={setTemplate}
        placeholder="Введите текст шаблона договора или загрузите файл..."
        fullPage={fullPage}
      />

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
              {getPreviewText(template)}
            </pre>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setShowPreview(false)}>Закрыть</Button>
            <Button className="rounded-xl gap-2" onClick={() => {
              const printWindow = window.open("", "_blank");
              if (printWindow) {
                printWindow.document.write(`<!DOCTYPE html><html><head><title>Предпросмотр договора</title><style>body{font-family:'Times New Roman',serif;padding:2cm;line-height:1.6;}pre{white-space:pre-wrap;font-family:inherit;}</style></head><body><pre>${getPreviewText(template)}</pre></body></html>`);
                printWindow.document.close();
                printWindow.print();
              }
            }}>
              <FileText className="w-4 h-4" />
              Печать
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Save As Dialog */}
      <Dialog open={showSaveAsDialog} onOpenChange={setShowSaveAsDialog}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Сохранить шаблон как...</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Название шаблона"
              value={newTemplateName}
              onChange={e => setNewTemplateName(e.target.value)}
              className="rounded-xl"
              onKeyDown={e => e.key === "Enter" && handleSaveAs()}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => setShowSaveAsDialog(false)}>Отмена</Button>
              <Button className="rounded-xl" onClick={handleSaveAs} disabled={!newTemplateName.trim()}>Сохранить</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <TemplateHistoryDialog
        open={showHistory}
        onOpenChange={setShowHistory}
        history={history}
        onRestore={handleRestoreFromHistory}
      />
    </div>
  );
}
