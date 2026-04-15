import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, RotateCcw, Plus, Trash2, Users, Eye } from "lucide-react";
import { HighlightedTemplateEditor } from "./HighlightedTemplateEditor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DocumentPreview } from "./DocumentPreview";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface CommissionMember {
  name: string;
  position: string;
  role: "chairman" | "member" | "secretary";
}

interface ProtocolTemplateEditorProps {
  organizationId: string;
}

const DEFAULT_PROTOCOL_TEMPLATE = `ПРОТОКОЛ ЗАСЕДАНИЯ АТТЕСТАЦИОННОЙ КОМИССИИ

№ {{protocol_number}} от {{protocol_date}} г.

{{org_name}}

Программа обучения: {{course_name}}
Объём программы: {{course_duration}}

Состав комиссии:
{{commission_members}}

Повестка дня:
Итоговая аттестация слушателей по результатам освоения дополнительной профессиональной программы.

{{students_table}}

РЕШИЛИ:
Признать слушателей, указанных в таблице, успешно прошедшими итоговую аттестацию по дополнительной профессиональной программе «{{course_name}}».
Выдать документы о квалификации установленного образца.

Председатель комиссии: _________________ / {{chairman_name}} /
Члены комиссии: _________________ / _________________ /`;

const PROTOCOL_PLACEHOLDERS = [
  { key: "{{protocol_number}}", label: "Номер протокола" },
  { key: "{{protocol_date}}", label: "Дата протокола" },
  { key: "{{org_name}}", label: "Название организации" },
  { key: "{{director_name}}", label: "ФИО руководителя" },
  { key: "{{director_position}}", label: "Должность руководителя" },
  { key: "{{course_name}}", label: "Название курса" },
  { key: "{{course_duration}}", label: "Объём программы (часы)" },
  { key: "{{students_table}}", label: "Таблица слушателей (авто)" },
  { key: "{{commission_members}}", label: "Состав комиссии (авто)" },
  { key: "{{chairman_name}}", label: "ФИО председателя" },
];

export function ProtocolTemplateEditor({ organizationId }: ProtocolTemplateEditorProps) {
  const [template, setTemplate] = useState(DEFAULT_PROTOCOL_TEMPLATE);
  const [originalTemplate, setOriginalTemplate] = useState(DEFAULT_PROTOCOL_TEMPLATE);
  const [commissionMembers, setCommissionMembers] = useState<CommissionMember[]>([
    { name: "", position: "", role: "chairman" },
    { name: "", position: "", role: "member" },
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, [organizationId]);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("organizations")
        .select("branding")
        .eq("id", organizationId)
        .single();
      if (error) throw error;
      const branding = data?.branding as Record<string, unknown> | null;
      if (branding?.protocolTemplate) {
        setTemplate(branding.protocolTemplate as string);
        setOriginalTemplate(branding.protocolTemplate as string);
      }
      if (branding?.commissionMembers && Array.isArray(branding.commissionMembers)) {
        setCommissionMembers(branding.commissionMembers as CommissionMember[]);
      }
    } catch (error) {
      console.error("Error loading protocol settings:", error);
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
          branding: JSON.parse(JSON.stringify({
            ...currentBranding,
            protocolTemplate: template,
            commissionMembers })) })
        .eq("id", organizationId);
      if (error) throw error;
      setOriginalTemplate(template);
      toast.success("Настройки протокола сохранены");
    } catch (error) {
      console.error("Error saving protocol settings:", error);
      toast.error("Ошибка сохранения");
    } finally {
      setIsSaving(false);
    }
  };

  const addMember = () => {
    setCommissionMembers(prev => [...prev, { name: "", position: "", role: "member" }]);
  };

  const removeMember = (index: number) => {
    setCommissionMembers(prev => prev.filter((_, i) => i !== index));
  };

  const updateMember = (index: number, field: keyof CommissionMember, value: string) => {
    setCommissionMembers(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } : m));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <SigmaSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Commission Members */}
      <div>
        <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Состав аттестационной комиссии
        </h4>
        <div className="space-y-3">
          {commissionMembers.map((member, index) => (
            <div key={index} className="flex items-center gap-2">
              <Select
                value={member.role}
                onValueChange={(v) => updateMember(index, "role", v)}
              >
                <SelectTrigger className="w-[160px] rounded-xl text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chairman">Председатель</SelectItem>
                  <SelectItem value="member">Член комиссии</SelectItem>
                  <SelectItem value="secretary">Секретарь</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={member.name}
                onChange={(e) => updateMember(index, "name", e.target.value)}
                placeholder="ФИО"
                className="rounded-xl flex-1 text-sm"
              />
              <Input
                value={member.position}
                onChange={(e) => updateMember(index, "position", e.target.value)}
                placeholder="Должность"
                className="rounded-xl flex-1 text-sm"
              />
              {commissionMembers.length > 1 && (
                <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9" onClick={() => removeMember(index)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addMember} className="rounded-xl text-xs">
            <Plus className="w-3 h-3 mr-1" /> Добавить члена комиссии
          </Button>
        </div>
      </div>

      {/* Template Editor */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-sm font-medium">Шаблон протокола</Label>
          <Button variant="ghost" size="sm" onClick={() => setTemplate(DEFAULT_PROTOCOL_TEMPLATE)} className="text-xs">
            <RotateCcw className="w-3 h-3 mr-1" /> По умолчанию
          </Button>
        </div>
        <HighlightedTemplateEditor
          value={template}
          onChange={setTemplate}
        />
      </div>

      {/* Available Placeholders */}
      <div>
        <Label className="text-xs text-muted-foreground mb-2 block">Доступные переменные</Label>
        <div className="flex flex-wrap gap-1.5">
          {PROTOCOL_PLACEHOLDERS.map(p => (
            <button
              key={p.key}
              className="px-2 py-1 rounded-lg bg-primary/10 text-primary text-xs hover:bg-primary/20 transition-colors"
              onClick={() => {
                navigator.clipboard.writeText(p.key);
                toast.success(`Скопировано: ${p.key}`);
              }}
            >
              {p.key} — {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Preview Accordion */}
      <Accordion type="single" collapsible>
        <AccordionItem value="preview" className="border rounded-xl px-4">
          <AccordionTrigger className="text-sm hover:no-underline gap-2">
            <span className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Предпросмотр протокола
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <DocumentPreview
              type="protocol"
              data={{
                commissionMembers: commissionMembers.filter(m => m.name) }}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Save */}
      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={isSaving} className="rounded-xl gap-2">
          {isSaving ? <SigmaSpinner size="sm" /> : <Save className="w-4 h-4" />}
          Сохранить настройки протокола
        </Button>
      </div>
    </div>
  );
}
