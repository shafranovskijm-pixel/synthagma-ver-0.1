import {
  TrendingUp, Users, Clock, DollarSign, Gift, Crown, Award,
  Brain, FileCheck, CreditCard, ShieldCheck, User, UserPlus, Trophy,
  Building2, Briefcase, GraduationCap, Rocket, Network, ExternalLink,
} from "lucide-react";

import caseBeginner from "@/assets/partner/case-beginner.jpg";
import caseActive from "@/assets/partner/case-active.jpg";
import caseLeader from "@/assets/partner/case-leader.jpg";

import benefitIncome from "@/assets/partner/benefit-income.jpg";
import benefitDuration from "@/assets/partner/benefit-duration.jpg";
import benefitLeader from "@/assets/partner/benefit-leader.jpg";
import benefitTurnover from "@/assets/partner/benefit-turnover.jpg";

import stepRegister from "@/assets/partner/step-register.jpg";
import stepShare from "@/assets/partner/step-share.jpg";
import stepNetwork from "@/assets/partner/step-network.jpg";
import stepEarn from "@/assets/partner/step-earn.jpg";

import comicFree from "@/assets/partner/comic-free.jpg";
import comicUnlimited from "@/assets/partner/comic-unlimited.jpg";
import comicAi from "@/assets/partner/comic-ai.jpg";
import comicDocs from "@/assets/partner/comic-docs.jpg";
import comicPayment from "@/assets/partner/comic-payment.jpg";
import comicProctoring from "@/assets/partner/comic-proctoring.jpg";

export const steps = [
  { icon: Users, title: "Зарегистрируйтесь", desc: "Станьте партнёром за 1 клик — нужен только аккаунт на платформе", image: stepRegister },
  { icon: ExternalLink, title: "Делитесь ссылкой", desc: "Отправьте персональную ссылку вашим контактам и аудитории", image: stepShare },
  { icon: Network, title: "Стройте сеть", desc: "Привлекайте партнёров и получайте комиссию с 3 уровней", image: stepNetwork },
  { icon: DollarSign, title: "Получайте доход", desc: "До 45% от каждого платежа по всей вашей сети", image: stepEarn },
];

