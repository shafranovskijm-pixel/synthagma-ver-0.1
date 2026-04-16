/**
 * Shared helpers for document generators (Invoice, Act, etc.)
 */

export const formatPrice = (value: string): string => {
  const num = parseFloat(value);
  if (isNaN(num)) return "0";
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

export const numberToWords = (num: number): string => {
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

export const detectGender = (fullName: string): 'male' | 'female' => {
  const parts = fullName.trim().split(/\s+/);
  const patronymic = parts.length >= 3 ? parts[2] : parts.length >= 2 ? parts[1] : '';
  const lower = patronymic.toLowerCase();
  if (lower.endsWith('вна') || lower.endsWith('чна') || lower.endsWith('ична') || lower.endsWith('инична')) return 'female';
  return 'male';
};

export const declineWordToGenitive = (word: string): string => {
  if (!word || word.length < 2) return word;
  if (/^[А-ЯЁA-Z]\./.test(word)) return word;
  const lower = word.toLowerCase();
  if (lower.endsWith('ович')) return word.slice(0, -2) + 'ича';
  if (lower.endsWith('евич')) return word.slice(0, -2) + 'ича';
  if (lower.endsWith('ич') && lower.length > 4) return word + 'а';
  if (lower.endsWith('овна') || lower.endsWith('евна') || lower.endsWith('ична') || lower.endsWith('инична')) return word.slice(0, -1) + 'ы';
  if (lower.endsWith('ая') && lower.length > 3) return word.slice(0, -2) + 'ой';
  if ((lower.endsWith('ова') || lower.endsWith('ева') || lower.endsWith('ёва')) && lower.length > 4) return word.slice(0, -1) + 'ой';
  if (lower.endsWith('ина') && lower.length > 4) return word.slice(0, -1) + 'ой';
  if (lower.endsWith('ов') || lower.endsWith('ев') || lower.endsWith('ёв')) return word + 'а';
  if (lower.endsWith('ин') && lower.length > 3) return word + 'а';
  if (lower.endsWith('ий') && lower.length > 3) return word.slice(0, -2) + 'ого';
  if (lower.endsWith('а') && !lower.endsWith('ша') && !lower.endsWith('ща')) return word.slice(0, -1) + 'ы';
  if (lower.endsWith('ша') || lower.endsWith('ща') || lower.endsWith('ча') || lower.endsWith('жа')) return word.slice(0, -1) + 'и';
  if (lower.endsWith('я')) return word.slice(0, -1) + 'и';
  const lastChar = lower.slice(-1);
  if (/[бвгджзклмнпрстфхцчшщ]/.test(lastChar)) return word + 'а';
  return word;
};

export const declineFullName = (name: string) =>
  name.trim().split(/\s+/).map(p => declineWordToGenitive(p)).join(' ');

export const isIP = (name: string) => name.trim().toUpperCase().startsWith('ИП');

export interface OrgRequisites {
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

export interface DocumentCompany {
  id: string;
  name: string;
  inn: string | null;
  kpp: string | null;
  ogrn: string | null;
  address: string | null;
  director: string | null;
}

export interface DocumentCourse {
  id: string;
  title: string;
  duration: string | null;
}

export const downloadAsDoc = (html: string, title: string, filename: string) => {
  const docContent = `
<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset="utf-8">
<meta name="ProgId" content="Word.Document">
<title>${title}</title>
</head>
<body>
${html.replace(/<html[^>]*>|<\/html>|<head>[\s\S]*?<\/head>|<body[^>]*>|<\/body>|<!DOCTYPE[^>]*>/gi, '')}
</body>
</html>`;

  const blob = new Blob([docContent], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const printHtml = (html: string) => {
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  }
};
