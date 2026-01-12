import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  FileText,
  Download,
  Loader2,
  Building2,
  Calendar,
  Users,
  Printer,
  Save,
  Eye,
  ArrowLeft,
} from "lucide-react";
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

interface ContractGeneratorProps {
  organizationId: string;
  isOpen: boolean;
  onClose: () => void;
  orgRequisites: OrgRequisites;
  preselectedCompany?: Company | null;
  onSave?: (html: string, contractNumber: string, companyName: string, courseId: string, amount: number, studentsCount: number, contractDate: string) => Promise<void>;
}

export function ContractGenerator({
  organizationId,
  isOpen,
  onClose,
  orgRequisites,
  preselectedCompany,
  onSave,
}: ContractGeneratorProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Preview mode
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");

  // Form state
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [contractNumber, setContractNumber] = useState("");
  const [contractDate, setContractDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [studentsCount, setStudentsCount] = useState("1");
  const [price, setPrice] = useState("");
  const [additionalTerms, setAdditionalTerms] = useState("");

  // Set preselected company when opened
  useEffect(() => {
    if (preselectedCompany && isOpen) {
      setSelectedCompanyId(preselectedCompany.id);
    }
  }, [preselectedCompany, isOpen]);

  // Load companies and courses
  useEffect(() => {
    const loadData = async () => {
      if (!organizationId || !isOpen) return;

      setIsLoading(true);
      try {
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

        // Generate contract number
        const today = new Date();
        const contractNum = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
        setContractNumber(contractNum);
      } catch (error) {
        console.error("Error loading data:", error);
        toast.error("Ошибка загрузки данных");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [organizationId, isOpen]);

  const selectedCompany = preselectedCompany || companies.find((c) => c.id === selectedCompanyId);
  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  const formatPrice = (value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return "0";
    return new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
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
      result += getHundreds(mil) + ' ' + millions[mil === 1 ? 0 : mil < 5 ? 1 : 2] + ' ';
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

  const generateContractHTML = (): string => {
    if (!selectedCompany || !selectedCourse) return "";

    const priceNum = parseFloat(price) || 0;
    const totalPrice = priceNum * parseInt(studentsCount);
    const dateFormatted = format(new Date(contractDate), "«d» MMMM yyyy г.", { locale: ru });

    return `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Договор №${contractNumber}</title>
  <style>
    @page { margin: 2cm; }
    body { 
      font-family: 'Times New Roman', Times, serif; 
      font-size: 12pt; 
      line-height: 1.5;
      color: #000;
    }
    .header { text-align: center; margin-bottom: 20px; }
    .title { font-size: 14pt; font-weight: bold; margin: 20px 0; text-align: center; }
    .parties { margin-bottom: 20px; text-align: justify; }
    .section { margin: 15px 0; }
    .section-title { font-weight: bold; margin-bottom: 10px; }
    .item { margin-left: 20px; margin-bottom: 5px; }
    .signatures { margin-top: 40px; display: flex; justify-content: space-between; }
    .signature-block { width: 45%; }
    .signature-title { font-weight: bold; margin-bottom: 10px; }
    .signature-line { border-bottom: 1px solid #000; margin-top: 40px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { border: 1px solid #000; padding: 5px 8px; text-align: left; }
    th { background: #f0f0f0; }
    .right { text-align: right; }
    .center { text-align: center; }
    .requisites { font-size: 10pt; margin-top: 20px; }
    .requisites td { border: none; vertical-align: top; padding: 3px 10px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">ДОГОВОР НА ОКАЗАНИЕ ОБРАЗОВАТЕЛЬНЫХ УСЛУГ</div>
    <div>№ ${contractNumber} от ${dateFormatted}</div>
  </div>

  <div class="parties">
    <p><strong>${orgRequisites.name}</strong>, именуемое в дальнейшем «Исполнитель», в лице ${orgRequisites.director_position} ${orgRequisites.director_name}, действующего на основании Устава, с одной стороны, и</p>
    <p><strong>${selectedCompany.name}</strong>, именуемое в дальнейшем «Заказчик», в лице ${selectedCompany.director || 'Генерального директора'}, действующего на основании Устава, с другой стороны, заключили настоящий Договор о нижеследующем:</p>
  </div>

  <div class="section">
    <div class="section-title">1. ПРЕДМЕТ ДОГОВОРА</div>
    <div class="item">1.1. Исполнитель обязуется оказать Заказчику образовательные услуги по программе «${selectedCourse.title}»${selectedCourse.duration ? ` продолжительностью ${selectedCourse.duration}` : ''}, а Заказчик обязуется оплатить эти услуги.</div>
    <div class="item">1.2. Количество обучающихся: ${studentsCount} чел.</div>
  </div>

  <div class="section">
    <div class="section-title">2. СТОИМОСТЬ УСЛУГ И ПОРЯДОК РАСЧЁТОВ</div>
    <div class="item">2.1. Стоимость обучения одного слушателя составляет ${formatPrice(price)} (${numberToWords(priceNum)}) рублей.</div>
    <div class="item">2.2. Общая стоимость услуг по настоящему Договору составляет ${formatPrice(String(totalPrice))} (${numberToWords(totalPrice)}) рублей.</div>
    <div class="item">2.3. Оплата производится путём перечисления денежных средств на расчётный счёт Исполнителя в течение 5 (пяти) банковских дней с момента подписания настоящего Договора.</div>
  </div>

  <div class="section">
    <div class="section-title">3. ПРАВА И ОБЯЗАННОСТИ СТОРОН</div>
    <div class="item">3.1. Исполнитель обязуется:</div>
    <div class="item" style="margin-left: 40px;">- обеспечить качественное проведение обучения;</div>
    <div class="item" style="margin-left: 40px;">- предоставить необходимые учебные материалы;</div>
    <div class="item" style="margin-left: 40px;">- выдать документы об обучении установленного образца.</div>
    <div class="item">3.2. Заказчик обязуется:</div>
    <div class="item" style="margin-left: 40px;">- своевременно оплатить услуги;</div>
    <div class="item" style="margin-left: 40px;">- обеспечить явку обучающихся.</div>
  </div>

  <div class="section">
    <div class="section-title">4. СРОК ДЕЙСТВИЯ ДОГОВОРА</div>
    <div class="item">4.1. Настоящий Договор вступает в силу с момента подписания и действует до полного исполнения сторонами своих обязательств.</div>
  </div>

  ${additionalTerms ? `
  <div class="section">
    <div class="section-title">5. ДОПОЛНИТЕЛЬНЫЕ УСЛОВИЯ</div>
    <div class="item">${additionalTerms}</div>
  </div>
  ` : ''}

  <div class="section">
    <div class="section-title">${additionalTerms ? '6' : '5'}. РЕКВИЗИТЫ И ПОДПИСИ СТОРОН</div>
    
    <table class="requisites">
      <tr>
        <td style="width: 50%;">
          <strong>ИСПОЛНИТЕЛЬ:</strong><br><br>
          ${orgRequisites.name}<br>
          ИНН: ${orgRequisites.inn}<br>
          КПП: ${orgRequisites.kpp}<br>
          ОГРН: ${orgRequisites.ogrn}<br>
          Адрес: ${orgRequisites.legal_address}<br>
          Банк: ${orgRequisites.bank_name}<br>
          БИК: ${orgRequisites.bank_bik}<br>
          Р/с: ${orgRequisites.bank_account}<br>
          К/с: ${orgRequisites.bank_corr_account}<br><br>
          ${orgRequisites.director_position}<br><br>
          <div style="position: relative; height: 80px; margin-top: 10px;">
            ${orgRequisites.signature_url ? `<img src="${orgRequisites.signature_url}" alt="Подпись" style="max-height: 60px; max-width: 150px; position: absolute; left: 0; top: 0;">` : ''}
            ${orgRequisites.stamp_url ? `<img src="${orgRequisites.stamp_url}" alt="Печать" style="max-height: 80px; max-width: 80px; position: absolute; left: 80px; top: -10px; opacity: 0.9;">` : ''}
          </div>
          _______________ / ${orgRequisites.director_name} /
        </td>
        <td style="width: 50%;">
          <strong>ЗАКАЗЧИК:</strong><br><br>
          ${selectedCompany.name}<br>
          ИНН: ${selectedCompany.inn || '_______________'}<br>
          КПП: ${selectedCompany.kpp || '_______________'}<br>
          ОГРН: ${selectedCompany.ogrn || '_______________'}<br>
          Адрес: ${selectedCompany.address || '_______________'}<br><br><br><br><br><br>
          ${selectedCompany.director || 'Генеральный директор'}<br><br>
          _______________ / _________________ /
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
  };

  const handleGenerate = async () => {
    if (!selectedCompanyId) {
      toast.error("Выберите компанию-заказчика");
      return;
    }
    if (!selectedCourseId) {
      toast.error("Выберите курс");
      return;
    }
    if (!price || parseFloat(price) <= 0) {
      toast.error("Укажите стоимость обучения");
      return;
    }

    setIsGenerating(true);
    try {
      const html = generateContractHTML();
      
      // Open print dialog
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
        }, 500);
      }
      
      toast.success("Договор сформирован");
    } catch (error) {
      console.error("Error generating contract:", error);
      toast.error("Ошибка генерации договора");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadDOC = () => {
    if (!selectedCompany || !selectedCourseId) {
      toast.error("Заполните все обязательные поля");
      return;
    }

    const html = generateContractHTML();
    
    // Create DOC-compatible HTML with proper headers
    const docContent = `
<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset="utf-8">
<meta name="ProgId" content="Word.Document">
<meta name="Generator" content="Microsoft Word 15">
<title>Договор ${contractNumber}</title>
<!--[if gte mso 9]>
<xml>
<w:WordDocument>
<w:View>Print</w:View>
<w:Zoom>100</w:Zoom>
<w:DoNotOptimizeForBrowser/>
</w:WordDocument>
</xml>
<![endif]-->
<style>
@page { size: A4; margin: 2cm; }
body { font-family: 'Times New Roman', Times, serif; font-size: 14pt; line-height: 1.5; }
</style>
</head>
<body>
${html.replace(/<html[^>]*>|<\/html>|<head>[\s\S]*?<\/head>|<body[^>]*>|<\/body>|<!DOCTYPE[^>]*>/gi, '')}
</body>
</html>`;
    
    const blob = new Blob([docContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Договор_${contractNumber}_${selectedCompany?.name || 'компания'}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast.success("Договор скачан в формате DOC");
  };

  const handleSaveContract = async () => {
    if (!selectedCompany || !selectedCourseId || !price) {
      toast.error("Заполните все обязательные поля");
      return;
    }

    if (!onSave) {
      toast.error("Сохранение недоступно");
      return;
    }

    setIsSaving(true);
    try {
      const html = generateContractHTML();
      const totalAmount = parseFloat(price) * parseInt(studentsCount);
      await onSave(html, contractNumber, selectedCompany.name, selectedCourseId, totalAmount, parseInt(studentsCount), contractDate);
      toast.success("Договор сохранён");
      onClose();
    } catch (error) {
      console.error("Error saving contract:", error);
      toast.error("Ошибка сохранения договора");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePreview = () => {
    if (!selectedCompany || !selectedCourseId || !price) {
      toast.error("Заполните все обязательные поля");
      return;
    }
    const html = generateContractHTML();
    setPreviewHtml(html);
    setShowPreview(true);
  };

  // Preview mode
  if (showPreview) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl rounded-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Предпросмотр договора
            </DialogTitle>
            <DialogDescription>
              Проверьте данные перед сохранением или печатью
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden">
            <div className="border rounded-lg overflow-hidden bg-white h-[60vh]">
              <iframe
                srcDoc={previewHtml}
                className="w-full h-full border-0"
                title="Предпросмотр договора"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-border">
            <Button
              variant="ghost"
              className="rounded-xl gap-2"
              onClick={() => setShowPreview(false)}
            >
              <ArrowLeft className="w-4 h-4" />
              Назад
            </Button>
            {onSave && (
              <Button
                variant="outline"
                className="rounded-xl flex-1 gap-2"
                onClick={handleSaveContract}
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Сохранить
                  </>
                )}
              </Button>
            )}
            <Button
              variant="outline"
              className="rounded-xl flex-1 gap-2"
              onClick={handleDownloadDOC}
            >
              <Download className="w-4 h-4" />
              Скачать DOC
            </Button>
            <Button
              className="btn-gradient rounded-xl flex-1 gap-2"
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Печать...
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4" />
                  Печать
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl rounded-2xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Генерация договора на обучение
          </DialogTitle>
          <DialogDescription>
            Заполните данные для автоматического формирования договора
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Contract Number & Date */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Номер договора</Label>
                <Input
                  value={contractNumber}
                  onChange={(e) => setContractNumber(e.target.value)}
                  className="rounded-xl"
                  placeholder="2024-01-001"
                />
              </div>
              <div className="space-y-2">
                <Label>Дата договора</Label>
                <Input
                  type="date"
                  value={contractDate}
                  onChange={(e) => setContractDate(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            </div>

            {/* Company Selection - show only if not preselected */}
            {preselectedCompany ? (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Компания-заказчик
                </Label>
                <div className="bg-secondary/50 rounded-xl p-3">
                  <p className="font-medium">{preselectedCompany.name}</p>
                  {preselectedCompany.inn && (
                    <p className="text-sm text-muted-foreground">ИНН: {preselectedCompany.inn}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Компания-заказчик *
                </Label>
                <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Выберите компанию" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name} {company.inn ? `(ИНН: ${company.inn})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {companies.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Нет компаний. Добавьте компанию в разделе "Компании".
                  </p>
                )}
              </div>
            )}

            {/* Course Selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Программа обучения *
              </Label>
              <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                <SelectTrigger className="rounded-xl">
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

            {/* Students Count & Price */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Количество обучающихся
                </Label>
                <Input
                  type="number"
                  min="1"
                  value={studentsCount}
                  onChange={(e) => setStudentsCount(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Стоимость за 1 чел., ₽ *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="rounded-xl"
                  placeholder="10000"
                />
              </div>
            </div>

            {/* Total */}
            {price && studentsCount && (
              <div className="bg-secondary/50 rounded-xl p-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Общая стоимость:</span>
                  <span className="text-xl font-bold">
                    {formatPrice(String(parseFloat(price) * parseInt(studentsCount)))} ₽
                  </span>
                </div>
              </div>
            )}

            {/* Additional Terms */}
            <div className="space-y-2">
              <Label>Дополнительные условия (необязательно)</Label>
              <Textarea
                value={additionalTerms}
                onChange={(e) => setAdditionalTerms(e.target.value)}
                className="rounded-xl min-h-[80px]"
                placeholder="Укажите дополнительные условия договора..."
              />
            </div>

            {/* Organization Requisites Preview */}
            <div className="bg-secondary/30 rounded-xl p-4">
              <p className="text-sm font-medium mb-2">Реквизиты исполнителя:</p>
              <p className="text-sm text-muted-foreground">
                {orgRequisites.name || 'Не указано'} • ИНН: {orgRequisites.inn || 'Не указан'}
              </p>
              {!orgRequisites.inn && (
                <p className="text-xs text-destructive mt-2">
                  ⚠️ Заполните реквизиты организации для корректного формирования договора
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-border">
              <Button
                variant="outline"
                className="rounded-xl flex-1 gap-2"
                onClick={handlePreview}
                disabled={!selectedCompany || !selectedCourseId || !price}
              >
                <Eye className="w-4 h-4" />
                Предпросмотр
              </Button>
              {onSave && (
                <Button
                  variant="outline"
                  className="rounded-xl flex-1 gap-2"
                  onClick={handleSaveContract}
                  disabled={isSaving || !selectedCompany || !selectedCourseId || !price}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Сохранение...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Сохранить
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}