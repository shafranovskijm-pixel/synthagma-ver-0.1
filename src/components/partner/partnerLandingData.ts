import {
  TrendingUp, Users, Clock, DollarSign, Crown, Award,
  Building2, Briefcase, GraduationCap, ExternalLink,
} from "lucide-react";
import { SUBSCRIPTION_PLANS } from "@/constants/subscriptionPlans";
import { PLAN_ORDER } from "@/lib/pricingFeatureRows";



import benefitIncome from "@/assets/partner/benefit-income.jpg";
import benefitDuration from "@/assets/partner/benefit-duration.jpg";
import benefitLeader from "@/assets/partner/benefit-leader.jpg";
import benefitTurnover from "@/assets/partner/benefit-turnover.jpg";

import stepRegister from "@/assets/partner/step-register.jpg";
import stepShare from "@/assets/partner/step-share.jpg";
import stepEarn from "@/assets/partner/step-earn.jpg";


export const steps = [
  { icon: Users, title: "Зарегистрируйтесь", desc: "Станьте партнёром за 1 клик — нужен только аккаунт на платформе", image: stepRegister },
  { icon: ExternalLink, title: "Делитесь ссылкой", desc: "Отправьте персональную ссылку вашим контактам и аудитории", image: stepShare },
  { icon: DollarSign, title: "Получайте комиссию", desc: "До 43% по трём уровням сети — по условиям оферты и после подтверждённой оплаты клиента", image: stepEarn },
];

export const benefits = [
  { icon: TrendingUp, title: "До 43% комиссии", desc: "20% уровень 1 + 10% уровень 2 + 5% уровень 3 + бонусы +5% и +3%", image: benefitIncome },
  { icon: Clock, title: "2 года выплат", desc: "Комиссия начисляется в течение 24 месяцев после регистрации клиента", image: benefitDuration },
  { icon: Crown, title: "Лидерский бонус", desc: "Топ-10 партнёров месяца получают дополнительно +3% со всей сети", image: benefitLeader },
  { icon: Award, title: "Бонус за оборот", desc: "При обороте сети > 100 000 ₽/мес — дополнительно +5%", image: benefitTurnover },
];


export const networkLevels = [
  { level: "Уровень 1", desc: "Прямые приглашения", percent: "20%", color: "from-teal-500/20 to-teal-500/10 border-teal-500/30", glow: "shadow-teal-500/10" },
  { level: "Уровень 2", desc: "Партнёры ваших партнёров", percent: "10%", color: "from-cyan-500/15 to-cyan-500/5 border-cyan-500/25", glow: "shadow-cyan-500/10" },
  { level: "Уровень 3", desc: "Третье поколение сети", percent: "5%", color: "from-blue-500/10 to-blue-500/5 border-blue-500/20", glow: "shadow-blue-500/10" },
];

export const bonuses = [
  { title: "Бонус за оборот", condition: "Оборот сети > 100 000 ₽/мес", bonus: "+5%", icon: TrendingUp, color: "text-emerald-500" },
  { title: "Лидерский бонус", condition: "Топ-10 партнёров месяца", bonus: "+3%", icon: Crown, color: "text-amber-500" },
];



/** Варианты среднего тарифа берутся только из общего источника тарифов. */
export const priceOptions = PLAN_ORDER
  .map((id) => SUBSCRIPTION_PLANS[id])
  .filter((plan) => plan.price > 0)
  .map((plan) => ({ label: `${plan.name} (${plan.price.toLocaleString("ru-RU")} ₽)`, value: plan.price }));


