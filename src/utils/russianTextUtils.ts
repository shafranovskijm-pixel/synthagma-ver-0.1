/** Russian language text utilities — declension, number-to-words, formatting */

export const formatPrice = (value: string): string => {
  const num = parseFloat(value);
  if (isNaN(num)) return "0";
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
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
  const original = word;
  if (lower.endsWith('ович')) return original.slice(0, -2) + 'ича';
  if (lower.endsWith('евич')) return original.slice(0, -2) + 'ича';
  if (lower.endsWith('ич') && lower.length > 4) return original + 'а';
  if (lower.endsWith('овна')) return original.slice(0, -1) + 'ы';
  if (lower.endsWith('евна')) return original.slice(0, -1) + 'ы';
  if (lower.endsWith('ична')) return original.slice(0, -1) + 'ы';
  if (lower.endsWith('инична')) return original.slice(0, -1) + 'ы';
  if (lower.endsWith('ая') && lower.length > 3) return original.slice(0, -2) + 'ой';
  if (lower.endsWith('яя') && lower.length > 3) return original.slice(0, -2) + 'ей';
  if ((lower.endsWith('ова') || lower.endsWith('ева') || lower.endsWith('ёва')) && lower.length > 4) return original.slice(0, -1) + 'ой';
  if (lower.endsWith('ина') && lower.length > 4) return original.slice(0, -1) + 'ой';
  if (lower.endsWith('ов') || lower.endsWith('ев') || lower.endsWith('ёв')) return original + 'а';
  if (lower.endsWith('ин') && lower.length > 3) return original + 'а';
  if (lower.endsWith('ий') && lower.length > 3) return original.slice(0, -2) + 'ого';
  if (lower.endsWith('ый') && lower.length > 3) return original.slice(0, -2) + 'ого';
  if (lower.endsWith('ой') && lower.length > 3) return original.slice(0, -2) + 'ого';
  if (lower.endsWith('а') && !lower.endsWith('ша') && !lower.endsWith('ща')) return original.slice(0, -1) + 'ы';
  if (lower.endsWith('ша') || lower.endsWith('ща') || lower.endsWith('ча') || lower.endsWith('жа')) return original.slice(0, -1) + 'и';
  if (lower.endsWith('я')) return original.slice(0, -1) + 'и';
  if (lower.endsWith('ь') && lower.length > 3) return original.slice(0, -1) + 'и';
  const lastChar = lower.slice(-1);
  if (/[бвгджзклмнпрстфхцчшщ]/.test(lastChar)) return original + 'а';
  return original;
};

export const declineFullNameToGenitive = (fullName: string): string => {
  const parts = fullName.trim().split(/\s+/);
  return parts.map(p => declineWordToGenitive(p)).join(' ');
};

export const isIP = (name: string): boolean => name.trim().toUpperCase().startsWith('ИП');

export const numberToWords = (num: number): string => {
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
