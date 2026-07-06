import { SUBSCRIPTION_PLANS, formatStorageSize, YEARLY_DISCOUNT, type SubscriptionPlan } from './subscriptionPlans';

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
  /** Визуальный акцент для карточки шаблона */
  tier?: 'basic' | 'standard' | 'pro' | 'premium';
  badge?: string;
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
  if (p.limits.webinarsEnabled) f.push('Вебинары');
  if (p.limits.trainersEnabled) f.push('3D-тренажёры');
  if (p.limits.emailCampaignsEnabled) f.push('Email-рассылки');
  if (p.limits.salesCrmEnabled) f.push('CRM и продажи');
  f.push('Настройка платформы — бесплатно');
  f.push('Приоритетная техподдержка — 12 месяцев');
  return f;
}

/** Годовая цена со скидкой 15%, округлённая до сотен рублей */
function yearlyPrice(plan: SubscriptionPlan): number {
  const monthly = SUBSCRIPTION_PLANS[plan].price;
  const raw = monthly * 12 * (1 - YEARLY_DISCOUNT);
  return Math.round(raw / 100) * 100;
}

function planLine(plan: SubscriptionPlan): ProposalTemplateLine {
  const p = SUBSCRIPTION_PLANS[plan];
  const monthlyYear = p.price * 12;
  const yearly = yearlyPrice(plan);
  const saving = monthlyYear - yearly;
  return {
    custom_name: `Тариф «${p.name}» — годовая подписка`,
    custom_description:
      `${buildTariffDescription(plan)}. ` +
      `Оплата за 12 месяцев со скидкой 15% (экономия ${saving.toLocaleString('ru-RU')} ₽). ` +
      `Эквивалент ${Math.round(yearly / 12).toLocaleString('ru-RU')} ₽/мес вместо ${p.price.toLocaleString('ru-RU')} ₽/мес.`,
    price: yearly,
    quantity: 1,
  };
}

export const PROPOSAL_TEMPLATES: ProposalTemplate[] = [
  {
    id: 'start',
    name: 'Старт',
    description: 'Для начинающих организаций',
    tariffPlan: 'start',
    tier: 'basic',
    features: buildFeaturesList('start'),
    serviceLines: [planLine('start')],
  },
  {
    id: 'standard',
    name: 'Стандарт',
    description: 'Для активных организаций',
    tariffPlan: 'standard',
    tier: 'standard',
    badge: 'Популярный',
    features: buildFeaturesList('standard'),
    serviceLines: [planLine('standard')],
  },
  {
    id: 'professional',
    name: 'Профессиональный',
    description: 'Для крупных организаций',
    tariffPlan: 'professional',
    tier: 'pro',
    badge: 'Рекомендуем',
    features: buildFeaturesList('professional'),
    serviceLines: [planLine('professional')],
  },
  {
    id: 'maximum',
    name: 'Максимальный',
    description: 'Полный доступ ко всем возможностям платформы',
    tariffPlan: 'maximum',
    tier: 'premium',
    badge: 'Премиум',
    features: buildFeaturesList('maximum'),
    serviceLines: [planLine('maximum')],
  },
  {
    id: 'boxed',
    name: 'Коробочная версия',
    description: 'On-premise установка на ваш сервер',
    tariffPlan: '',
    tier: 'premium',
    badge: 'Enterprise',
    features: [
      'Бессрочная неисключительная лицензия',
      'Установка на ваш сервер / контур заказчика',
      'Возможность доработки под ваши требования',
      '3 месяца поддержки и интеграция ваших документов',
      'Соответствие требованиям информационной безопасности',
    ],
    serviceLines: [
      {
        custom_name: 'Коробочная версия СИНТАГМА',
        custom_description:
          'Неисключительная бессрочная лицензия с возможностью доработки и установки на ваш сервер. ' +
          '3 месяца поддержки и помощь с интеграцией документов в стоимости.',
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
    tier: 'pro',
    features: [
      'Соответствие требованиям Минобрнауки',
      'Адаптивный дизайн под все устройства',
      'Каталог курсов и формы заявок',
      'Запуск под ключ за 1 неделю',
    ],
    serviceLines: [
      {
        custom_name: 'Разработка сайта образовательной организации под ключ',
        custom_description:
          'Профессиональный сайт учебного центра: адаптивный дизайн, каталог курсов, ' +
          'формы заявок, панель управления контентом. Фиксированная стоимость.',
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
    tier: 'basic',
    features: ['Ручной подбор услуг', 'Индивидуальные условия'],
    serviceLines: [],
  },
];