export const faqItems = [
  { q: "Что такое многоуровневая партнёрская программа?", a: "Вы получаете комиссию не только от организаций, которых пригласили лично (уровень 1 — 20%), но и от организаций, привлечённых вашими партнёрами (уровень 2 — 10%) и партнёрами партнёров (уровень 3 — 5%). Дополнительно действуют бонусы за оборот (+5%) и лидерский бонус (+3%)." },
  { q: "Как пригласить партнёра в свою сеть?", a: "В кабинете партнёра есть специальная ссылка для привлечения партнёров. Когда человек станет партнёром по вашей ссылке, он автоматически попадёт в вашу сеть и вы будете получать комиссию с его привлечённых организаций." },
  { q: "Как работает бонус за оборот?", a: "Если суммарная комиссия по вашей сети (все 3 уровня) превышает 100 000 ₽ в месяц, вы получаете дополнительно +5% от каждого платежа. Пересчёт происходит ежемесячно." },
  { q: "Что такое лидерский бонус?", a: "Каждый месяц мы определяем топ-10 партнёров по обороту сети. Эти партнёры получают дополнительно +3% от всех платежей. Рейтинг обновляется автоматически." },
  { q: "Каким образом происходят выплаты комиссии?", a: "Комиссия начисляется по условиям партнёрской оферты и только после подтверждённой оплаты клиента. Выплаты производятся по запросу на банковский счёт при накоплении от 1 000 ₽. Гарантированного дохода программа не предусматривает — размер комиссии зависит от оплат вашей сети." },
  { q: "Можно ли заключить договор?", a: "Да, для юридических лиц и ИП мы заключаем партнёрский договор. Свяжитесь с нами через форму обратной связи." },
];


export const downloadMaterials = [
  { name: "Возможности и тарифы СИНТАГМА (для организаций).pdf", type: "PDF", color: "bg-red-500/15 text-red-400", href: "/promo/tariffs-organizations.pdf" },
  { name: "Возможности и тарифы СИНТАГМА (для онлайн-школ).pdf", type: "PDF", color: "bg-red-500/15 text-red-400", href: "/promo/tariffs-online-schools.pdf" },
  { name: "Рекламные баннеры СИНТАГМА.zip", type: "ZIP", color: "bg-amber-500/15 text-amber-400", href: "/promo/banners-sintagma.zip" },
];

export const recommendTargets = [
  { icon: Building2, title: "Учебные центры", desc: "Центры ДПО, повышения квалификации, переподготовки" },
  { icon: Briefcase, title: "Компании", desc: "Обучение персонала, охрана труда, аттестация" },
  { icon: GraduationCap, title: "Образовательные организации", desc: "Школы, колледжи, университеты — дистанционное обучение" },
];

export const formatRub = (n: number) => Math.round(n).toLocaleString("ru-RU") + " ₽";

export function buildPromoTexts(refLink: string) {
  return {
    messenger: `🎓 Я использую платформу СИНТАГМА для дистанционного обучения — LMS с документооборотом, подготовкой данных для ФИС ФРДО, видеоидентификацией и ИИ.\n\nБесплатный тариф работает постоянно: ${refLink}`,
    social: `Для обучения сотрудников использую СИНТАГМА — платформу с полным функционалом:\n\n1. Бесплатный тариф постоянно, без карты\n2. Тарифы от ${SUBSCRIPTION_PLANS.start.price.toLocaleString("ru-RU")} ₽/мес\n3. ИИ-генерация курсов за минуты\n4. Встроенный документооборот и подготовка файла ФИС ФРДО\n5. Видеоидентификация и прокторинг\n6. Онлайн-касса и приём платежей\n7. Охрана труда и журналы\n\nПопробуйте: ${refLink}`,
    b2b: `Предлагаю рассмотреть платформу СИНТАГМА для организации дистанционного обучения в вашей компании.\n\nОсновные возможности:\n• Конструктор курсов с ИИ-генерацией контента\n• Встроенный документооборот (договоры, акты, согласия)\n• Проверка и подготовка файла для передачи данных в ФИС ФРДО\n• Видеоидентификация и прокторинг экзаменов\n• Модуль охраны труда с журналами и протоколами\n• Онлайн-касса и приём платежей\n\nБесплатный тариф работает постоянно, платные — от ${SUBSCRIPTION_PLANS.start.price.toLocaleString("ru-RU")} ₽/мес.\nПодробнее: ${refLink}`,

  };
}
