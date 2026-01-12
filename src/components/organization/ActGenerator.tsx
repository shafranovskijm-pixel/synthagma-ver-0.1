import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { FileCheck, Download, Loader2, Printer, Save } from "lucide-react";
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

interface ActGeneratorProps {
  organizationId: string;
  isOpen: boolean;
  onClose: () => void;
  orgRequisites: OrgRequisites;
  preselectedCompany?: Company | null;
  onSave?: (html: string, actNumber: string, companyName: string, amount: number) => Promise<void>;
}

export function ActGenerator({
  organizationId,
  isOpen,
  onClose,
  orgRequisites,
  preselectedCompany,
  onSave,
}: ActGeneratorProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [actNumber, setActNumber] = useState("");
  const [actDate, setActDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [contractNumber, setContractNumber] = useState("");
  const [contractDate, setContractDate] = useState("");
  const [studentsCount, setStudentsCount] = useState("1");
  const [price, setPrice] = useState("");

  useEffect(() => {
    if (preselectedCompany && isOpen) {
      setSelectedCompanyId(preselectedCompany.id);
    }
  }, [preselectedCompany, isOpen]);

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

        const today = new Date();
        const num = `АКТ-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
        setActNumber(num);
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

  const generateActHTML = (): string => {
    if (!selectedCompany || !selectedCourse) return "";

    const priceNum = parseFloat(price) || 0;
    const totalPrice = priceNum * parseInt(studentsCount);
    const dateFormatted = format(new Date(actDate), "d MMMM yyyy г.", { locale: ru });
    const contractDateFormatted = contractDate ? format(new Date(contractDate), "d MMMM yyyy г.", { locale: ru }) : "";

    return `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Акт №${actNumber}</title>
  <style>
    @page { margin: 2cm; }
    body { 
      font-family: 'Times New Roman', Times, serif; 
      font-size: 12pt; 
      line-height: 1.5;
      color: #000;
    }
    .title { font-size: 14pt; font-weight: bold; text-align: center; margin: 20px 0; }
    .subtitle { text-align: center; margin-bottom: 30px; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 20px; }
    .party { width: 48%; }
    .party-title { font-weight: bold; margin-bottom: 5px; }
    .content { margin: 20px 0; text-align: justify; }
    .items-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .items-table th, .items-table td { border: 1px solid #000; padding: 8px; }
    .items-table th { background: #f5f5f5; font-weight: bold; text-align: center; }
    .total-section { margin: 20px 0; }
    .signatures { display: flex; justify-content: space-between; margin-top: 50px; }
    .signature-block { width: 45%; }
    .signature-title { font-weight: bold; margin-bottom: 30px; }
    .signature-line { border-bottom: 1px solid #000; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="title">АКТ № ${actNumber}</div>
  <div class="subtitle">
    сдачи-приёмки оказанных услуг<br>
    ${contractNumber ? `к Договору № ${contractNumber} от ${contractDateFormatted}` : ''}
  </div>

  <div style="text-align: right; margin-bottom: 20px;">г. ${orgRequisites.actual_address?.split(',')[0] || 'Москва'}, ${dateFormatted}</div>

  <div class="parties">
    <div class="party">
      <div class="party-title">Исполнитель:</div>
      <div>${orgRequisites.name}</div>
      <div>ИНН: ${orgRequisites.inn}, КПП: ${orgRequisites.kpp}</div>
    </div>
    <div class="party">
      <div class="party-title">Заказчик:</div>
      <div>${selectedCompany.name}</div>
      <div>ИНН: ${selectedCompany.inn || '—'}${selectedCompany.kpp ? `, КПП: ${selectedCompany.kpp}` : ''}</div>
    </div>
  </div>

  <div class="content">
    <p>Мы, нижеподписавшиеся, ${orgRequisites.director_position} ${orgRequisites.name} ${orgRequisites.director_name}, именуемый в дальнейшем «Исполнитель», с одной стороны, и ${selectedCompany.director || 'представитель'} ${selectedCompany.name}, именуемый в дальнейшем «Заказчик», с другой стороны, составили настоящий Акт о нижеследующем:</p>
  </div>

  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 40px;">№</th>
        <th>Наименование услуги</th>
        <th style="width: 60px;">Кол-во</th>
        <th style="width: 50px;">Ед.</th>
        <th style="width: 120px;">Цена, руб.</th>
        <th style="width: 120px;">Сумма, руб.</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="text-align: center;">1</td>
        <td>Образовательные услуги по программе «${selectedCourse.title}»${selectedCourse.duration ? ` (${selectedCourse.duration})` : ''}</td>
        <td style="text-align: center;">${studentsCount}</td>
        <td style="text-align: center;">чел.</td>
        <td style="text-align: right;">${formatPrice(price)}</td>
        <td style="text-align: right;">${formatPrice(String(totalPrice))}</td>
      </tr>
    </tbody>
    <tfoot>
      <tr>
        <td colspan="5" style="text-align: right; font-weight: bold;">ИТОГО:</td>
        <td style="text-align: right; font-weight: bold;">${formatPrice(String(totalPrice))}</td>
      </tr>
      <tr>
        <td colspan="5" style="text-align: right;">Без НДС</td>
        <td style="text-align: right;">—</td>
      </tr>
    </tfoot>
  </table>

  <div class="total-section">
    <p><strong>Всего оказано услуг на сумму: ${formatPrice(String(totalPrice))} (${numberToWords(totalPrice)}) рублей 00 копеек.</strong></p>
    <p>Вышеперечисленные услуги выполнены полностью и в срок. Заказчик претензий по объёму, качеству и срокам оказания услуг не имеет.</p>
  </div>

  <div class="signatures">
    <div class="signature-block">
      <div class="signature-title">ИСПОЛНИТЕЛЬ:</div>
      <div>${orgRequisites.name}</div>
      <div style="position: relative; margin-top: 20px;">
        ${orgRequisites.signature_url ? `<img src="${orgRequisites.signature_url}" alt="Подпись" style="max-height: 50px; max-width: 120px; position: absolute; left: 0; top: 0;">` : ''}
        ${orgRequisites.stamp_url ? `<img src="${orgRequisites.stamp_url}" alt="Печать" style="max-height: 70px; max-width: 70px; position: absolute; left: 80px; top: -10px; opacity: 0.85;">` : ''}
      </div>
      <div class="signature-line"></div>
      <div style="margin-top: 5px;">${orgRequisites.director_position} / ${orgRequisites.director_name} /</div>
    </div>
    <div class="signature-block">
      <div class="signature-title">ЗАКАЗЧИК:</div>
      <div>${selectedCompany.name}</div>
      <div class="signature-line" style="margin-top: 50px;"></div>
      <div style="margin-top: 5px;">${selectedCompany.director || '_______________'} / _________________ /</div>
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
      const html = generateActHTML();
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 500);
      }
      toast.success("Акт сформирован");
    } catch (error) {
      console.error("Error generating act:", error);
      toast.error("Ошибка генерации акта");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadDOC = () => {
    if (!selectedCompany || !selectedCourseId) {
      toast.error("Заполните все поля");
      return;
    }

    const html = generateActHTML();
    const docContent = `
<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset="utf-8">
<meta name="ProgId" content="Word.Document">
<title>Акт ${actNumber}</title>
</head>
<body>
${html.replace(/<html[^>]*>|<\/html>|<head>[\s\S]*?<\/head>|<body[^>]*>|<\/body>|<!DOCTYPE[^>]*>/gi, '')}
</body>
</html>`;

    const blob = new Blob([docContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Акт_${actNumber}_${selectedCompany?.name || 'компания'}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Акт скачан");
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
      const html = generateActHTML();
      const totalPrice = parseFloat(price) * parseInt(studentsCount);
      await onSave(html, actNumber, selectedCompany.name, totalPrice);
      toast.success("Акт сохранён");
      onClose();
    } catch (error) {
      console.error("Error saving act:", error);
      toast.error("Ошибка сохранения");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-green-500" />
            Создание акта
          </DialogTitle>
          <DialogDescription>
            Заполните данные для формирования акта выполненных работ
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Номер акта</Label>
                <Input
                  value={actNumber}
                  onChange={(e) => setActNumber(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Дата акта</Label>
                <Input
                  type="date"
                  value={actDate}
                  onChange={(e) => setActDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>№ договора (опционально)</Label>
                <Input
                  value={contractNumber}
                  onChange={(e) => setContractNumber(e.target.value)}
                  placeholder="2025-01-001"
                />
              </div>
              <div className="space-y-2">
                <Label>Дата договора</Label>
                <Input
                  type="date"
                  value={contractDate}
                  onChange={(e) => setContractDate(e.target.value)}
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
              <Button
                variant="outline"
                onClick={handleDownloadDOC}
                disabled={!selectedCourseId || !price}
                className="flex-1"
              >
                <Download className="w-4 h-4 mr-2" />
                Скачать DOC
              </Button>
              <Button
                variant="outline"
                onClick={handleGenerate}
                disabled={isGenerating || !selectedCourseId || !price}
                className="flex-1"
              >
                {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
                Печать
              </Button>
              {onSave && (
                <Button
                  onClick={handleSave}
                  disabled={isSaving || !selectedCourseId || !price}
                  className="flex-1"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Сохранить
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
