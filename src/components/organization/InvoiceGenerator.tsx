import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Receipt, Download, Printer, Save, FileText, ArrowRight, Eye } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface Company {
  id: string;
  name: string;
  inn: string | null;
  kpp: string | null;
  ogrn: string | null;
  address: string | null;
  director: string | null;
}

interface Course {
  id: string;
  title: string;
  duration: string | null;
}

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

interface OrgRequisites {
  name: string;
  inn: string;
  kpp: string;
  ogrn: string;
  legal_address: string;
  actual_address: string;
  director_name: string;
  director_position: string;
  bank_name: string;
  bank_bik: string;
  bank_account: string;
  bank_corr_account: string;
  stamp_url?: string | null;
  signature_url?: string | null;
}

interface InvoiceGeneratorProps {
  organizationId: string;
  isOpen: boolean;
  onClose: () => void;
  orgRequisites: OrgRequisites;
  preselectedCompany?: Company | null;
  onSave?: (html: string, invoiceNumber: string, companyName: string, amount: number, contractId?: string) => Promise<void>;
}

export function InvoiceGenerator({
  organizationId,
  isOpen,
  onClose,
  orgRequisites,
  preselectedCompany,
  onSave }: InvoiceGeneratorProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Mode selection: null = choosing, 'contract' = based on contract, 'manual' = manual entry, 'preview' = preview mode
  const [mode, setMode] = useState<'choosing' | 'contract' | 'manual' | 'preview' | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>("");

  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedContractId, setSelectedContractId] = useState<string>("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [studentsCount, setStudentsCount] = useState("1");
  const [price, setPrice] = useState("");

  useEffect(() => {
    if (preselectedCompany && isOpen) {
      setSelectedCompanyId(preselectedCompany.id);
    }
  }, [preselectedCompany, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setMode(null);
      setSelectedContractId("");
      setSelectedCourseId("");
      setPrice("");
      setStudentsCount("1");
    }
  }, [isOpen]);

  useEffect(() => {
    const loadData = async () => {
      if (!organizationId || !isOpen) return;

      setIsLoading(true);
      try {
        const companyId = preselectedCompany?.id || selectedCompanyId;
        
        const [companiesRes, coursesRes] = await Promise.all([
          supabase
            .from("companies")
            .select("id, name, inn, kpp, ogrn, address, director")
            .eq("organization_id", organizationId)
            .order("name"),
          supabase
            .from("courses")
            .select("id, title, duration")
            .eq("organization_id", organizationId)
            .eq("is_published", true)
            .order("title"),
        ]);

        if (companiesRes.error) throw companiesRes.error;
        if (coursesRes.error) throw coursesRes.error;

        setCompanies(companiesRes.data || []);
        setCourses(coursesRes.data || []);

        // Fetch contracts for the selected company
        if (companyId) {
          const { data: contractsData } = await supabase
            .from("company_documents")
            .select("id, name, contract_number, uploaded_at, amount, students_count, contract_date, course_id")
            .eq("company_id", companyId)
            .eq("type", "contract")
            .order("uploaded_at", { ascending: false });
          
          setContracts(contractsData || []);
          
          // If no contracts, go directly to manual mode
          if (!contractsData || contractsData.length === 0) {
            setMode('manual');
          }
        } else {
          setMode('manual');
        }

        const today = new Date();
        const invoiceNum = `SCH-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
        setInvoiceNumber(invoiceNum);
      } catch (error) {
        console.error("Error loading data:", error);
        toast.error("Ошибка загрузки данных");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [organizationId, isOpen, preselectedCompany?.id, selectedCompanyId]);

  // When contract is selected, load its data
  useEffect(() => {
    if (selectedContractId && mode === 'contract') {
      const contract = contracts.find(c => c.id === selectedContractId);
      if (contract) {
        if (contract.course_id) {
          setSelectedCourseId(contract.course_id);
        }
        if (contract.amount) {
          // Calculate price per student
          const studCount = contract.students_count || 1;
          const pricePerStudent = contract.amount / studCount;
          setPrice(String(pricePerStudent));
        }
        if (contract.students_count) {
          setStudentsCount(String(contract.students_count));
        }
      }
    }
  }, [selectedContractId, mode, contracts]);

  const selectedCompany = preselectedCompany || companies.find((c) => c.id === selectedCompanyId);
  const selectedCourse = courses.find((c) => c.id === selectedCourseId);
  const selectedContract = contracts.find((c) => c.id === selectedContractId);

  // Extract contract number and date from selected contract
  const getContractInfo = () => {
    if (!selectedContract) return null;
    
    // Use contract_date if available, otherwise parse from name or use uploaded_at
    let contractDate = selectedContract.contract_date 
      ? format(new Date(selectedContract.contract_date), "dd.MM.yyyy")
      : null;
    
    if (!contractDate) {
      const dateMatch = selectedContract.name.match(/от\s+(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4})/i);
      contractDate = dateMatch ? dateMatch[1] : format(new Date(selectedContract.uploaded_at), "dd.MM.yyyy");
    }
    
    // Get contract number
    const contractNum = selectedContract.contract_number || 
      selectedContract.name.match(/№?\s*(\d+[-\/]?\d*)/)?.[1] || 
      "б/н";
    
    return { number: contractNum, date: contractDate };
  };

  const formatPrice = (value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return "0";
    return new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 }).format(num);
  };

  const numberToWords = (num: number): string => {
    const ones = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
    const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
    const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
    const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
    const thousands = ['тысяча', 'тысячи', 'тысяч'];

    if (num === 0) return 'ноль';

    const getHundreds = (n: number): string => {
      let result = '';
      if (n >= 100) {
        result += hundreds[Math.floor(n / 100)] + ' ';
        n %= 100;
      }
      if (n >= 20) {
        result += tens[Math.floor(n / 10)] + ' ';
        n %= 10;
      } else if (n >= 10) {
        result += teens[n - 10] + ' ';
        return result.trim();
      }
      if (n > 0) {
        result += ones[n] + ' ';
      }
      return result.trim();
    };

    let result = '';
    const intPart = Math.floor(num);

    if (intPart >= 1000000) {
      const mil = Math.floor(intPart / 1000000);
      result += getHundreds(mil) + ' миллион' + (mil === 1 ? '' : mil < 5 ? 'а' : 'ов') + ' ';
    }

    if (intPart >= 1000) {
      const thou = Math.floor((intPart % 1000000) / 1000);
      if (thou > 0) {
        let thouStr = getHundreds(thou);
        if (thou % 10 === 1 && thou % 100 !== 11) {
          thouStr = thouStr.replace('один', 'одна');
        } else if (thou % 10 === 2 && thou % 100 !== 12) {
          thouStr = thouStr.replace('два', 'две');
        }
        result += thouStr + ' ' + thousands[thou % 10 === 1 && thou % 100 !== 11 ? 0 : thou % 10 >= 2 && thou % 10 <= 4 && (thou % 100 < 10 || thou % 100 >= 20) ? 1 : 2] + ' ';
      }
    }

    const lastThree = intPart % 1000;
    if (lastThree > 0 || intPart === 0) {
      result += getHundreds(lastThree);
    }

    return result.trim();
  };

  const generateInvoiceHTML = (): string => {
    if (!selectedCompany || !selectedCourse) return "";

    const priceNum = parseFloat(price) || 0;
    const totalPrice = priceNum * parseInt(studentsCount);
    const dateFormatted = format(new Date(invoiceDate), "d MMMM yyyy г.", { locale: ru });
    const contractInfo = getContractInfo();

    return `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Счёт №${invoiceNumber}</title>
  <style>
    @page { margin: 1.5cm; }
    * { box-sizing: border-box; }
    body { 
      font-family: 'Times New Roman', Times, serif; 
      font-size: 11pt; 
      line-height: 1.4;
      color: #000;
      margin: 0;
      padding: 20px;
      background: white;
    }
    .header { margin-bottom: 20px; }
    .bank-details { 
      border-collapse: collapse; 
      width: 100%; 
      margin-bottom: 20px;
      table-layout: fixed;
    }
    .bank-details td { 
      border: 1px solid #000; 
      padding: 6px 8px; 
      font-size: 10pt;
      vertical-align: top;
    }
    .bank-details .bank-cell { width: 50%; }
    .bank-details .label-cell { width: 15%; text-align: right; }
    .bank-details .value-cell { width: 35%; }
    .title { 
      font-size: 14pt; 
      font-weight: bold; 
      margin: 20px 0 15px 0;
      text-align: center;
    }
    .info-row { margin-bottom: 8px; text-align: justify; }
    .info-label { font-weight: bold; }
    .items-table { 
      width: 100%; 
      border-collapse: collapse; 
      margin: 20px 0;
      table-layout: fixed;
    }
    .items-table th, .items-table td { 
      border: 1px solid #000; 
      padding: 8px 10px;
      vertical-align: middle;
    }
    .items-table th { 
      background: #f5f5f5; 
      font-weight: bold; 
      text-align: center;
    }
    .items-table .num { width: 8%; text-align: center; }
    .items-table .name { width: 40%; text-align: left; }
    .items-table .qty { width: 10%; text-align: center; }
    .items-table .unit { width: 10%; text-align: center; }
    .items-table .price { width: 16%; text-align: right; }
    .items-table .total { width: 16%; text-align: right; }
    .total-row td { font-weight: bold; }
    .summary { margin-top: 20px; }
    .footer { margin-top: 40px; }
    .signature-wrapper { 
      position: relative; 
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 80px;
    }
    .signature-images {
      position: relative;
      width: 200px;
      height: 80px;
    }
    .signature-images img {
      position: absolute;
    }
    .signature-line { 
      border-bottom: 1px solid #000; 
      width: 150px; 
      display: inline-block;
    }
  </style>
</head>
<body>
  <div class="header">
    <table class="bank-details">
      <tr>
        <td rowspan="2" class="bank-cell">
          <div style="margin-bottom: 5px; font-weight: bold;">${orgRequisites.bank_name || 'Банк не указан'}</div>
          <div style="font-size: 9pt; color: #666;">Банк получателя</div>
        </td>
        <td class="label-cell">БИК</td>
        <td class="value-cell">${orgRequisites.bank_bik || '—'}</td>
      </tr>
      <tr>
        <td class="label-cell">К/с</td>
        <td class="value-cell">${orgRequisites.bank_corr_account || '—'}</td>
      </tr>
      <tr>
        <td class="bank-cell">
          <div>ИНН ${orgRequisites.inn || '—'} КПП ${orgRequisites.kpp || '—'}</div>
          <div style="margin-top: 5px; font-weight: bold;">${orgRequisites.name || 'Организация не указана'}</div>
          <div style="font-size: 9pt; color: #666;">Получатель</div>
        </td>
        <td class="label-cell">Р/с</td>
        <td class="value-cell">${orgRequisites.bank_account || '—'}</td>
      </tr>
    </table>
  </div>

  <div class="title">СЧЁТ № ${invoiceNumber} от ${dateFormatted}</div>

  <div class="info-row">
    <span class="info-label">Поставщик:</span> ${orgRequisites.name}, ИНН ${orgRequisites.inn}, КПП ${orgRequisites.kpp}, ${orgRequisites.legal_address}
  </div>
  <div class="info-row">
    <span class="info-label">Покупатель:</span> ${selectedCompany.name}${selectedCompany.inn ? `, ИНН ${selectedCompany.inn}` : ''}${selectedCompany.kpp ? `, КПП ${selectedCompany.kpp}` : ''}${selectedCompany.address ? `, ${selectedCompany.address}` : ''}
  </div>
  ${contractInfo ? `
  <div class="info-row">
    <span class="info-label">Основание:</span> Договор №${contractInfo.number} от ${contractInfo.date}
  </div>` : ''}

  <table class="items-table">
    <thead>
      <tr>
        <th class="num">№</th>
        <th class="name">Наименование</th>
        <th class="qty">Кол-во</th>
        <th class="unit">Ед.</th>
        <th class="price">Цена</th>
        <th class="total">Сумма</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="num">1</td>
        <td class="name">Образовательные услуги по программе «${selectedCourse.title}»${selectedCourse.duration ? ` (${selectedCourse.duration})` : ''}</td>
        <td class="qty">${studentsCount}</td>
        <td class="unit">чел.</td>
        <td class="price">${formatPrice(price)}</td>
        <td class="total">${formatPrice(String(totalPrice))}</td>
      </tr>
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="5" style="text-align: right; border: none;">Итого:</td>
        <td class="total">${formatPrice(String(totalPrice))}</td>
      </tr>
      <tr class="total-row">
        <td colspan="5" style="text-align: right; border: none;">Без НДС</td>
        <td class="total" style="border-top: none;">—</td>
      </tr>
      <tr class="total-row">
        <td colspan="5" style="text-align: right; border: none;">Всего к оплате:</td>
        <td class="total" style="border-top: none;">${formatPrice(String(totalPrice))}</td>
      </tr>
    </tfoot>
  </table>

  <div class="summary">
    <strong>Всего наименований ${studentsCount}, на сумму ${formatPrice(String(totalPrice))} руб.</strong><br>
    <strong>${numberToWords(totalPrice)} рублей 00 копеек</strong>
  </div>

  <div class="footer">
    <div class="signature-wrapper">
      <span>${orgRequisites.director_position}</span>
      <div class="signature-images">
        ${orgRequisites.signature_url ? `<img src="${orgRequisites.signature_url}" alt="Подпись" style="max-height: 50px; max-width: 120px; left: 0; top: 15px;">` : ''}
        ${orgRequisites.stamp_url ? `<img src="${orgRequisites.stamp_url}" alt="Печать" style="max-height: 80px; max-width: 80px; left: 60px; top: 0; opacity: 0.85;">` : ''}
      </div>
      <span class="signature-line"></span>
      <span>/ ${orgRequisites.director_name} /</span>
    </div>
  </div>
</body>
</html>`;
  };

  const handleGenerate = async () => {
    if (!selectedCompanyId && !preselectedCompany) {
      toast.error("Выберите компанию");
      return;
    }
    if (!selectedCourseId) {
      toast.error("Выберите курс");
      return;
    }
    if (!price || parseFloat(price) <= 0) {
      toast.error("Укажите стоимость");
      return;
    }

    setIsGenerating(true);
    try {
      const html = generateInvoiceHTML();
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 500);
      }
      toast.success("Счёт сформирован");
    } catch (error) {
      console.error("Error generating invoice:", error);
      toast.error("Ошибка генерации счёта");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadDOC = () => {
    if (!selectedCompany || !selectedCourseId) {
      toast.error("Заполните все поля");
      return;
    }

    const html = generateInvoiceHTML();
    const docContent = `
<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset="utf-8">
<meta name="ProgId" content="Word.Document">
<title>Счёт ${invoiceNumber}</title>
</head>
<body>
${html.replace(/<html[^>]*>|<\/html>|<head>[\s\S]*?<\/head>|<body[^>]*>|<\/body>|<!DOCTYPE[^>]*>/gi, '')}
</body>
</html>`;

    const blob = new Blob([docContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Счёт_${invoiceNumber}_${selectedCompany?.name || 'компания'}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Счёт скачан");
  };

  const handleSave = async () => {
    if (!selectedCompany || !selectedCourseId || !price) {
      toast.error("Заполните все поля");
      return;
    }

    if (!onSave) {
      toast.error("Сохранение недоступно");
      return;
    }

    setIsSaving(true);
    try {
      const html = generateInvoiceHTML();
      const totalPrice = parseFloat(price) * parseInt(studentsCount);
      await onSave(html, invoiceNumber, selectedCompany.name, totalPrice, selectedContractId || undefined);
      toast.success("Счёт сохранён");
      onClose();
    } catch (error) {
      console.error("Error saving invoice:", error);
      toast.error("Ошибка сохранения");
    } finally {
      setIsSaving(false);
    }
  };

  // Mode selection screen
  const renderModeSelection = () => (
    <div className="space-y-4 py-4">
      <p className="text-center text-muted-foreground">
        Как вы хотите создать счёт?
      </p>
      <div className="grid gap-3">
        <Button
          variant="outline"
          className="h-auto py-4 px-4 justify-start gap-4"
          onClick={() => setMode('contract')}
        >
          <FileText className="w-8 h-8 text-primary" />
          <div className="text-left">
            <p className="font-medium">На основании договора</p>
            <p className="text-sm text-muted-foreground">
              Данные будут загружены из выбранного договора
            </p>
          </div>
          <ArrowRight className="w-5 h-5 ml-auto text-muted-foreground" />
        </Button>
        <Button
          variant="outline"
          className="h-auto py-4 px-4 justify-start gap-4"
          onClick={() => setMode('manual')}
        >
          <Receipt className="w-8 h-8 text-primary" />
          <div className="text-left">
            <p className="font-medium">Ввести вручную</p>
            <p className="text-sm text-muted-foreground">
              Заполнить все данные самостоятельно
            </p>
          </div>
          <ArrowRight className="w-5 h-5 ml-auto text-muted-foreground" />
        </Button>
      </div>
    </div>
  );

  // Main form
  const renderForm = () => (
    <div className="space-y-4">
      {mode === 'contract' && (
        <div className="space-y-2">
          <Label>Договор-основание</Label>
          <Select value={selectedContractId} onValueChange={setSelectedContractId}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите договор" />
            </SelectTrigger>
            <SelectContent>
              {contracts.map((contract) => (
                <SelectItem key={contract.id} value={contract.id}>
                  {contract.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedContract && (
            <p className="text-xs text-muted-foreground">
              Данные из договора подгружены автоматически
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Номер счёта</Label>
          <Input
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Дата</Label>
          <Input
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
          />
        </div>
      </div>

      {!preselectedCompany && (
        <div className="space-y-2">
          <Label>Компания-заказчик</Label>
          <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите компанию" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label>Курс</Label>
        <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
          <SelectTrigger>
            <SelectValue placeholder="Выберите курс" />
          </SelectTrigger>
          <SelectContent>
            {courses.map((course) => (
              <SelectItem key={course.id} value={course.id}>
                {course.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Кол-во учеников</Label>
          <Input
            type="number"
            min="1"
            value={studentsCount}
            onChange={(e) => setStudentsCount(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Цена за 1 ученика (₽)</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
          />
        </div>
      </div>

      {price && studentsCount && (
        <div className="bg-secondary/50 rounded-lg p-3 text-center">
          <span className="text-sm text-muted-foreground">Итого: </span>
          <span className="font-bold text-lg">
            {formatPrice(String(parseFloat(price || "0") * parseInt(studentsCount || "1")))} ₽
          </span>
        </div>
      )}

      <div className="flex gap-2 pt-4">
        {mode === 'contract' && (
          <Button
            variant="ghost"
            onClick={() => {
              setMode('choosing');
              setSelectedContractId("");
            }}
            className="px-3"
          >
            Назад
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => {
            const html = generateInvoiceHTML();
            setPreviewHtml(html);
            setMode('preview');
          }}
          disabled={!selectedCourseId || !price}
          className="flex-1"
        >
          <Eye className="w-4 h-4 mr-2" />
          Предпросмотр
        </Button>
        {onSave && (
          <Button
            onClick={handleSave}
            disabled={isSaving || !selectedCourseId || !price}
            className="flex-1"
          >
            {isSaving ? <SigmaSpinner size="sm" className="mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Сохранить
          </Button>
        )}
      </div>
    </div>
  );

  // Preview mode
  const renderPreview = () => (
    <div className="space-y-4">
      <div className="border rounded-lg overflow-hidden bg-white" style={{ maxHeight: '400px', overflowY: 'auto' }}>
        <iframe
          srcDoc={previewHtml}
          className="w-full h-[400px] border-0"
          title="Предпросмотр счёта"
        />
      </div>
      <div className="flex gap-2 pt-2">
        <Button
          variant="ghost"
          onClick={() => setMode(contracts.length > 0 && selectedContractId ? 'contract' : 'manual')}
          className="px-3"
        >
          Назад
        </Button>
        <Button
          variant="outline"
          onClick={handleDownloadDOC}
          className="flex-1"
        >
          <Download className="w-4 h-4 mr-2" />
          Скачать DOC
        </Button>
        <Button
          variant="outline"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="flex-1"
        >
          {isGenerating ? <SigmaSpinner size="sm" className="mr-2" /> : <Printer className="w-4 h-4 mr-2" />}
          Печать
        </Button>
        {onSave && (
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1"
          >
            {isSaving ? <SigmaSpinner size="sm" className="mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Сохранить
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-blue-500" />
            Создание счёта
          </DialogTitle>
        <DialogDescription>
            {mode === 'choosing' || mode === null 
              ? "Выберите способ создания счёта" 
              : mode === 'preview'
              ? "Проверьте данные перед сохранением"
              : "Заполните данные для формирования счёта на оплату"}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <SigmaSpinner />
          </div>
        ) : (
          <>
            {(mode === 'choosing' || mode === null) && contracts.length > 0 && renderModeSelection()}
            {(mode === 'contract' || mode === 'manual') && renderForm()}
            {mode === 'preview' && renderPreview()}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
