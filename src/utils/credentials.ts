// Credential generation utilities

// Transliteration map for Russian characters
export const translitMap: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
  'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
};

/**
 * Transliterate a string from Russian to Latin characters
 */
export const transliterate = (text: string): string => {
  return text.split('').map(c => translitMap[c] || c).join('');
};

/**
 * Generate a login from a full name
 * Format: firstname_XX### where XX is first 2 letters of last name and ### is random number
 */
export const generateLogin = (name: string): string => {
  const nameParts = name.toLowerCase().split(/\s+/);
  let baseLogin = nameParts.length >= 2
    ? nameParts[0].replace(/[^a-zа-яё]/gi, '').substring(0, 10) + '_' + nameParts[1].replace(/[^a-zа-яё]/gi, '').substring(0, 2)
    : nameParts[0].replace(/[^a-zа-яё]/gi, '').substring(0, 12);
  
  baseLogin = transliterate(baseLogin);
  const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return baseLogin + randomSuffix;
};

/**
 * Generate a simple password (8 characters, lowercase + digits)
 */
export const generateSimplePassword = (): string => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

/**
 * Generate a strong password (10 characters, mixed case + digits)
 */
export const generateStrongPassword = (): string => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

/**
 * Validate email format
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};
