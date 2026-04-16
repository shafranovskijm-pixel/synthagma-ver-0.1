import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";

interface Organization { name: string; inn: string | null; ogrn: string | null; legal_address: string | null; director_name: string | null; director_position: string | null; }
interface DadataCompany { name: string; fullName: string; shortName: string; inn: string; kpp: string; ogrn: string; address: string; management: string; status: string; type: string; opf: string; }

export interface SavedConsent {
  id: string; consent_type: "individual" | "organization"; full_name: string | null; passport_data: string | null;
  address: string | null; company_name: string | null; company_inn: string | null; company_director: string | null;
  company_address: string | null; content_html: string; created_at: string; student_user_id: string | null; student_name?: string | null;
}

export interface Student { user_id: string; full_name: string; email: string; }

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

export function useConsentGenerator(organizationId: string, organizationName: string) {
  const [isSaving, setIsSaving] = useState(false);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [consentType, setConsentType] = useState<"individual" | "organization">("individual");
  const [savedConsents, setSavedConsents] = useState<SavedConsent[]>([]);
  const [isLoadingConsents, setIsLoadingConsents] = useState(false);
  const [selectedConsent, setSelectedConsent] = useState<SavedConsent | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [fullName, setFullName] = useState("");
  const [passportData, setPassportData] = useState("");
  const [address, setAddress] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyInn, setCompanyInn] = useState("");
  const [companyDirector, setCompanyDirector] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [isSearchingDadata, setIsSearchingDadata] = useState(false);
  const [dadataCompanyInfo, setDadataCompanyInfo] = useState<DadataCompany | null>(null);

  useEffect(() => { loadOrganization(); loadSavedConsents(); loadStudents(); }, [organizationId]);

  const loadOrganization = async () => {
    try { const { data } = await supabase.from("organizations").select("name, inn, ogrn, legal_address, director_name, director_position").eq("id", organizationId).single(); if (data) setOrganization(data); } catch (e) { console.error(e); }
  };

  const loadSavedConsents = async () => {
    setIsLoadingConsents(true);
    try {
      const { data, error } = await supabase.from("consent_documents").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false });
      if (error) throw error;
      const withStudents = await Promise.all((data || []).map(async (c: any) => {
        if (c.student_user_id) { const { data: p } = await supabase.from("profiles").select("full_name").eq("user_id", c.student_user_id).single(); return { ...c, student_name: p?.full_name || null }; }
        return c;
      }));
      setSavedConsents(withStudents as SavedConsent[]);
    } catch (e) { console.error(e); } finally { setIsLoadingConsents(false); }
  };

  const loadStudents = async () => {
    try { const { data } = await supabase.from("profiles").select("user_id, full_name, email").eq("organization_id", organizationId).order("full_name"); setStudents((data || []) as Student[]); } catch (e) { console.error(e); }
  };

  const handleStudentSelect = (studentId: string) => { setSelectedStudentId(studentId); const s = students.find(s => s.user_id === studentId); if (s && consentType === "individual") setFullName(s.full_name || ""); };

  const handleSearchByInn = async () => {
    if (companyInn.length < 10) { toast.error("Введите корректный ИНН"); return; }
    setIsSearchingDadata(true);
    try {
      const { data, error } = await safeInvoke<any>("dadata-company", { body: { inn: companyInn } });
      if (error) throw error;
      if (data.success && data.company) { setDadataCompanyInfo(data.company); setCompanyName(data.company.shortName || data.company.name); setCompanyDirector(data.company.management || ""); setCompanyAddress(data.company.address || ""); toast.success("Данные компании найдены"); }
      else { setDadataCompanyInfo(null); toast.error(data.message || "Компания не найдена"); }
    } catch (e) { console.error(e); toast.error("Ошибка поиска по ИНН"); setDadataCompanyInfo(null); } finally { setIsSearchingDadata(false); }
  };

  const formatDate = () => new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });

  const generateConsentContent = () => {
    if (!organization) return "";
    let content = DEFAULT_CONSENT_TEMPLATE;
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
      content = content.replace("Я, {{full_name}}, паспорт: {{passport_data}}, адрес регистрации/проживания: {{address}}", `${companyName || "_________________"}, ИНН ${companyInn || "_________"}, в лице ${companyDirector || "_______________"}, адрес: ${companyAddress || "_________________"}`);
      content = content.replace(/\{\{full_name\}\}/g, companyDirector || "_______________");
    }
    return content;
  };

  const generateConsentHTML = () => {
    const content = generateConsentContent();
    const lines = content.split("\n");
    return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><style>@page{margin:2cm;size:A4}body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;max-width:21cm;margin:0 auto;padding:2cm}h1{text-align:center;font-size:14pt;margin-bottom:20pt;font-weight:bold}p{text-align:justify;margin-bottom:6pt;text-indent:1.25cm}ul{margin-left:2cm;margin-bottom:12pt}li{margin-bottom:4pt}.signature-block{margin-top:30pt;text-align:left}@media print{body{padding:0}}</style></head><body>${lines.map((line, idx) => { if (idx === 0) return `<h1>${line}</h1>`; if (line.startsWith("- ")) return `<li>${line.substring(2)}</li>`; if (line.trim() === "") return ""; return `<p>${line}</p>`; }).join("\n")}</body></html>`;
  };

  const handleDownload = () => {
    const html = generateConsentHTML();
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `consent_${Date.now()}.html`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    toast.success("Согласие скачано");
  };

  const handlePrint = () => {
    const html = generateConsentHTML();
    const printWindow = window.open("", "_blank");
    if (printWindow) { printWindow.document.write(html); printWindow.document.close(); printWindow.print(); }
  };

  const handleSaveToDatabase = async () => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const html = generateConsentHTML();
      const { error } = await supabase.from("consent_documents").insert({
        organization_id: organizationId, consent_type: consentType,
        full_name: consentType === "individual" ? fullName || null : null,
        passport_data: consentType === "individual" ? passportData || null : null,
        address: consentType === "individual" ? address || null : null,
        company_name: consentType === "organization" ? companyName || null : null,
        company_inn: consentType === "organization" ? companyInn || null : null,
        company_director: consentType === "organization" ? companyDirector || null : null,
        company_address: consentType === "organization" ? companyAddress || null : null,
        content_html: html, created_by: user?.id || null, student_user_id: selectedStudentId || null,
      });
      if (error) throw error;
      toast.success("Согласие сохранено"); loadSavedConsents();
      setSelectedStudentId("");
      if (consentType === "individual") { setFullName(""); setPassportData(""); setAddress(""); }
      else { setCompanyName(""); setCompanyInn(""); setCompanyDirector(""); setCompanyAddress(""); setDadataCompanyInfo(null); }
    } catch (e) { console.error(e); toast.error("Ошибка сохранения"); } finally { setIsSaving(false); }
  };

  const handleDeleteConsent = async (id: string) => {
    try { const { error } = await supabase.from("consent_documents").delete().eq("id", id); if (error) throw error; toast.success("Согласие удалено"); loadSavedConsents(); setSelectedConsent(null); }
    catch (e) { console.error(e); toast.error("Ошибка удаления"); }
  };

  const formatConsentDate = (dateString: string) => new Date(dateString).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return {
    isSaving, organization, showPreview, setShowPreview, showHistory, setShowHistory,
    consentType, setConsentType, savedConsents, isLoadingConsents, selectedConsent, setSelectedConsent,
    students, selectedStudentId, setSelectedStudentId, studentSearchQuery, setStudentSearchQuery,
    fullName, setFullName, passportData, setPassportData, address, setAddress,
    companyName, setCompanyName, companyInn, setCompanyInn, companyDirector, setCompanyDirector,
    companyAddress, setCompanyAddress, isSearchingDadata, dadataCompanyInfo,
    handleStudentSelect, handleSearchByInn, generateConsentHTML, handleDownload, handlePrint,
    handleSaveToDatabase, handleDeleteConsent, formatConsentDate,
  };
}
