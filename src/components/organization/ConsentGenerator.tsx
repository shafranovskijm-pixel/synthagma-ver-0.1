import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileCheck, Eye, Download, Loader2, User, Building2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ConsentGeneratorProps {
  organizationId: string;
  organizationName: string;
  onGenerated?: (url: string) => void;
}

interface Organization {
  name: string;
  inn: string | null;
  ogrn: string | null;
  legal_address: string | null;
  director_name: string | null;
  director_position: string | null;
}

const DEFAULT_CONSENT_TEMPLATE = `СОГЛАСИЕ НА ОБРАБОТКУ ПЕРСОНАЛЬНЫХ ДАННЫХ

Я, {{full_name}}, паспорт: {{passport_data}}, адрес регистрации/проживания: {{address}}, настоящим, в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных», даю согласие {{org_name}}, ИНН {{org_inn}}, ОГРН {{org_ogrn}}, адрес: {{org_address}} (далее — Оператор), на обработку моих персональных данных.

Цель обработки персональных данных:
заключение и исполнение договора об оказании платных образовательных услуг; организация образовательного процесса; ведение учета обучающихся; обеспечение доступа к электронной информационно-образовательной среде (ЭИОС); проведение текущего контроля и итоговой аттестации; оформление, учет и выдача документов об обучении и (или) о квалификации; исполнение требований законодательства РФ.

Перечень персональных данных, на обработку которых дается согласие:
- фамилия, имя, отчество;
- дата и место рождения;
- паспортные данные или данные иного документа, удостоверяющего личность;
- адрес регистрации и (или) проживания;
- контактные данные (телефон, адрес электронной почты);
- сведения об образовании, квалификации, месте работы (при необходимости);
- данные об успеваемости, результатах текущего контроля и итоговой аттестации;
- идентификаторы в ЭИОС, данные об активности в ЭИОС;
- изображение (фото/видео) при использовании ЭО/ДОТ и прокторинга (при применимости).

С персональными данными могут совершаться следующие действия:
сбор, запись, систематизация, накопление, хранение, уточнение (обновление, изменение), использование, передача (в случаях, предусмотренных законодательством РФ), обезличивание, блокирование, удаление, уничтожение.

Обработка персональных данных может осуществляться как с использованием средств автоматизации, так и без использования таких средств.

Настоящее согласие действует с даты его подписания и до достижения целей обработки персональных данных либо до отзыва согласия, если иное не предусмотрено законодательством РФ.

Согласие может быть отозвано мной в любое время путем направления письменного уведомления Оператору. Отзыв согласия не влияет на законность обработки персональных данных, осуществленной до момента отзыва.

Мне разъяснены мои права как субъекта персональных данных, предусмотренные ст. 14 Федерального закона № 152-ФЗ.

Дата: {{consent_date}}

_________________________ / {{full_name}} /
        (подпись)`;

