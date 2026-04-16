import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import {
  formatPrice, numberToWords, detectGender, declineFullName, isIP,
  downloadAsDoc, printHtml,
  type OrgRequisites, type DocumentCompany, type DocumentCourse,
} from "@/utils/documentHelpers";

interface Invoice {
  id: string;
  name: string;
  contract_number: string | null;
  uploaded_at: string;
  amount: number | null;
  students_count: number | null;
  course_id: string | null;
}

export function useActGenerator(
  organizationId: string,
  isOpen: boolean,
  orgRequisites: OrgRequisites,
  preselectedCompany?: DocumentCompany | null,
) {
  const [companies, setCompanies] = useState<DocumentCompany[]>([]);
  const [courses, setCourses] = useState<DocumentCourse[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [mode, setMode] = useState<'choosing' | 'invoice' | 'manual' | 'preview' | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");

  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [actNumber, setActNumber] = useState("");
  const [actDate, setActDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [contractNumber, setContractNumber] = useState("");
  const [contractDate, setContractDate] = useState("");
  const [studentsCount, setStudentsCount] = useState("1");
  const [price, setPrice] = useState("");

  useEffect(() => {
    if (preselectedCompany && isOpen) setSelectedCompanyId(preselectedCompany.id);
  }, [preselectedCompany, isOpen]);

  useEffect(() => {
    if (!isOpen) { setMode(null); setSelectedInvoiceId(""); setSelectedCourseId(""); setPrice(""); setStudentsCount("1"); setContractNumber(""); setContractDate(""); setPreviewHtml(""); }
  }, [isOpen]);

  useEffect(() => {
    const loadData = async () => {
      if (!organizationId || !isOpen) return;
      setIsLoading(true);
      try {
        const companyId = preselectedCompany?.id || selectedCompanyId;
        const [companiesRes, coursesRes] = await Promise.all([
          supabase.from("companies").select("id, name, inn, kpp, ogrn, address, director").eq("organization_id", organizationId).order("name"),
          supabase.from("courses").select("id, title, duration").eq("organization_id", organizationId).eq("is_published", true).order("title"),
        ]);
        if (companiesRes.error) throw companiesRes.error;
        if (coursesRes.error) throw coursesRes.error;
        setCompanies(companiesRes.data || []);
        setCourses(coursesRes.data || []);

        if (companyId) {
          const { data: invoicesData } = await supabase.from("company_documents").select("id, name, contract_number, uploaded_at, amount, students_count, course_id").eq("company_id", companyId).eq("type", "invoice").order("uploaded_at", { ascending: false });
          setInvoices(invoicesData || []);
          if (!invoicesData?.length) setMode('manual');
        } else { setMode('manual'); }

        const today = new Date();
        setActNumber(`AKT-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`);
      } catch (error) { console.error(error); toast.error("Ошибка загрузки данных"); }
      finally { setIsLoading(false); }
    };
    loadData();
  }, [organizationId, isOpen, preselectedCompany?.id, selectedCompanyId]);

  useEffect(() => {
    if (selectedInvoiceId && mode === 'invoice') {
      const invoice = invoices.find(i => i.id === selectedInvoiceId);
      if (invoice) {
        if (invoice.course_id) setSelectedCourseId(invoice.course_id);
        if (invoice.amount) { setPrice(String(invoice.amount / (invoice.students_count || 1))); }
        if (invoice.students_count) setStudentsCount(String(invoice.students_count));
        setContractNumber(invoice.name.match(/№?\s*([^\s_]+)/)?.[1] || invoice.contract_number || "");
        setContractDate(format(new Date(invoice.uploaded_at), "yyyy-MM-dd"));
      }
    }
  }, [selectedInvoiceId, mode, invoices]);

  const selectedCompany = preselectedCompany || companies.find((c) => c.id === selectedCompanyId);
  const selectedCourse = courses.find((c) => c.id === selectedCourseId);
  const selectedInvoice = invoices.find((i) => i.id === selectedInvoiceId);

  const generateActHTML = (): string => {
    if (!selectedCompany || !selectedCourse) return "";
    const priceNum = parseFloat(price) || 0;
    const totalPrice = priceNum * parseInt(studentsCount);
    const dateFormatted = format(new Date(actDate), "d MMMM yyyy г.", { locale: ru });
    const contractDateFormatted = contractDate ? format(new Date(contractDate), "d MMMM yyyy г.", { locale: ru }) : "";
    const orgIsIP = isIP(orgRequisites.name);
    const orgGender = detectGender(orgRequisites.director_name);
    const orgDirectorGenitive = declineFullName(orgRequisites.director_name);
    const orgActing = orgGender === 'female' ? 'именуемая' : 'именуемый';

    return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Акт №${actNumber}</title><style>@page{margin:2cm}body{font-family:'Times New Roman',Times,serif;font-size:12pt;line-height:1.5;color:#000}.title{font-size:14pt;font-weight:bold;text-align:center;margin:20px 0}.subtitle{text-align:center;margin-bottom:30px}.parties{display:flex;justify-content:space-between;margin-bottom:20px}.party{width:48%}.party-title{font-weight:bold;margin-bottom:5px}.content{margin:20px 0;text-align:justify}.items-table{width:100%;border-collapse:collapse;margin:20px 0}.items-table th,.items-table td{border:1px solid #000;padding:8px}.items-table th{background:#f5f5f5;font-weight:bold;text-align:center}.total-section{margin:20px 0}.signatures-table{width:100%;margin-top:50px;page-break-inside:avoid;break-inside:avoid;border:none;border-collapse:collapse}.signatures-table td{width:50%;vertical-align:top;padding:0 10px;border:none}.signature-title{font-weight:bold;margin-bottom:10px}.sig-facsimile{position:relative;height:120px;margin:10px 0}.sig-facsimile img{position:absolute}.signature-line{border-bottom:1px solid #000;margin-top:0}@media print{.signatures-table{page-break-inside:avoid;break-inside:avoid}}</style></head><body>
<div class="title">АКТ № ${actNumber}</div>
<div class="subtitle">сдачи-приёмки оказанных услуг<br>${contractNumber ? `к Счёту № ${contractNumber} от ${contractDateFormatted}` : ''}</div>
<div style="text-align:right;margin-bottom:20px">г. ${orgRequisites.actual_address?.split(',')[0] || 'Москва'}, ${dateFormatted}</div>
<div class="parties"><div class="party"><div class="party-title">Исполнитель:</div><div>${orgRequisites.name}</div><div>ИНН: ${orgRequisites.inn}${!orgIsIP ? `, КПП: ${orgRequisites.kpp}` : ''}</div></div><div class="party"><div class="party-title">Заказчик:</div><div>${selectedCompany.name}</div><div>ИНН: ${selectedCompany.inn || '—'}${selectedCompany.kpp ? `, КПП: ${selectedCompany.kpp}` : ''}</div></div></div>
<div class="content"><p>Мы, нижеподписавшиеся, ${orgRequisites.director_position} ${orgRequisites.name} ${orgDirectorGenitive}, ${orgActing} в дальнейшем «Исполнитель», с одной стороны, и ${selectedCompany.director || 'представитель'} ${selectedCompany.name}, именуемый в дальнейшем «Заказчик», с другой стороны, составили настоящий Акт о нижеследующем:</p></div>
<table class="items-table"><thead><tr><th style="width:40px">№</th><th>Наименование услуги</th><th style="width:60px">Кол-во</th><th style="width:50px">Ед.</th><th style="width:120px">Цена, руб.</th><th style="width:120px">Сумма, руб.</th></tr></thead><tbody><tr><td style="text-align:center">1</td><td>Образовательные услуги по программе «${selectedCourse.title}»${selectedCourse.duration ? ` (${selectedCourse.duration})` : ''}</td><td style="text-align:center">${studentsCount}</td><td style="text-align:center">чел.</td><td style="text-align:right">${formatPrice(price)}</td><td style="text-align:right">${formatPrice(String(totalPrice))}</td></tr></tbody><tfoot><tr><td colspan="5" style="text-align:right;font-weight:bold">ИТОГО:</td><td style="text-align:right;font-weight:bold">${formatPrice(String(totalPrice))}</td></tr><tr><td colspan="5" style="text-align:right">Без НДС</td><td style="text-align:right">—</td></tr></tfoot></table>
<div class="total-section"><p><strong>Всего оказано услуг на сумму: ${formatPrice(String(totalPrice))} (${numberToWords(totalPrice)}) рублей 00 копеек.</strong></p><p>Вышеперечисленные услуги выполнены полностью и в срок. Заказчик претензий по объёму, качеству и срокам оказания услуг не имеет.</p></div>
<table class="signatures-table"><tr><td><div class="signature-title">ИСПОЛНИТЕЛЬ:</div><div>${orgRequisites.name}</div><div class="sig-facsimile">${orgRequisites.signature_url ? `<img src="${orgRequisites.signature_url}" alt="Подпись" style="width:140px;height:auto;left:0;top:0">` : ''}${orgRequisites.stamp_url ? `<img src="${orgRequisites.stamp_url}" alt="Печать" style="width:110px;height:auto;left:90px;top:-10px;opacity:0.85">` : ''}</div><div class="signature-line"></div><div style="margin-top:5px">${orgRequisites.director_position} / ${orgRequisites.director_name} /</div></td><td><div class="signature-title">ЗАКАЗЧИК:</div><div>${selectedCompany.name}</div><div style="height:120px"></div><div class="signature-line"></div><div style="margin-top:5px">${selectedCompany.director || '_______________'} / _________________ /</div></td></tr></table>
</body></html>`;
  };

  const handleGenerate = async () => {
    if (!selectedCompanyId && !preselectedCompany) { toast.error("Выберите компанию"); return; }
    if (!selectedCourseId) { toast.error("Выберите курс"); return; }
    if (!price || parseFloat(price) <= 0) { toast.error("Укажите стоимость"); return; }
    setIsGenerating(true);
    try { printHtml(generateActHTML()); toast.success("Акт сформирован"); }
    catch (error) { console.error(error); toast.error("Ошибка генерации акта"); }
    finally { setIsGenerating(false); }
  };

  const handleDownloadDOC = () => {
    if (!selectedCompany || !selectedCourseId) { toast.error("Заполните все поля"); return; }
    downloadAsDoc(generateActHTML(), `Акт ${actNumber}`, `Акт_${actNumber}_${selectedCompany?.name || 'компания'}.doc`);
    toast.success("Акт скачан");
  };

  const handleSave = async (onSave?: (html: string, actNumber: string, companyName: string, amount: number) => Promise<void>, onClose?: () => void) => {
    if (!selectedCompany || !selectedCourseId || !price) { toast.error("Заполните все поля"); return; }
    if (!onSave) { toast.error("Сохранение недоступно"); return; }
    setIsSaving(true);
    try {
      const html = generateActHTML();
      const totalPrice = parseFloat(price) * parseInt(studentsCount);
      await onSave(html, actNumber, selectedCompany.name, totalPrice);
      toast.success("Акт сохранён");
      onClose?.();
    } catch (error) { console.error(error); toast.error("Ошибка сохранения"); }
    finally { setIsSaving(false); }
  };

  const openPreview = () => { setPreviewHtml(generateActHTML()); setMode('preview'); };

  return {
    companies, courses, invoices, isLoading, isGenerating, isSaving,
    mode, setMode, previewHtml,
    selectedCompanyId, setSelectedCompanyId, selectedCourseId, setSelectedCourseId,
    selectedInvoiceId, setSelectedInvoiceId,
    actNumber, setActNumber, actDate, setActDate,
    contractNumber, setContractNumber, contractDate, setContractDate,
    studentsCount, setStudentsCount, price, setPrice,
    selectedCompany, selectedCourse, selectedInvoice,
    handleGenerate, handleDownloadDOC, handleSave, openPreview, formatPrice,
  };
}