export const benefits = [
  { icon: TrendingUp, title: "До 45% дохода", desc: "20% прямых + 10% уровень 2 + 5% уровень 3 + бонусы", image: benefitIncome },
  { icon: Clock, title: "2 года выплат", desc: "Получайте комиссию в течение 24 месяцев после регистрации клиента", image: benefitDuration },
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

export const whyEasyToSell = [
  { icon: Gift, title: "Бесплатный тариф навсегда", desc: "Клиент ничем не рискует — может попробовать все функции бесплатно", image: comicFree, rotate: "-2deg", accent: "WOW!" },
  { icon: Users, title: "Безлимит учеников", desc: "На всех тарифах — нет скрытых платежей за количество пользователей", image: comicUnlimited, rotate: "1deg", accent: "∞" },
  { icon: Brain, title: "ИИ-генерация курсов", desc: "Курс из 30 уроков с тестами создаётся за 5 минут", image: comicAi, rotate: "-1deg", accent: "5 мин!" },
  { icon: FileCheck, title: "Документооборот + ФИС ФРДО", desc: "Заменяет 3-4 отдельные системы", image: comicDocs, rotate: "2deg", accent: "4 в 1" },
  { icon: CreditCard, title: "Онлайн-касса и платежи", desc: "Клиент сразу начинает монетизировать обучение", image: comicPayment, rotate: "-1.5deg", accent: "₽₽₽" },
  { icon: ShieldCheck, title: "Видеоидентификация", desc: "Требование закона — у нас уже встроено", image: comicProctoring, rotate: "1.5deg", accent: "ЗАКОН" },
];

export const caseStudies = [
  {
    icon: User, title: "Новичок", subtitle: "Достаточно 3 знакомых",
    color: "from-teal-900/90 to-teal-950/80 border-teal-500/30",
    iconBg: "bg-teal-500/15", iconColor: "text-teal-500", image: caseBeginner,
    rows: [{ label: "Уровень 1: 3 организации × 3 490 ₽ × 20%", value: "2 094 ₽" }],
    total: "2 094 ₽/мес",
    note: "Пассивный доход — расскажите о платформе трём знакомым руководителям учебных центров",
  },
  {
    icon: UserPlus, title: "Активный партнёр", subtitle: "Полноценный доход на полставки",
    color: "from-cyan-900/90 to-cyan-950/80 border-cyan-500/30",
    iconBg: "bg-cyan-500/15", iconColor: "text-cyan-500", image: caseActive,
    rows: [
      { label: "Уровень 1: 5 организаций × 6 990 ₽ × 20%", value: "6 990 ₽" },
      { label: "Уровень 2: 10 организаций × 3 490 ₽ × 10%", value: "3 490 ₽" },
    ],
    total: "10 480 ₽/мес",
    note: "Привлекайте сами и помогайте своим партнёрам находить клиентов",
  },
  {
    icon: Trophy, title: "Лидер сети", subtitle: "Сопоставимо с зарплатой менеджера",
    color: "from-amber-900/90 to-amber-950/80 border-amber-500/30",
    iconBg: "bg-amber-500/15", iconColor: "text-amber-500", image: caseLeader,
    rows: [
      { label: "Уровень 1: 10 организаций × 10 000 ₽ × 20%", value: "20 000 ₽" },
      { label: "Уровень 2: 30 организаций × 5 000 ₽ × 10%", value: "15 000 ₽" },
      { label: "Уровень 3: 50 организаций × 4 000 ₽ × 5%", value: "10 000 ₽" },
      { label: "Бонус за оборот (+5%)", value: "5 000 ₽" },
      { label: "Лидерский бонус (+3%)", value: "3 000 ₽" },
    ],
    total: "53 000 ₽/мес",
    note: "Стройте сеть партнёров, обучайте их привлекать клиентов и получайте комиссию с 3 уровней",
  },
];

export const priceOptions = [
  { label: "Старт (3 490 ₽)", value: 3490 },
  { label: "Стандарт (6 990 ₽)", value: 6990 },
  { label: "Проф. (16 990 ₽)", value: 16990 },
  { label: "Макс. (24 990 ₽)", value: 24990 },
];

export const faqItems = [
  { q: "Что такое многоуровневая партнёрская программа?", a: "Вы получаете комиссию не только от организаций, которых пригласили лично (уровень 1 — 20%), но и от организаций, привлечённых вашими партнёрами (уровень 2 — 10%) и партнёрами партнёров (уровень 3 — 5%). Дополнительно действуют бонусы за оборот (+5%) и лидерский бонус (+3%)." },
  { q: "Как пригласить партнёра в свою сеть?", a: "В кабинете партнёра есть специальная ссылка для привлечения партнёров. Когда человек станет партнёром по вашей ссылке, он автоматически попадёт в вашу сеть и вы будете получать комиссию с его привлечённых организаций." },
  { q: "Как работает бонус за оборот?", a: "Если суммарная комиссия по вашей сети (все 3 уровня) превышает 100 000 ₽ в месяц, вы получаете дополнительно +5% от каждого платежа. Пересчёт происходит ежемесячно." },
  { q: "Что такое лидерский бонус?", a: "Каждый месяц мы определяем топ-10 партнёров по обороту сети. Эти партнёры получают дополнительно +3% от всех платежей. Рейтинг обновляется автоматически." },
  { q: "Каким образом происходят выплаты комиссии?", a: "Комиссия начисляется автоматически при каждой оплате. Выплаты производятся по запросу на банковский счёт при накоплении от 1 000 ₽." },
  { q: "Можно ли заключить договор?", a: "Да, для юридических лиц и ИП мы заключаем партнёрский договор. Свяжитесь с нами через форму обратной связи." },
];

export const platformStats = [
  { value: "300+", label: "готовых программ ДПО и ПО", icon: GraduationCap, gradient: "from-teal-500/20 via-emerald-500/10 to-teal-500/5", iconColor: "text-teal-500", glow: "shadow-teal-500/20" },
  { value: "∞", label: "учеников на всех тарифах", icon: Users, gradient: "from-cyan-500/20 via-blue-500/10 to-cyan-500/5", iconColor: "text-cyan-500", glow: "shadow-cyan-500/20" },
  { value: "ФИС ФРДО", label: "выгрузка файла для загрузки (от Проф.)", icon: FileCheck, gradient: "from-violet-500/20 via-purple-500/10 to-violet-500/5", iconColor: "text-violet-500", glow: "shadow-violet-500/20" },
  { value: "ИИ", label: "генерация курсов за минуты", icon: Brain, gradient: "from-amber-500/20 via-orange-500/10 to-amber-500/5", iconColor: "text-amber-500", glow: "shadow-amber-500/20" },
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
    messenger: `🎓 Я использую платформу СИНТАГМА для дистанционного обучения — современная LMS с документооборотом, ФРДО, видеоидентификацией и ИИ.\n\nПопробуйте бесплатно: ${refLink}`,
    social: `Для обучения сотрудников использую СИНТАГМА — платформу с полным функционалом:\n\n1. Бесплатный тариф для старта\n2. Безлимит учеников на всех тарифах\n3. ИИ-генерация курсов за минуты\n4. Встроенный документооборот и ФРДО\n5. Видеоидентификация и прокторинг\n6. Онлайн-касса и приём платежей\n7. Охрана труда и журналы\n\nПопробуйте: ${refLink}`,
    b2b: `Предлагаю рассмотреть платформу СИНТАГМА для организации дистанционного обучения в вашей компании.\n\nОсновные возможности:\n• Конструктор курсов с ИИ-генерацией контента\n• Встроенный документооборот (договоры, акты, согласия)\n• Интеграция с ФРДО для передачи данных об образовании\n• Видеоидентификация и прокторинг экзаменов\n• Модуль охраны труда с журналами и протоколами\n• Онлайн-касса и приём платежей (комиссия от 2,8%)\n• Безлимит учеников на всех тарифах\n\nБесплатный тестовый период — 14 дней.\nПодробнее: ${refLink}`,
  };
}
