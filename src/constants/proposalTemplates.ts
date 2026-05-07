import { SUBSCRIPTION_PLANS, formatStorageSize, type SubscriptionPlan } from './subscriptionPlans';

export interface ProposalTemplateLine {
  custom_name: string;
  custom_description: string;
  price: number;
  quantity: number;
}

export interface ProposalTemplate {
  id: string;
  name: string;
  description: string;
  tariffPlan: SubscriptionPlan | '';
  serviceLines: ProposalTemplateLine[];
  features: string[];
}

function buildTariffDescription(plan: SubscriptionPlan): string {
  const p = SUBSCRIPTION_PLANS[plan];
  const parts: string[] = [];
  if (p.limits.maxCourses === -1) parts.push('Безлимит курсов');
  else parts.push(`До ${p.limits.maxCourses} курсов`);
  if (p.limits.maxStudents === -1) parts.push('Безлимит учеников');
  else parts.push(`До ${p.limits.maxStudents} учеников`);
  parts.push(`Хранилище ${formatStorageSize(p.limits.storageBytes)}`);
  return parts.join(', ');
}

function buildFeaturesList(plan: SubscriptionPlan): string[] {
  const p = SUBSCRIPTION_PLANS[plan];
  const f: string[] = [];
  f.push(`Курсы: ${p.limits.maxCourses === -1 ? '∞' : p.limits.maxCourses}`);
  f.push(`Ученики: ${p.limits.maxStudents === -1 ? '∞' : p.limits.maxStudents}`);
  f.push(`Обученных/мес: ${p.limits.maxTrainedPerMonth === -1 ? '∞' : p.limits.maxTrainedPerMonth}`);
  f.push(`Хранилище: ${formatStorageSize(p.limits.storageBytes)}`);
  if (p.limits.courseSettings) f.push('Настройки курсов');
  if (p.limits.documentChecklist) f.push('Чек-лист документов');
  if (p.limits.videoIdentification) f.push('Видеоидентификация');
  if (p.limits.branding) f.push('Брендирование');
  if (p.limits.aiEnabled) f.push('ИИ-генерация');
  if (p.limits.aiAudioEnabled) f.push('ИИ-озвучка');
  return f;
}

export const PROPOSAL_TEMPLATES: ProposalTemplate[] = [
  {
    id: 'start',
    name: 'Старт',
    description: 'Для начинающих организаций',
    tariffPlan: 'start',
    features: buildFeaturesList('start'),
    serviceLines: [
      {
        custom_name: `Тариф "${SUBSCRIPTION_PLANS.start.name}"`,
        custom_description: buildTariffDescription('start'),
        price: SUBSCRIPTION_PLANS.start.price,
        quantity: 12,
      },
      {
        custom_name: 'Настройка платформы',
        custom_description: 'Первичная настройка: создание курсов, импорт учеников',
        price: 5000,
        quantity: 1,
      },
      {
        custom_name: 'Техническая поддержка',
        custom_description: 'Консультации по работе с платформой (12 мес)',
        price: 0,
        quantity: 1,
      },
    ],
  },
  {
    id: 'standard',
    name: 'Стандарт',
    description: 'Для активных организаций',
    tariffPlan: 'standard',
    features: buildFeaturesList('standard'),
    serviceLines: [
      {
        custom_name: `Тариф "${SUBSCRIPTION_PLANS.standard.name}"`,
        custom_description: buildTariffDescription('standard'),
        price: SUBSCRIPTION_PLANS.standard.price,
        quantity: 12,
      },
      {
        custom_name: 'Настройка платформы',
        custom_description: 'Первичная настройка: курсы, ученики, компании',
        price: 5000,
        quantity: 1,
      },
      {
        custom_name: 'Брендирование',
        custom_description: 'Настройка логотипа, цветов и страницы входа',
        price: 3000,
        quantity: 1,
      },
      {
        custom_name: 'Техническая поддержка',
        custom_description: 'Приоритетные консультации (12 мес)',
        price: 0,
        quantity: 1,
      },
    ],
  },
  {
    id: 'professional',
    name: 'Профессиональный',
    description: 'Для крупных организаций',
    tariffPlan: 'professional',
    features: buildFeaturesList('professional'),
    serviceLines: [
      {
        custom_name: `Тариф "${SUBSCRIPTION_PLANS.professional.name}"`,
        custom_description: buildTariffDescription('professional'),
        price: SUBSCRIPTION_PLANS.professional.price,
        quantity: 12,
      },
      {
        custom_name: 'Настройка платформы',
        custom_description: 'Полная настройка: курсы, журналы, документы',
        price: 10000,
        quantity: 1,
      },
      {
        custom_name: 'Брендирование',
        custom_description: 'Настройка логотипа, цветов и страницы входа',
        price: 3000,
        quantity: 1,
      },
      {
        custom_name: 'Генерация документов',
        custom_description: 'Настройка шаблонов документов организации',
        price: 5000,
        quantity: 1,
      },
      {
        custom_name: 'Техническая поддержка',
        custom_description: 'Приоритетная поддержка с менеджером (12 мес)',
        price: 0,
        quantity: 1,
      },
    ],
  },
  {
    id: 'boxed',
    name: 'Коробочная версия',
    description: 'On-premise установка на ваш сервер',
    tariffPlan: '',
    features: [
      'Возможность доработки под ваши требования',
      'Установка на ваш сервер',
      'Бессрочная неисключительная лицензия',
      '3 месяца поддержки и помощь с интеграцией ваших документов',
    ],
    serviceLines: [
      {
        custom_name: 'Коробочная версия СИНТАГМА',
        custom_description: 'Неисключительная бессрочная лицензия с возможностью доработки и установки на ваш сервер. 3 месяца поддержки в стоимости.',
        price: 540000,
        quantity: 1,
      },
    ],
  },
  {
    id: 'website',
    name: 'Сайт под ключ',
    description: 'Разработка сайта для образовательной организации',
    tariffPlan: '',
    features: [
      'Соответствие требованиям Минобрнауки',
      'Адаптивный дизайн под все устройства',
      'Формы заявок и интеграции',
      'Запуск под ключ за 1 неделю',
    ],
    serviceLines: [
      {
        custom_name: 'Разработка сайта образовательной организации под ключ',
        custom_description: 'Профессиональный сайт учебного центра: адаптивный дизайн, каталог курсов, формы заявок, управление контентом. Фиксированная стоимость.',
        price: 55000,
        quantity: 1,
      },
    ],
  },
  {
    id: 'custom',
    name: 'Индивидуальный',
    description: 'Свободное заполнение',
    tariffPlan: '',
    features: ['Ручной подбор услуг', 'Индивидуальные условия'],
    serviceLines: [],
  },
];