export function ConsentGenerator({
  organizationId,
  organizationName,
  onGenerated,
}: ConsentGeneratorProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [consentType, setConsentType] = useState<"individual" | "organization">("individual");
  
  // Individual fields
  const [fullName, setFullName] = useState("");
  const [passportData, setPassportData] = useState("");
  const [address, setAddress] = useState("");
  
  // Organization fields (for company consent)
  const [companyName, setCompanyName] = useState("");
  const [companyInn, setCompanyInn] = useState("");
  const [companyDirector, setCompanyDirector] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");

  useEffect(() => {
    loadOrganization();
  }, [organizationId]);

  const loadOrganization = async () => {
    try {
      const { data, error } = await supabase
        .from("organizations")
        .select("name, inn, ogrn, legal_address, director_name, director_position")
        .eq("id", organizationId)
        .single();

      if (error) throw error;
      setOrganization(data);
    } catch (error) {
      console.error("Error loading organization:", error);
    }
  };

  const formatDate = () => {
    const now = new Date();
    return now.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  const generateConsentContent = () => {
    if (!organization) return "";

    let content = DEFAULT_CONSENT_TEMPLATE;

    // Organization data
    content = content.replace(/\{\{org_name\}\}/g, organization.name || organizationName);
    content = content.replace(/\{\{org_inn\}\}/g, organization.inn || "_____________");
    content = content.replace(/\{\{org_ogrn\}\}/g, organization.ogrn || "_____________");
    content = content.replace(/\{\{org_address\}\}/g, organization.legal_address || "_____________");
    content = content.replace(/\{\{consent_date\}\}/g, formatDate());

    if (consentType === "individual") {
      content = content.replace(/\{\{full_name\}\}/g, fullName || "___________________________________");
      content = content.replace(/\{\{passport_data\}\}/g, passportData || "_________________________________");
      content = content.replace(/\{\{address\}\}/g, address || "_________________________________");
    } else {
      // For organization consent
      content = content.replace(
        "Я, {{full_name}}, паспорт: {{passport_data}}, адрес регистрации/проживания: {{address}}",
        `${companyName || "_________________"}, ИНН ${companyInn || "_________"}, в лице ${companyDirector || "_______________"}, адрес: ${companyAddress || "_________________"}`
      );
      content = content.replace(/\{\{full_name\}\}/g, companyDirector || "_______________");
    }

    return content;
  };

  const generateConsentHTML = () => {
    const content = generateConsentContent();
    const lines = content.split("\n");
    
    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <style>
    @page { margin: 2cm; size: A4; }
    body { 
      font-family: 'Times New Roman', serif; 
      font-size: 12pt; 
      line-height: 1.5;
      max-width: 21cm;
      margin: 0 auto;
      padding: 2cm;
    }
    h1 { 
      text-align: center; 
      font-size: 14pt; 
      margin-bottom: 20pt;
      font-weight: bold;
    }
    p { 
      text-align: justify; 
      margin-bottom: 6pt;
      text-indent: 1.25cm;
    }
    ul { 
      margin-left: 2cm; 
      margin-bottom: 12pt;
    }
    li { margin-bottom: 4pt; }
    .signature-block {
      margin-top: 30pt;
      text-align: left;
    }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  ${lines.map((line, idx) => {
    if (idx === 0) return `<h1>${line}</h1>`;
    if (line.startsWith("- ")) return `<li>${line.substring(2)}</li>`;
    if (line.trim() === "") return "";
    return `<p>${line}</p>`;
  }).join("\n")}
</body>
</html>`;
  };

  const handlePreview = () => {
    setShowPreview(true);
  };

  const handleDownload = () => {
    const html = generateConsentHTML();
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `consent_${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success("Согласие сохранено");
  };

  const handlePrint = () => {
    const html = generateConsentHTML();
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <div className="space-y-6">
      <Tabs value={consentType} onValueChange={(v) => setConsentType(v as "individual" | "organization")}>
        <TabsList className="grid w-full grid-cols-2 rounded-xl">
          <TabsTrigger value="individual" className="rounded-xl gap-2">
            <User className="w-4 h-4" />
            Для физ. лица
          </TabsTrigger>
          <TabsTrigger value="organization" className="rounded-xl gap-2">
            <Building2 className="w-4 h-4" />
            Для организации
          </TabsTrigger>
        </TabsList>

        <TabsContent value="individual" className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>ФИО полностью</Label>
            <Input
              placeholder="Иванов Иван Иванович"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label>Паспортные данные</Label>
            <Input
              placeholder="1234 567890, выдан УФМС ..."
              value={passportData}
              onChange={(e) => setPassportData(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label>Адрес регистрации/проживания</Label>
            <Input
              placeholder="г. Москва, ул. Примерная, д. 1, кв. 1"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="rounded-xl"
            />
          </div>
        </TabsContent>

        <TabsContent value="organization" className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Наименование организации</Label>
            <Input
              placeholder="ООО «Название»"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label>ИНН организации</Label>
            <Input
              placeholder="1234567890"
              value={companyInn}
              onChange={(e) => setCompanyInn(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label>ФИО директора</Label>
            <Input
              placeholder="Петров Петр Петрович"
              value={companyDirector}
              onChange={(e) => setCompanyDirector(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label>Адрес организации</Label>
            <Input
              placeholder="г. Москва, ул. Примерная, д. 1"
              value={companyAddress}
              onChange={(e) => setCompanyAddress(e.target.value)}
              className="rounded-xl"
            />
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="rounded-xl gap-2 flex-1"
          onClick={handlePreview}
        >
          <Eye className="w-4 h-4" />
          Предпросмотр
        </Button>
        <Button
          className="btn-gradient rounded-xl gap-2 flex-1"
          onClick={handleDownload}
        >
          <Download className="w-4 h-4" />
          Скачать
        </Button>
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <FileCheck className="w-5 h-5" />
              Предпросмотр согласия на обработку ПД
            </DialogTitle>
          </DialogHeader>
          <div className="bg-white p-8 rounded-xl border">
            <div
              className="prose prose-sm max-w-none"
              style={{ fontFamily: "'Times New Roman', serif" }}
              dangerouslySetInnerHTML={{ __html: generateConsentHTML() }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowPreview(false)} className="rounded-xl">
              Закрыть
            </Button>
            <Button onClick={handlePrint} className="btn-gradient rounded-xl gap-2">
              <Download className="w-4 h-4" />
              Печать
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
