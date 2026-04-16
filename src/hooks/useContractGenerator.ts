import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { formatPrice, detectGender, declineFullNameToGenitive, isIP, numberToWords } from "@/utils/russianTextUtils";

interface Company {
  id: string; name: string; inn: string | null; kpp: string | null; ogrn: string | null; address: string | null; director: string | null;
}
interface Course {
  id: string; title: string; duration: string | null; frdo_duration_hours: number | null;
}
interface OrgRequisites {
  name: string; inn: string; kpp: string; ogrn: string; legal_address: string; actual_address: string;
  director_name: string; director_position: string; bank_name: string; bank_bik: string; bank_account: string; bank_corr_account: string;
  stamp_url?: string | null; signature_url?: string | null;
}

const DEFAULT_TEMPLATE = `ДОГОВОР НА ОКАЗАНИЕ ОБРАЗОВАТЕЛЬНЫХ УСЛУГ

№ {{contract_number}} от {{contract_date}}

{{org_name}}, именуемое в дальнейшем «Исполнитель», в лице {{org_director_position}} {{org_director_name_genitive}}, {{org_director_acting}} на основании Устава, с одной стороны, и

{{company_name}}, именуемое в дальнейшем «Заказчик», в лице {{company_director}}, действующего на основании Устава, с другой стороны, заключили настоящий Договор о нижеследующем:

1. ПРЕДМЕТ ДОГОВОРА

1.1. Исполнитель обязуется оказать Заказчику образовательные услуги по программе «{{course_title}}»{{course_duration}}, а Заказчик обязуется оплатить эти услуги.

1.2. Количество обучающихся: {{students_count}} чел.

2. СТОИМОСТЬ УСЛУГ И ПОРЯДОК РАСЧЁТОВ

2.1. Стоимость обучения одного слушателя составляет {{price}} ({{total_price_words}}) рублей.

2.2. Общая стоимость услуг по настоящему Договору составляет {{total_price}} ({{total_price_words}}) рублей.

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

export interface SelectedProgram {
  courseId: string;
  price: string;
  studentsCount: string;
}

export type CounterpartyType = 'company' | 'individual';

export interface IndividualData {
  fullName: string;
  passport: string;
  address: string;
  phone: string;
  email: string;
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
  const [counterpartyType, setCounterpartyType] = useState<CounterpartyType>('company');
  const [individualData, setIndividualData] = useState<IndividualData>({ fullName: '', passport: '', address: '', phone: '', email: '' });
  const [selectedPrograms, setSelectedPrograms] = useState<SelectedProgram[]>([{ courseId: "", price: "", studentsCount: "1" }]);
  const [contractNumber, setContractNumber] = useState("");
  const [contractDate, setContractDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [additionalTerms, setAdditionalTerms] = useState("");
  const [serviceStartDate, setServiceStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [serviceEndDate, setServiceEndDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1); return format(d, "yyyy-MM-dd");
  });

  // Backward-compat aliases for first program
  const selectedCourseId = selectedPrograms[0]?.courseId || "";
  const setSelectedCourseId = (id: string) => updateProgram(0, { courseId: id });
  const price = selectedPrograms[0]?.price || "";
  const setPrice = (v: string) => updateProgram(0, { price: v });
  const studentsCount = selectedPrograms[0]?.studentsCount || "1";
  const setStudentsCount = (v: string) => updateProgram(0, { studentsCount: v });

  const addProgram = () => {
    setSelectedPrograms(prev => [...prev, { courseId: "", price: "", studentsCount: "1" }]);
  };
  const removeProgram = (index: number) => {
    setSelectedPrograms(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== index));
  };
  const updateProgram = (index: number, updates: Partial<SelectedProgram>) => {
    setSelectedPrograms(prev => prev.map((p, i) => i === index ? { ...p, ...updates } : p));
  };

  useEffect(() => {
    if (preselectedCompany && isOpen) setSelectedCompanyId(preselectedCompany.id);
  }, [preselectedCompany, isOpen]);

  const [savedTemplate, setSavedTemplate] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!organizationId || !isOpen) return;
      setIsLoading(true);
      try {
        const [companiesRes, coursesRes, orgRes] = await Promise.all([
          supabase.from("companies").select("id, name, inn, kpp, ogrn, address, director").eq("organization_id", organizationId).order("name"),
          supabase.from("courses").select("id, title, duration, frdo_duration_hours").eq("organization_id", organizationId).eq("is_published", true).order("title"),
          supabase.from("organizations").select("branding").eq("id", organizationId).single(),
        ]);
        if (companiesRes.error) throw companiesRes.error;
        if (coursesRes.error) throw coursesRes.error;
        setCompanies(companiesRes.data || []);
        setCourses(coursesRes.data || []);
        // Load saved contract template — prefer active template from constructor
        const branding = orgRes.data?.branding as Record<string, unknown> | null;
        if (branding?.contractTemplates && Array.isArray(branding.contractTemplates)) {
          const templates = branding.contractTemplates as Array<{ id: string; text: string; isBuiltIn?: boolean }>;
          const activeId = (branding.activeContractTemplateId as string) || "legal";
          const active = templates.find(t => t.id === activeId);
          if (active?.text) {
            setSavedTemplate(active.text);
          } else if (branding?.contractTemplate) {
            setSavedTemplate(branding.contractTemplate as string);
          }
        } else if (branding?.contractTemplate) {
          setSavedTemplate(branding.contractTemplate as string);
        }
        const today = new Date();
        setContractNumber(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`);
      } catch (error) { console.error("Error loading data:", error); toast.error("Ошибка загрузки данных"); }
      finally { setIsLoading(false); }
    };
    loadData();
  }, [organizationId, isOpen]);

  const selectedCompany = preselectedCompany || companies.find(c => c.id === selectedCompanyId);
  
  // For individuals, create a virtual "company" object
  const effectiveCounterparty = counterpartyType === 'individual' 
    ? (individualData.fullName ? { id: 'individual', name: individualData.fullName, inn: null, kpp: null, ogrn: null, address: individualData.address || null, director: null } as Company : null)
    : selectedCompany;

  // Russian text utilities are now imported from @/utils/russianTextUtils

  // Compute resolved programs with course data
  const resolvedPrograms = selectedPrograms.map(p => {
    const course = courses.find(c => c.id === p.courseId);
    const priceNum = parseFloat(p.price) || 0;
    const count = parseInt(p.studentsCount) || 0;
    return { ...p, course, priceNum, count, subtotal: priceNum * count };
  });

  const totalPrice = resolvedPrograms.reduce((sum, p) => sum + p.subtotal, 0);
  const totalStudents = resolvedPrograms.reduce((sum, p) => sum + p.count, 0);

  const generateProgramsTableHTML = (): string => {
    const rows = resolvedPrograms
      .filter(p => p.course)
      .map((p, i) => `<tr><td style="text-align:center">${i + 1}</td><td>${p.course!.title}</td><td style="text-align:center">${p.course!.frdo_duration_hours || p.course!.duration || '-'}</td><td style="text-align:center">${p.count}</td><td style="text-align:right">${formatPrice(p.price)}</td><td style="text-align:right">${formatPrice(String(p.subtotal))}</td></tr>`);
    
    return `<table><thead><tr><th style="text-align:center">№</th><th>Наименование программы</th><th style="text-align:center">Объём, часов</th><th style="text-align:center">Кол-во чел.</th><th style="text-align:right">Цена за 1 чел., руб.</th><th style="text-align:right">Сумма, руб.</th></tr></thead><tbody>${rows.join('')}<tr><td colspan="5" style="text-align:right;font-weight:bold">Итого:</td><td style="text-align:right;font-weight:bold">${formatPrice(String(totalPrice))}</td></tr></tbody></table>`;
  };

  const generateProgramsListText = (): string => {
    return resolvedPrograms
      .filter(p => p.course)
      .map((p, i) => `${i + 1}. ${p.course!.title}${p.course!.frdo_duration_hours ? ` — ${p.course!.frdo_duration_hours} ч.` : (p.course!.duration ? ` — ${p.course!.duration}` : '')} — ${p.count} чел. — ${formatPrice(p.price)} руб./чел. — ${formatPrice(String(p.subtotal))} руб.`)
      .join('\n');
  };

  const generateContractHTML = (): string => {
    const validPrograms = resolvedPrograms.filter(p => p.course);
    const counterparty = effectiveCounterparty;
    if (!counterparty || validPrograms.length === 0) return "";
    
    const dateFormatted = format(new Date(contractDate), "«d» MMMM yyyy г.", { locale: ru });
    const serviceStartFormatted = format(new Date(serviceStartDate), "«d» MMMM yyyy г.", { locale: ru });
    const serviceEndFormatted = format(new Date(serviceEndDate), "«d» MMMM yyyy г.", { locale: ru });
    const contractValidUntilDate = new Date(contractDate);
    contractValidUntilDate.setFullYear(contractValidUntilDate.getFullYear() + 1);
    const contractValidUntil = format(contractValidUntilDate, "«d» MMMM yyyy г.", { locale: ru });

    const orgIsIP = isIP(orgRequisites.name);
    const orgGender = detectGender(orgRequisites.director_name);
    const orgDirectorNameGenitive = declineFullNameToGenitive(orgRequisites.director_name);
    const orgActing = orgGender === 'female' ? 'действующей' : 'действующего';

    const isIndividual = counterpartyType === 'individual';
    const companyIsIP = !isIndividual && isIP(counterparty.name);
    const companyDirector = !isIndividual ? (counterparty.director || 'Генерального директора') : '';

    const isMultiple = validPrograms.length > 1;
    const firstCourse = validPrograms[0].course!;
    const firstPrice = validPrograms[0].priceNum;
    const firstCount = validPrograms[0].count;
    const firstCourseHours = firstCourse.frdo_duration_hours ? String(firstCourse.frdo_duration_hours) : (firstCourse.duration || '');

    // Use saved template if available, otherwise fallback to hardcoded default
    let templateText = savedTemplate || DEFAULT_TEMPLATE;

    // For individuals, replace the company block with individual block if template uses company vars
    if (isIndividual) {
      // Remove company representation block
      templateText = templateText.replace(/,?\s*в лице\s+\{\{company_director\}\}\s*,?\s*действующ(?:его|ей)\s+на основании Устава\s*,?/gi, '');
      // Replace "именуемое" with "именуемый" for individual
      templateText = templateText.replace(/именуемое в дальнейшем «Заказчик»/gi, 'именуемый(-ая) в дальнейшем «Заказчик»');
    }

    // Handle ИП: remove representation blocks BEFORE variable substitution
    if (orgIsIP) {
      // Remove "в лице {{vars}} на основании Устава" pattern
      templateText = templateText.replace(/,?\s*в лице\s+\{\{org_director_position\}\}\s+\{\{org_director_name_genitive\}\}\s*,?\s*\{\{org_director_acting\}\}\s+на основании Устава\s*,?/gi, '');
      templateText = templateText.replace(/,?\s*в лице\s+[^,]*\{\{org_director_name_genitive\}\}[^,]*на основании Устава\s*,?/gi, '');
      // Also handle already-hardcoded text (no template vars)
      templateText = templateText.replace(/,?\s*в лице\s+[^,«»]*,?\s*действующ(?:его|ей)\s+на основании Устава\s*,?\s*(?=с одной стороны)/gi, '');
    }
    if (companyIsIP) {
      templateText = templateText.replace(/,?\s*в лице\s+\{\{company_director\}\}\s*,?\s*действующ(?:его|ей)\s+на основании Устава\s*,?/gi, '');
      templateText = templateText.replace(/,?\s*в лице\s+[^,«»]*,?\s*действующ(?:его|ей)\s+на основании Устава\s*,?\s*(?=с другой стороны)/gi, '');
    }
    // For ИП, also fix "именуемое" -> "именуемый"
    if (orgIsIP) {
      templateText = templateText.replace(/именуемое в дальнейшем «Исполнитель»/gi, 'именуемый в дальнейшем «Исполнитель»');
    }
    if (companyIsIP) {
      templateText = templateText.replace(/именуемое в дальнейшем «Заказчик»/gi, 'именуемый в дальнейшем «Заказчик»');
    }

    // Build the variable replacement map
    const replacements: Record<string, string> = {
      '{{contract_number}}': contractNumber,
      '{{contract_date}}': dateFormatted,
      '{{service_start_date}}': serviceStartFormatted,
      '{{service_end_date}}': serviceEndFormatted,
      '{{contract_valid_until}}': contractValidUntil,
      '{{org_name}}': orgRequisites.name,
      '{{org_director_position}}': orgRequisites.director_position || 'Генерального директора',
      '{{org_director_name}}': orgRequisites.director_name,
      '{{org_director_name_genitive}}': orgDirectorNameGenitive,
      '{{org_director_acting}}': orgActing,
      '{{org_inn}}': orgRequisites.inn,
      '{{org_kpp}}': orgRequisites.kpp,
      '{{org_ogrn}}': orgRequisites.ogrn,
      '{{org_address}}': orgRequisites.legal_address || orgRequisites.actual_address,
      '{{org_bank_name}}': orgRequisites.bank_name,
      '{{org_bank_bik}}': orgRequisites.bank_bik,
      '{{org_bank_account}}': orgRequisites.bank_account,
      '{{org_bank_corr_account}}': orgRequisites.bank_corr_account,
      // Company / individual fields — map company vars to individual data when needed
      '{{company_name}}': isIndividual ? individualData.fullName : counterparty.name,
      '{{company_director}}': isIndividual ? '' : companyDirector,
      '{{company_inn}}': isIndividual ? '—' : (counterparty.inn || '_______________'),
      '{{company_kpp}}': isIndividual ? '—' : (counterparty.kpp || '_______________'),
      '{{company_ogrn}}': isIndividual ? '—' : (counterparty.ogrn || '_______________'),
      '{{company_address}}': isIndividual ? (individualData.address || '_______________') : (counterparty.address || '_______________'),
      // Individual-specific variables
      '{{individual_name}}': individualData.fullName,
      '{{individual_passport}}': individualData.passport,
      '{{individual_address}}': individualData.address,
      '{{individual_phone}}': individualData.phone,
      '{{individual_email}}': individualData.email,
      // Course & payment
      '{{course_title}}': firstCourse.title,
      '{{course_duration}}': firstCourse.duration ? ` продолжительностью ${firstCourse.duration}` : '',
      '{{course_hours}}': firstCourseHours,
      '{{students_count}}': String(isMultiple ? totalStudents : firstCount),
      '{{price}}': formatPrice(String(firstPrice)),
      '{{total_price}}': formatPrice(String(totalPrice)),
      '{{total_price_words}}': numberToWords(totalPrice),
      '{{programs_table}}': generateProgramsTableHTML(),
      '{{programs_list}}': generateProgramsListText(),
      '{{additional_terms}}': additionalTerms || '',
    };

    // Perform variable substitution
    let result = templateText;
    for (const [key, value] of Object.entries(replacements)) {
      result = result.split(key).join(value);
    }

    // Fallback: remove any remaining "в лице ... Устава" for ИП after substitution
    if (orgIsIP) {
      result = result.replace(/,?\s*в лице\s+[^,«»]*,?\s*действующ(?:его|ей)\s+на основании Устава\s*,?/gi, '');
      result = result.replace(/,?\s*в лице\s+[^,«»]*на основании Устава\s*,?/gi, '');
    }
    if (companyIsIP) {
      result = result.replace(/,?\s*в лице\s+[^,«»]*,?\s*действующ(?:его|ей)\s+на основании Устава\s*,?/gi, '');
    }

    // Convert plain text template to HTML
    const htmlBody = result
      .split('\n\n')
      .map(paragraph => {
        const trimmed = paragraph.trim();
        if (!trimmed) return '';
        // Check if it's a section title (all caps or starts with a number + period + caps)
        if (/^\d+\.\s*[А-ЯЁ\s]+$/.test(trimmed)) {
          return `<div class="section"><div class="section-title">${trimmed}</div></div>`;
        }
        // Check if paragraph contains the programs table HTML
        if (trimmed.includes('<table')) {
          return `<div class="item">${trimmed}</div>`;
        }
        // Wrap each line as an item
        const lines = trimmed.split('\n').map(line => {
          const l = line.trim();
          if (!l) return '';
          if (l.startsWith('-')) return `<div class="item" style="margin-left:40px">${l}</div>`;
          return `<div class="item">${l}</div>`;
        }).join('');
        return lines;
      })
      .join('');

    // Add signature block with stamps
    const counterpartySignName = isIndividual ? individualData.fullName : '_________________ ';
    const signatureBlock = `<div class="section"><table class="requisites"><tr><td style="width:50%"><strong>ИСПОЛНИТЕЛЬ:</strong><br><br><div class="signature-area"><div class="signature-images">${orgRequisites.signature_url ? `<img src="${orgRequisites.signature_url}" alt="Подпись" style="max-height:60px;max-width:150px;left:0;top:0">` : ''}${orgRequisites.stamp_url ? `<img src="${orgRequisites.stamp_url}" alt="Печать" style="max-height:90px;max-width:90px;left:70px;top:-15px;opacity:.9">` : ''}</div><div class="signature-line">_______________ / ${orgRequisites.director_name} /</div></div></td><td style="width:50%"><strong>ЗАКАЗЧИК${isIndividual ? ' (СЛУШАТЕЛЬ)' : ''}:</strong><br><br><div class="signature-area"><div class="signature-line" style="margin-top:80px">_______________ / ${counterpartySignName} /</div></div></td></tr></table></div>`;

    return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Договор №${contractNumber}</title><style>@page{margin:2cm}*{box-sizing:border-box}body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;color:#000;margin:0;padding:20px;background:#fff}.header{text-align:center;margin-bottom:20px}.title{font-size:14pt;font-weight:bold;margin:20px 0;text-align:center}.parties{margin-bottom:20px;text-align:justify}.section{margin:15px 0}.section-title{font-weight:bold;margin-bottom:10px}.item{margin-left:20px;margin-bottom:5px;text-align:justify}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #000;padding:5px 8px;text-align:left}th{background:#f0f0f0}.requisites{font-size:10pt;margin-top:20px}.requisites td{border:none;vertical-align:top;padding:3px 10px}.signature-area{position:relative;min-height:100px;margin-top:10px}.signature-images{position:relative;height:80px;margin-bottom:10px}.signature-images img{position:absolute}.signature-line{border-top:1px solid #000;padding-top:5px;margin-top:60px}</style></head><body>${htmlBody}${signatureBlock}</body></html>`;
  };

  const hasValidCounterparty = counterpartyType === 'individual' ? !!individualData.fullName : !!selectedCompanyId;

  const handleGenerate = async () => {
    const validPrograms = selectedPrograms.filter(p => p.courseId && p.price && parseFloat(p.price) > 0);
    if (!hasValidCounterparty) { toast.error(counterpartyType === 'individual' ? "Укажите ФИО" : "Выберите компанию"); return; }
    if (validPrograms.length === 0) { toast.error("Добавьте хотя бы одну программу с ценой"); return; }
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
    const validPrograms = selectedPrograms.filter(p => p.courseId);
    if (!effectiveCounterparty || validPrograms.length === 0) { toast.error("Заполните все обязательные поля"); return; }
    const html = generateContractHTML();
    const counterpartyName = counterpartyType === 'individual' ? individualData.fullName : (selectedCompany?.name || 'компания');
    const docContent = `<!DOCTYPE html><html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset="utf-8"><meta name="ProgId" content="Word.Document"><title>Договор ${contractNumber}</title><style>@page{size:A4;margin:2cm}body{font-family:'Times New Roman',serif;font-size:14pt;line-height:1.5}</style></head><body>${html.replace(/<html[^>]*>|<\/html>|<head>[\s\S]*?<\/head>|<body[^>]*>|<\/body>|<!DOCTYPE[^>]*>/gi, '')}</body></html>`;
    const blob = new Blob([docContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `Договор_${contractNumber}_${counterpartyName}.doc`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
    toast.success("Договор скачан в формате DOC");
  };

  const handleSaveContract = async () => {
    const validPrograms = selectedPrograms.filter(p => p.courseId && p.price);
    if (!effectiveCounterparty || validPrograms.length === 0) { toast.error("Заполните все обязательные поля"); return; }
    if (!onSave) { toast.error("Сохранение недоступно"); return; }
    setIsSaving(true);
    try {
      const html = generateContractHTML();
      const counterpartyName = counterpartyType === 'individual' ? individualData.fullName : (selectedCompany?.name || '');
      await onSave(html, contractNumber, counterpartyName, validPrograms[0].courseId, totalPrice, totalStudents, contractDate);
      toast.success("Договор сохранён"); onClose();
    } catch (error) { console.error("Error:", error); toast.error("Ошибка сохранения"); }
    finally { setIsSaving(false); }
  };

  const handlePreview = () => {
    const validPrograms = selectedPrograms.filter(p => p.courseId && p.price);
    if (!effectiveCounterparty || validPrograms.length === 0) { toast.error("Заполните все обязательные поля"); return; }
    setPreviewHtml(generateContractHTML()); setShowPreview(true);
  };

  const hasValidPrograms = selectedPrograms.some(p => p.courseId && p.price && parseFloat(p.price) > 0);

  return {
    companies, courses, isLoading, isGenerating, isSaving,
    showPreview, setShowPreview, previewHtml,
    selectedCompanyId, setSelectedCompanyId,
    counterpartyType, setCounterpartyType,
    individualData, setIndividualData,
    // Legacy single-program compat
    selectedCourseId, setSelectedCourseId, price, setPrice, studentsCount, setStudentsCount,
    // Multi-program
    selectedPrograms, addProgram, removeProgram, updateProgram,
    totalPrice, totalStudents, hasValidPrograms,
    contractNumber, setContractNumber, contractDate, setContractDate,
    additionalTerms, setAdditionalTerms,
    selectedCompany, effectiveCounterparty, selectedCourse: courses.find(c => c.id === selectedCourseId),
    serviceStartDate, setServiceStartDate, serviceEndDate, setServiceEndDate,
    formatPrice, handleGenerate, handleDownloadDOC, handleSaveContract, handlePreview,
    onSave,
  };
}
