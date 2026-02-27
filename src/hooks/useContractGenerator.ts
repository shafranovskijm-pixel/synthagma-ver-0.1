import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface Company {
  id: string; name: string; inn: string | null; kpp: string | null; ogrn: string | null; address: string | null; director: string | null;
}
interface Course {
  id: string; title: string; duration: string | null;
}
interface OrgRequisites {
  name: string; inn: string; kpp: string; ogrn: string; legal_address: string; actual_address: string;
  director_name: string; director_position: string; bank_name: string; bank_bik: string; bank_account: string; bank_corr_account: string;
  stamp_url?: string | null; signature_url?: string | null;
}

interface UseContractGeneratorProps {
  organizationId: string; isOpen: boolean; orgRequisites: OrgRequisites; preselectedCompany?: Company | null;
  onSave?: (html: string, contractNumber: string, companyName: string, courseId: string, amount: number, studentsCount: number, contractDate: string) => Promise<void>;
  onClose: () => void;
}

export function useContractGenerator({ organizationId, isOpen, orgRequisites, preselectedCompany, onSave, onClose }: UseContractGeneratorProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [contractNumber, setContractNumber] = useState("");
  const [contractDate, setContractDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [studentsCount, setStudentsCount] = useState("1");
  const [price, setPrice] = useState("");
  const [additionalTerms, setAdditionalTerms] = useState("");

  useEffect(() => {
    if (preselectedCompany && isOpen) setSelectedCompanyId(preselectedCompany.id);
  }, [preselectedCompany, isOpen]);

  useEffect(() => {
    const loadData = async () => {
      if (!organizationId || !isOpen) return;
      setIsLoading(true);
      try {
        const [companiesRes, coursesRes] = await Promise.all([
          supabase.from("companies").select("id, name, inn, kpp, ogrn, address, director").eq("organization_id", organizationId).order("name"),
          supabase.from("courses").select("id, title, duration").eq("organization_id", organizationId).eq("is_published", true).order("title"),
        ]);
        if (companiesRes.error) throw companiesRes.error;
        if (coursesRes.error) throw coursesRes.error;
        setCompanies(companiesRes.data || []);
        setCourses(coursesRes.data || []);
        const today = new Date();
        setContractNumber(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`);
      } catch (error) { console.error("Error loading data:", error); toast.error("Ошибка загрузки данных"); }
      finally { setIsLoading(false); }
    };
    loadData();
  }, [organizationId, isOpen]);

  const selectedCompany = preselectedCompany || companies.find(c => c.id === selectedCompanyId);
  const selectedCourse = courses.find(c => c.id === selectedCourseId);

  const formatPrice = (value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return "0";
    return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
  };

  // Detect gender by patronymic
  const detectGender = (fullName: string): 'male' | 'female' => {
    const parts = fullName.trim().split(/\s+/);
    const patronymic = parts.length >= 3 ? parts[2] : parts.length >= 2 ? parts[1] : '';
    const lower = patronymic.toLowerCase();
    if (lower.endsWith('вна') || lower.endsWith('чна') || lower.endsWith('ична') || lower.endsWith('инична')) {
      return 'female';
    }
    return 'male';
  };

  // Decline a single Russian name word to genitive case
  const declineWordToGenitive = (word: string): string => {
    if (!word || word.length < 2) return word;
    // Keep initials as-is (e.g. "И.И.")
    if (/^[А-ЯЁA-Z]\./.test(word)) return word;
    
    const lower = word.toLowerCase();
    const original = word;
    
    // Patronymics
    if (lower.endsWith('ович')) return original.slice(0, -2) + 'ича';
    if (lower.endsWith('евич')) return original.slice(0, -2) + 'ича';
    if (lower.endsWith('ич') && lower.length > 4) return original + 'а';
    if (lower.endsWith('овна')) return original.slice(0, -1) + 'ы';
    if (lower.endsWith('евна')) return original.slice(0, -1) + 'ы';
    if (lower.endsWith('ична')) return original.slice(0, -1) + 'ы';
    if (lower.endsWith('инична')) return original.slice(0, -1) + 'ы';
    
    // Female surnames ending in -ая, -яя
    if (lower.endsWith('ая') && lower.length > 3) return original.slice(0, -2) + 'ой';
    if (lower.endsWith('яя') && lower.length > 3) return original.slice(0, -2) + 'ей';
    
    // Female surnames ending in -ва, -на, -ка (Иванова -> Ивановой)
    if ((lower.endsWith('ова') || lower.endsWith('ева') || lower.endsWith('ёва')) && lower.length > 4) {
      return original.slice(0, -1) + 'ой';
    }
    if (lower.endsWith('ина') && lower.length > 4) return original.slice(0, -1) + 'ой';
    
    // Male surnames ending in consonant + add "а"
    if (lower.endsWith('ов') || lower.endsWith('ев') || lower.endsWith('ёв')) return original + 'а';
    if (lower.endsWith('ин') && lower.length > 3) return original + 'а';
    if (lower.endsWith('ий') && lower.length > 3) return original.slice(0, -2) + 'ого';
    if (lower.endsWith('ый') && lower.length > 3) return original.slice(0, -2) + 'ого';
    if (lower.endsWith('ой') && lower.length > 3) return original.slice(0, -2) + 'ого';
    
    // Female first names
    if (lower.endsWith('а') && !lower.endsWith('ша') && !lower.endsWith('ща')) return original.slice(0, -1) + 'ы';
    if (lower.endsWith('ша') || lower.endsWith('ща') || lower.endsWith('ча') || lower.endsWith('жа')) return original.slice(0, -1) + 'и';
    if (lower.endsWith('я')) return original.slice(0, -1) + 'и';
    if (lower.endsWith('ь') && lower.length > 3) return original.slice(0, -1) + 'и';
    
    // Male first names ending in consonant
    const lastChar = lower.slice(-1);
    if (/[бвгджзклмнпрстфхцчшщ]/.test(lastChar)) return original + 'а';
    
    return original;
  };

  // Decline full name (Фамилия Имя Отчество) to genitive
  const declineFullNameToGenitive = (fullName: string): string => {
    const parts = fullName.trim().split(/\s+/);
    return parts.map(p => declineWordToGenitive(p)).join(' ');
  };

  const isIP = (name: string): boolean => {
    return name.trim().toUpperCase().startsWith('ИП');
  };

  const numberToWords = (num: number): string => {
    const ones = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
    const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
    const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
    const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
    const thousands = ['тысяча', 'тысячи', 'тысяч'];
    const millions = ['миллион', 'миллиона', 'миллионов'];
    if (num === 0) return 'ноль';
    const getHundreds = (n: number): string => {
      let result = '';
      if (n >= 100) { result += hundreds[Math.floor(n / 100)] + ' '; n %= 100; }
      if (n >= 20) { result += tens[Math.floor(n / 10)] + ' '; n %= 10; } else if (n >= 10) { result += teens[n - 10] + ' '; return result.trim(); }
      if (n > 0) result += ones[n] + ' ';
      return result.trim();
    };
    let result = '';
    const intPart = Math.floor(num);
    if (intPart >= 1000000) { const mil = Math.floor(intPart / 1000000); result += getHundreds(mil) + ' ' + millions[mil === 1 ? 0 : mil < 5 ? 1 : 2] + ' '; }
    if (intPart >= 1000) {
      const thou = Math.floor((intPart % 1000000) / 1000);
      if (thou > 0) {
        let thouStr = getHundreds(thou);
        if (thou % 10 === 1 && thou % 100 !== 11) thouStr = thouStr.replace('один', 'одна');
        else if (thou % 10 === 2 && thou % 100 !== 12) thouStr = thouStr.replace('два', 'две');
        result += thouStr + ' ' + thousands[thou % 10 === 1 && thou % 100 !== 11 ? 0 : thou % 10 >= 2 && thou % 10 <= 4 && (thou % 100 < 10 || thou % 100 >= 20) ? 1 : 2] + ' ';
      }
    }
    const lastThree = intPart % 1000;
    if (lastThree > 0 || intPart === 0) result += getHundreds(lastThree);
    return result.trim();
  };

  const generateContractHTML = (): string => {
    if (!selectedCompany || !selectedCourse) return "";
    const priceNum = parseFloat(price) || 0;
    const totalPrice = priceNum * parseInt(studentsCount);
    const dateFormatted = format(new Date(contractDate), "«d» MMMM yyyy г.", { locale: ru });

    const orgIsIP = isIP(orgRequisites.name);
    const orgGender = detectGender(orgRequisites.director_name);
    const orgDirectorNameGenitive = declineFullNameToGenitive(orgRequisites.director_name);
    const orgActing = orgGender === 'female' ? 'действующей' : 'действующего';

    const orgRepresentationBlock = orgIsIP
      ? ''
      : `, в лице ${orgRequisites.director_position} ${orgDirectorNameGenitive}, ${orgActing} на основании Устава,`;

    const companyIsIP = isIP(selectedCompany.name);
    const companyDirector = selectedCompany.director || 'Генерального директора';
    const companyRepresentationBlock = companyIsIP
      ? ''
      : `, в лице ${companyDirector}, действующего на основании Устава,`;

    // Same HTML template as original - abbreviated for brevity
    return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Договор №${contractNumber}</title><style>@page{margin:2cm}*{box-sizing:border-box}body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;color:#000;margin:0;padding:20px;background:#fff}.header{text-align:center;margin-bottom:20px}.title{font-size:14pt;font-weight:bold;margin:20px 0;text-align:center}.parties{margin-bottom:20px;text-align:justify}.section{margin:15px 0}.section-title{font-weight:bold;margin-bottom:10px}.item{margin-left:20px;margin-bottom:5px;text-align:justify}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #000;padding:5px 8px;text-align:left}th{background:#f0f0f0}.requisites{font-size:10pt;margin-top:20px}.requisites td{border:none;vertical-align:top;padding:3px 10px}.signature-area{position:relative;min-height:100px;margin-top:10px}.signature-images{position:relative;height:80px;margin-bottom:10px}.signature-images img{position:absolute}.signature-line{border-top:1px solid #000;padding-top:5px;margin-top:60px}</style></head><body><div class="header"><div class="title">ДОГОВОР НА ОКАЗАНИЕ ОБРАЗОВАТЕЛЬНЫХ УСЛУГ</div><div>№ ${contractNumber} от ${dateFormatted}</div></div><div class="parties"><p><strong>${orgRequisites.name}</strong>, именуемое в дальнейшем «Исполнитель»${orgRepresentationBlock} с одной стороны, и</p><p><strong>${selectedCompany.name}</strong>, именуемое в дальнейшем «Заказчик»${companyRepresentationBlock} с другой стороны, заключили настоящий Договор о нижеследующем:</p></div><div class="section"><div class="section-title">1. ПРЕДМЕТ ДОГОВОРА</div><div class="item">1.1. Исполнитель обязуется оказать Заказчику образовательные услуги по программе «${selectedCourse.title}»${selectedCourse.duration ? ` продолжительностью ${selectedCourse.duration}` : ''}, а Заказчик обязуется оплатить эти услуги.</div><div class="item">1.2. Количество обучающихся: ${studentsCount} чел.</div></div><div class="section"><div class="section-title">2. СТОИМОСТЬ УСЛУГ И ПОРЯДОК РАСЧЁТОВ</div><div class="item">2.1. Стоимость обучения одного слушателя составляет ${formatPrice(price)} (${numberToWords(priceNum)}) рублей.</div><div class="item">2.2. Общая стоимость услуг по настоящему Договору составляет ${formatPrice(String(totalPrice))} (${numberToWords(totalPrice)}) рублей.</div><div class="item">2.3. Оплата производится путём перечисления денежных средств на расчётный счёт Исполнителя в течение 5 (пяти) банковских дней с момента подписания настоящего Договора.</div></div><div class="section"><div class="section-title">3. ПРАВА И ОБЯЗАННОСТИ СТОРОН</div><div class="item">3.1. Исполнитель обязуется:</div><div class="item" style="margin-left:40px">- обеспечить качественное проведение обучения;</div><div class="item" style="margin-left:40px">- предоставить необходимые учебные материалы;</div><div class="item" style="margin-left:40px">- выдать документы об обучении установленного образца.</div><div class="item">3.2. Заказчик обязуется:</div><div class="item" style="margin-left:40px">- своевременно оплатить услуги;</div><div class="item" style="margin-left:40px">- обеспечить явку обучающихся.</div></div><div class="section"><div class="section-title">4. СРОК ДЕЙСТВИЯ ДОГОВОРА</div><div class="item">4.1. Настоящий Договор вступает в силу с момента подписания и действует до полного исполнения сторонами своих обязательств.</div></div>${additionalTerms ? `<div class="section"><div class="section-title">5. ДОПОЛНИТЕЛЬНЫЕ УСЛОВИЯ</div><div class="item">${additionalTerms}</div></div>` : ''}<div class="section"><div class="section-title">${additionalTerms ? '6' : '5'}. РЕКВИЗИТЫ И ПОДПИСИ СТОРОН</div><table class="requisites"><tr><td style="width:50%"><strong>ИСПОЛНИТЕЛЬ:</strong><br><br>${orgRequisites.name}<br>ИНН: ${orgRequisites.inn}<br>${!orgIsIP ? `КПП: ${orgRequisites.kpp}<br>` : ''}ОГРН: ${orgRequisites.ogrn}<br>Адрес: ${orgRequisites.legal_address}<br>Банк: ${orgRequisites.bank_name}<br>БИК: ${orgRequisites.bank_bik}<br>Р/с: ${orgRequisites.bank_account}<br>К/с: ${orgRequisites.bank_corr_account}<br><br>${orgRequisites.director_position}<br><div class="signature-area"><div class="signature-images">${orgRequisites.signature_url ? `<img src="${orgRequisites.signature_url}" alt="Подпись" style="max-height:60px;max-width:150px;left:0;top:0">` : ''}${orgRequisites.stamp_url ? `<img src="${orgRequisites.stamp_url}" alt="Печать" style="max-height:90px;max-width:90px;left:70px;top:-15px;opacity:.9">` : ''}</div><div class="signature-line">_______________ / ${orgRequisites.director_name} /</div></div></td><td style="width:50%"><strong>ЗАКАЗЧИК:</strong><br><br>${selectedCompany.name}<br>ИНН: ${selectedCompany.inn || '_______________'}<br>${!companyIsIP ? `КПП: ${selectedCompany.kpp || '_______________'}<br>` : ''}ОГРН: ${selectedCompany.ogrn || '_______________'}<br>Адрес: ${selectedCompany.address || '_______________'}<br><br><br><br><br><br>${selectedCompany.director || 'Генеральный директор'}<br><div class="signature-area"><div class="signature-line" style="margin-top:80px">_______________ / _________________ /</div></div></td></tr></table></div></body></html>`;
  };

  const handleGenerate = async () => {
    if (!selectedCompanyId) { toast.error("Выберите компанию"); return; }
    if (!selectedCourseId) { toast.error("Выберите курс"); return; }
    if (!price || parseFloat(price) <= 0) { toast.error("Укажите стоимость"); return; }
    setIsGenerating(true);
    try {
      const html = generateContractHTML();
      const printWindow = window.open('', '_blank');
      if (printWindow) { printWindow.document.write(html); printWindow.document.close(); printWindow.focus(); setTimeout(() => printWindow.print(), 500); }
      toast.success("Договор сформирован");
    } catch (error) { console.error("Error:", error); toast.error("Ошибка генерации"); }
    finally { setIsGenerating(false); }
  };

  const handleDownloadDOC = () => {
    if (!selectedCompany || !selectedCourseId) { toast.error("Заполните все обязательные поля"); return; }
    const html = generateContractHTML();
    const docContent = `<!DOCTYPE html><html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset="utf-8"><meta name="ProgId" content="Word.Document"><title>Договор ${contractNumber}</title><style>@page{size:A4;margin:2cm}body{font-family:'Times New Roman',serif;font-size:14pt;line-height:1.5}</style></head><body>${html.replace(/<html[^>]*>|<\/html>|<head>[\s\S]*?<\/head>|<body[^>]*>|<\/body>|<!DOCTYPE[^>]*>/gi, '')}</body></html>`;
    const blob = new Blob([docContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `Договор_${contractNumber}_${selectedCompany?.name || 'компания'}.doc`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
    toast.success("Договор скачан в формате DOC");
  };

  const handleSaveContract = async () => {
    if (!selectedCompany || !selectedCourseId || !price) { toast.error("Заполните все обязательные поля"); return; }
    if (!onSave) { toast.error("Сохранение недоступно"); return; }
    setIsSaving(true);
    try {
      const html = generateContractHTML();
      const totalAmount = parseFloat(price) * parseInt(studentsCount);
      await onSave(html, contractNumber, selectedCompany.name, selectedCourseId, totalAmount, parseInt(studentsCount), contractDate);
      toast.success("Договор сохранён"); onClose();
    } catch (error) { console.error("Error:", error); toast.error("Ошибка сохранения"); }
    finally { setIsSaving(false); }
  };

  const handlePreview = () => {
    if (!selectedCompany || !selectedCourseId || !price) { toast.error("Заполните все обязательные поля"); return; }
    setPreviewHtml(generateContractHTML()); setShowPreview(true);
  };

  return {
    companies, courses, isLoading, isGenerating, isSaving,
    showPreview, setShowPreview, previewHtml,
    selectedCompanyId, setSelectedCompanyId, selectedCourseId, setSelectedCourseId,
    contractNumber, setContractNumber, contractDate, setContractDate,
    studentsCount, setStudentsCount, price, setPrice,
    additionalTerms, setAdditionalTerms,
    selectedCompany, selectedCourse, formatPrice,
    handleGenerate, handleDownloadDOC, handleSaveContract, handlePreview,
    onSave,
  };
}
