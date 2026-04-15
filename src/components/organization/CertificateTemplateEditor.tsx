import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Award, GraduationCap, Eye } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DocumentPreview } from "./DocumentPreview";

interface DocumentSettings {
  series: string;
  startNumber: number;
  city: string;
  regNumberFormat: string;
}

interface CertificateTemplateEditorProps {
  organizationId: string;
}

const DEFAULT_CERTIFICATE_SETTINGS: DocumentSettings = {
  series: "",
  startNumber: 1,
  city: "",
  regNumberFormat: "{{year}}-{{number}}" };

const DEFAULT_DIPLOMA_SETTINGS: DocumentSettings = {
  series: "",
  startNumber: 1,
  city: "",
  regNumberFormat: "{{year}}-{{number}}" };

export function CertificateTemplateEditor({ organizationId }: CertificateTemplateEditorProps) {
  const [certificateSettings, setCertificateSettings] = useState<DocumentSettings>(DEFAULT_CERTIFICATE_SETTINGS);
  const [diplomaSettings, setDiplomaSettings] = useState<DocumentSettings>(DEFAULT_DIPLOMA_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("certificate");

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
      if (branding?.certificateSettings) {
        setCertificateSettings({ ...DEFAULT_CERTIFICATE_SETTINGS, ...(branding.certificateSettings as DocumentSettings) });
      }
      if (branding?.diplomaSettings) {
        setDiplomaSettings({ ...DEFAULT_DIPLOMA_SETTINGS, ...(branding.diplomaSettings as DocumentSettings) });
      }
    } catch (error) {
      console.error("Error loading document settings:", error);
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
            certificateSettings,
            diplomaSettings })) })
        .eq("id", organizationId);
      if (error) throw error;
      toast.success("Настройки документов сохранены");
    } catch (error) {
      console.error("Error saving document settings:", error);
      toast.error("Ошибка сохранения");
    } finally {
      setIsSaving(false);
    }
  };

  const renderSettingsForm = (
    settings: DocumentSettings,
    setSettings: React.Dispatch<React.SetStateAction<DocumentSettings>>,
    docType: "certificate" | "diploma"
  ) => {
    const previewNumber = settings.regNumberFormat
      .replace("{{year}}", new Date().getFullYear().toString())
      .replace("{{number}}", settings.startNumber.toString().padStart(4, "0"));

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm">Серия документа</Label>
            <Input
              value={settings.series}
              onChange={(e) => setSettings(prev => ({ ...prev, series: e.target.value }))}
              placeholder={docType === "certificate" ? "ПК" : "ДПП"}
              className="rounded-xl"
            />
            <p className="text-xs text-muted-foreground">Серия бланка (например, ПК, ДПП)</p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Начальный номер</Label>
            <Input
              type="number"
              min={1}
              value={settings.startNumber}
              onChange={(e) => setSettings(prev => ({ ...prev, startNumber: parseInt(e.target.value) || 1 }))}
              className="rounded-xl"
            />
            <p className="text-xs text-muted-foreground">Следующий номер для выдачи</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Город выдачи</Label>
          <Input
            value={settings.city}
            onChange={(e) => setSettings(prev => ({ ...prev, city: e.target.value }))}
            placeholder="г. Москва"
            className="rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Формат регистрационного номера</Label>
          <Input
            value={settings.regNumberFormat}
            onChange={(e) => setSettings(prev => ({ ...prev, regNumberFormat: e.target.value }))}
            placeholder="{{year}}-{{number}}"
            className="rounded-xl font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Используйте <code className="bg-muted px-1 rounded">{"{{year}}"}</code> и <code className="bg-muted px-1 rounded">{"{{number}}"}</code>. 
            Пример: <span className="font-medium">{previewNumber}</span>
          </p>
        </div>
      </div>
    );
  };

  const currentSettings = activeTab === "certificate" ? certificateSettings : diplomaSettings;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <SigmaSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 rounded-xl">
          <TabsTrigger value="certificate" className="rounded-xl gap-2 text-xs">
            <Award className="w-4 h-4" />
            Удостоверение (ПК)
          </TabsTrigger>
          <TabsTrigger value="diploma" className="rounded-xl gap-2 text-xs">
            <GraduationCap className="w-4 h-4" />
            Диплом (ПП)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="certificate" className="mt-4">
          <div className="bg-secondary/30 rounded-xl p-4 mb-4">
            <p className="text-sm text-muted-foreground">
              Настройки для удостоверений о повышении квалификации. Серия и номер будут автоматически подставляться при создании записей в журнале документов.
            </p>
          </div>
          {renderSettingsForm(certificateSettings, setCertificateSettings, "certificate")}
        </TabsContent>

        <TabsContent value="diploma" className="mt-4">
          <div className="bg-secondary/30 rounded-xl p-4 mb-4">
            <p className="text-sm text-muted-foreground">
              Настройки для дипломов о профессиональной переподготовке. Серия и номер будут автоматически подставляться при создании записей в журнале документов.
            </p>
          </div>
          {renderSettingsForm(diplomaSettings, setDiplomaSettings, "diploma")}
        </TabsContent>
      </Tabs>

      <Accordion type="single" collapsible>
        <AccordionItem value="preview" className="border rounded-xl px-4">
          <AccordionTrigger className="text-sm hover:no-underline gap-2">
            <span className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Предпросмотр документа
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <DocumentPreview
              type={activeTab === "certificate" ? "certificate" : "diploma"}
              data={{
                series: currentSettings.series || (activeTab === "certificate" ? "ПК" : "ДПП"),
                number: currentSettings.startNumber,
                city: currentSettings.city || "г. Москва",
                regNumberFormat: currentSettings.regNumberFormat }}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Button onClick={handleSave} disabled={isSaving} className="rounded-xl gap-2">
        {isSaving ? <SigmaSpinner size="sm" /> : <Save className="w-4 h-4" />}
        Сохранить настройки документов
      </Button>
    </div>
  );
}
