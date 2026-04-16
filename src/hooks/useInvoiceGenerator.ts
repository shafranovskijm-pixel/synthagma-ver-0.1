import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import {
  formatPrice, numberToWords, downloadAsDoc, printHtml,
  type OrgRequisites, type DocumentCompany, type DocumentCourse,
} from "@/utils/documentHelpers";

interface Contract {
  id: string;
  name: string;
  contract_number: string | null;
  uploaded_at: string;
  amount: number | null;
  students_count: number | null;
  contract_date: string | null;
  course_id: string | null;
}

export function useInvoiceGenerator(
  organizationId: string,
  isOpen: boolean,
  orgRequisites: OrgRequisites,
  preselectedCompany?: DocumentCompany | null,
) {
  const [companies, setCompanies] = useState<DocumentCompany[]>([]);
  const [courses, setCourses] = useState<DocumentCourse[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [mode, setMode] = useState<'choosing' | 'contract' | 'manual' | 'preview' | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");

  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedContractId, setSelectedContractId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [studentsCount, setStudentsCount] = useState("1");
  const [price, setPrice] = useState("");

  useEffect(() => {
    if (preselectedCompany && isOpen) setSelectedCompanyId(preselectedCompany.id);
  }, [preselectedCompany, isOpen]);

  useEffect(() => {
    if (!isOpen) { setMode(null); setSelectedContractId(""); setSelectedCourseId(""); setPrice(""); setStudentsCount("1"); }
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
          const { data: contractsData } = await supabase.from("company_documents").select("id, name, contract_number, uploaded_at, amount, students_count, contract_date, course_id").eq("company_id", companyId).eq("type", "contract").order("uploaded_at", { ascending: false });
          setContracts(contractsData || []);
          if (!contractsData?.length) setMode('manual');
        } else { setMode('manual'); }

        const today = new Date();
        setInvoiceNumber(`SCH-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`);
      } catch (error) { console.error(error); toast.error("Ошибка загрузки данных"); }
      finally { setIsLoading(false); }
    };
    loadData();
  }, [organizationId, isOpen, preselectedCompany?.id, selectedCompanyId]);

  useEffect(() => {
    if (selectedContractId && mode === 'contract') {
      const contract = contracts.find(c => c.id === selectedContractId);
      if (contract) {
        if (contract.course_id) setSelectedCourseId(contract.course_id);
        if (contract.amount) { const studCount = contract.students_count || 1; setPrice(String(contract.amount / studCount)); }
        if (contract.students_count) setStudentsCount(String(contract.students_count));
      }
    }
  }, [selectedContractId, mode, contracts]);

  const selectedCompany = preselectedCompany || companies.find((c) => c.id === selectedCompanyId);
  const selectedCourse = courses.find((c) => c.id === selectedCourseId);
  const selectedContract = contracts.find((c) => c.id === selectedContractId);

  const getContractInfo = () => {
    if (!selectedContract) return null;
    let contractDate = selectedContract.contract_date ? format(new Date(selectedContract.contract_date), "dd.MM.yyyy") : null;
    if (!contractDate) {
      const dateMatch = selectedContract.name.match(/от\s+(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4})/i);
      contractDate = dateMatch ? dateMatch[1] : format(new Date(selectedContract.uploaded_at), "dd.MM.yyyy");
    }
    const contractNum = selectedContract.contract_number || selectedContract.name.match(/№?\s*(\d+[-\/]?\d*)/)?.[1] || "б/н";
    return { number: contractNum, date: contractDate };
  };

  const generateInvoiceHTML = (): string => {
    if (!selectedCompany || !selectedCourse) return "";
    const priceNum = parseFloat(price) || 0;
    const totalPrice = priceNum * parseInt(studentsCount);
    const dateFormatted = format(new Date(invoiceDate), "d MMMM yyyy г.", { locale: ru });
    const contractInfo = getContractInfo();

    return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Счёт №${invoiceNumber}</title><style>@page{margin:1.5cm}*{box-sizing:border-box}body{font-family:'Times New Roman',Times,serif;font-size:11pt;line-height:1.4;color:#000;margin:0;padding:20px;background:white}.header{margin-bottom:20px}.bank-details{border-collapse:collapse;width:100%;margin-bottom:20px;table-layout:fixed}.bank-details td{border:1px solid #000;padding:6px 8px;font-size:10pt;vertical-align:top}.bank-details .bank-cell{width:50%}.bank-details .label-cell{width:15%;text-align:right}.bank-details .value-cell{width:35%}.title{font-size:14pt;font-weight:bold;margin:20px 0 15px 0;text-align:center}.info-row{margin-bottom:8px;text-align:justify}.info-label{font-weight:bold}.items-table{width:100%;border-collapse:collapse;margin:20px 0;table-layout:fixed}.items-table th,.items-table td{border:1px solid #000;padding:8px 10px;vertical-align:middle}.items-table th{background:#f5f5f5;font-weight:bold;text-align:center}.items-table .num{width:8%;text-align:center}.items-table .name{width:40%;text-align:left}.items-table .qty{width:10%;text-align:center}.items-table .unit{width:10%;text-align:center}.items-table .price{width:16%;text-align:right}.items-table .total{width:16%;text-align:right}.total-row td{font-weight:bold}.summary{margin-top:20px}.footer{margin-top:40px}.signature-wrapper{position:relative;display:flex;align-items:center;gap:10px;min-height:80px}.signature-images{position:relative;width:200px;height:80px}.signature-images img{position:absolute}.signature-line{border-bottom:1px solid #000;width:150px;display:inline-block}</style></head><body>
<div class="header"><table class="bank-details"><tr><td rowspan="2" class="bank-cell"><div style="margin-bottom:5px;font-weight:bold">${orgRequisites.bank_name || 'Банк не указан'}</div><div style="font-size:9pt;color:#666">Банк получателя</div></td><td class="label-cell">БИК</td><td class="value-cell">${orgRequisites.bank_bik || '—'}</td></tr><tr><td class="label-cell">К/с</td><td class="value-cell">${orgRequisites.bank_corr_account || '—'}</td></tr><tr><td class="bank-cell"><div>ИНН ${orgRequisites.inn || '—'} КПП ${orgRequisites.kpp || '—'}</div><div style="margin-top:5px;font-weight:bold">${orgRequisites.name || 'Организация не указана'}</div><div style="font-size:9pt;color:#666">Получатель</div></td><td class="label-cell">Р/с</td><td class="value-cell">${orgRequisites.bank_account || '—'}</td></tr></table></div>
<div class="title">СЧЁТ № ${invoiceNumber} от ${dateFormatted}</div>
<div class="info-row"><span class="info-label">Поставщик:</span> ${orgRequisites.name}, ИНН ${orgRequisites.inn}, КПП ${orgRequisites.kpp}, ${orgRequisites.legal_address}</div>
<div class="info-row"><span class="info-label">Покупатель:</span> ${selectedCompany.name}${selectedCompany.inn ? `, ИНН ${selectedCompany.inn}` : ''}${selectedCompany.kpp ? `, КПП ${selectedCompany.kpp}` : ''}${selectedCompany.address ? `, ${selectedCompany.address}` : ''}</div>
${contractInfo ? `<div class="info-row"><span class="info-label">Основание:</span> Договор №${contractInfo.number} от ${contractInfo.date}</div>` : ''}
<table class="items-table"><thead><tr><th class="num">№</th><th class="name">Наименование</th><th class="qty">Кол-во</th><th class="unit">Ед.</th><th class="price">Цена</th><th class="total">Сумма</th></tr></thead><tbody><tr><td class="num">1</td><td class="name">Образовательные услуги по программе «${selectedCourse.title}»${selectedCourse.duration ? ` (${selectedCourse.duration})` : ''}</td><td class="qty">${studentsCount}</td><td class="unit">чел.</td><td class="price">${formatPrice(price)}</td><td class="total">${formatPrice(String(totalPrice))}</td></tr></tbody><tfoot><tr class="total-row"><td colspan="5" style="text-align:right;border:none">Итого:</td><td class="total">${formatPrice(String(totalPrice))}</td></tr><tr class="total-row"><td colspan="5" style="text-align:right;border:none">Без НДС</td><td class="total" style="border-top:none">—</td></tr><tr class="total-row"><td colspan="5" style="text-align:right;border:none">Всего к оплате:</td><td class="total" style="border-top:none">${formatPrice(String(totalPrice))}</td></tr></tfoot></table>
<div class="summary"><strong>Всего наименований ${studentsCount}, на сумму ${formatPrice(String(totalPrice))} руб.</strong><br><strong>${numberToWords(totalPrice)} рублей 00 копеек</strong></div>
<div class="footer"><div class="signature-wrapper"><span>${orgRequisites.director_position}</span><div class="signature-images">${orgRequisites.signature_url ? `<img src="${orgRequisites.signature_url}" alt="Подпись" style="max-height:50px;max-width:120px;left:0;top:15px">` : ''}${orgRequisites.stamp_url ? `<img src="${orgRequisites.stamp_url}" alt="Печать" style="max-height:80px;max-width:80px;left:60px;top:0;opacity:0.85">` : ''}</div><span class="signature-line"></span><span>/ ${orgRequisites.director_name} /</span></div></div>
</body></html>`;
  };

  const handleGenerate = async () => {
    if (!selectedCompanyId && !preselectedCompany) { toast.error("Выберите компанию"); return; }
    if (!selectedCourseId) { toast.error("Выберите курс"); return; }
    if (!price || parseFloat(price) <= 0) { toast.error("Укажите стоимость"); return; }
    setIsGenerating(true);
    try { printHtml(generateInvoiceHTML()); toast.success("Счёт сформирован"); }
    catch (error) { console.error(error); toast.error("Ошибка генерации счёта"); }
    finally { setIsGenerating(false); }
  };

  const handleDownloadDOC = () => {
    if (!selectedCompany || !selectedCourseId) { toast.error("Заполните все поля"); return; }
    downloadAsDoc(generateInvoiceHTML(), `Счёт ${invoiceNumber}`, `Счёт_${invoiceNumber}_${selectedCompany?.name || 'компания'}.doc`);
    toast.success("Счёт скачан");
  };

  const handleSave = async (onSave?: (html: string, invoiceNumber: string, companyName: string, amount: number, contractId?: string) => Promise<void>, onClose?: () => void) => {
    if (!selectedCompany || !selectedCourseId || !price) { toast.error("Заполните все поля"); return; }
    if (!onSave) { toast.error("Сохранение недоступно"); return; }
    setIsSaving(true);
    try {
      const html = generateInvoiceHTML();
      const totalPrice = parseFloat(price) * parseInt(studentsCount);
      await onSave(html, invoiceNumber, selectedCompany.name, totalPrice, selectedContractId || undefined);
      toast.success("Счёт сохранён");
      onClose?.();
    } catch (error) { console.error(error); toast.error("Ошибка сохранения"); }
    finally { setIsSaving(false); }
  };

  const openPreview = () => { setPreviewHtml(generateInvoiceHTML()); setMode('preview'); };

  return {
    companies, courses, contracts, isLoading, isGenerating, isSaving,
    mode, setMode, previewHtml,
    selectedCompanyId, setSelectedCompanyId, selectedCourseId, setSelectedCourseId,
    selectedContractId, setSelectedContractId,
    invoiceNumber, setInvoiceNumber, invoiceDate, setInvoiceDate,
    studentsCount, setStudentsCount, price, setPrice,
    selectedCompany, selectedCourse, selectedContract,
    handleGenerate, handleDownloadDOC, handleSave, openPreview, formatPrice,
  };
}
