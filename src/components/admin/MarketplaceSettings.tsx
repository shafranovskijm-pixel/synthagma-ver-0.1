// Shared types and helpers for marketplace prompts/settings — used by BulkPipelineWidget

export const DEFAULT_PROMPTS = {
  structure: `Ты - эксперт по созданию образовательных курсов для дополнительного профессионального образования (ДПО).

Твоя задача - создать структуру учебного курса на основе названия и описания.

ТИПЫ УРОКОВ (используй ТОЛЬКО эти три):
- "text" — теоретическая лекция (основной тип)
- "test" — промежуточный или итоговый тест для проверки знаний
- "practice" — практическое задание: ситуационная задача, кейс, анализ документа, разбор реальной ситуации

ЗАПРЕЩЕНО использовать типы "video" и "audio" — курс полностью текстовый.

ПРАВИЛА СТРУКТУРЫ:
1. Создай от 8 до 15 уроков в зависимости от сложности темы
2. Начинай с вводной лекции (общие понятия, цели курса, нормативная база)
3. После каждых 2-3 теоретических лекций ставь промежуточный тест
4. Включи 1-2 практических задания (кейсы, ситуационные задачи, анализ документов)
5. ОБЯЗАТЕЛЬНО: последний урок курса должен быть тестом с названием "Итоговое тестирование" (тип "test")
6. Названия уроков должны быть конкретными и профессиональными
7. Логика: от базовых понятий → к деталям → к практике → к проверке`,

  content: `Ты эксперт по промышленной безопасности и нормативам Ростехнадзора. Создай подробный учебный материал.
Правила:
1. Структурированный текст с заголовками (используй Markdown)
2. Ссылки на нормативные документы (ФЗ, приказы, постановления)
3. Практические примеры и ситуации
4. Минимум 500 слов
5. На русском языке`,

  answers: `Ты эксперт в области промышленной безопасности, охраны труда и нормативов Ростехнадзора. 
Тебе даны тестовые вопросы с вариантами ответов. Определи правильный ответ для каждого вопроса.
Отвечай СТРОГО в формате JSON-массива, где каждый элемент — объект с полями:
- "questionIndex": номер вопроса (начиная с 0)
- "correctAnswer": индекс правильного ответа (начиная с 0)
- "explanation": краткое пояснение, почему этот ответ правильный (1-2 предложения)

Пример: [{"questionIndex": 0, "correctAnswer": 2, "explanation": "Согласно ФЗ-116..."}]
Отвечай ТОЛЬКО JSON-массивом, без markdown-обертки.`,
};

export interface MarketplacePrompts {
  structure: string;
  content: string;
  answers: string;
}

export interface MarketplaceSettingsData {
  freeForOrgs: boolean;
  defaultPriceStudent: number;
  defaultPriceOrg: number;
}

export const PROMPTS_KEY = "marketplace_prompts";
export const SETTINGS_KEY = "marketplace_settings";

export function getMarketplacePrompts(): MarketplacePrompts {
  try {
    const saved = localStorage.getItem(PROMPTS_KEY);
    if (saved) return { ...DEFAULT_PROMPTS, ...JSON.parse(saved) };
  } catch {}
  return { ...DEFAULT_PROMPTS };
}

export function getMarketplaceSettings(): MarketplaceSettingsData {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return { freeForOrgs: true, defaultPriceStudent: 0, defaultPriceOrg: 0 };
}
