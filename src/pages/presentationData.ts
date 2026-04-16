import {
  BookOpen, FileText, Brain, Video, Shield, Database,
  Play, ClipboardList, Award, Lock, MessageSquare, AlertTriangle,
  Layers, Clock, Users, HardHat, Factory, Flame, Zap, Waves,
  Headphones, Image, Sparkles, Building2, GraduationCap, Landmark, CheckCircle2
} from "lucide-react";

export type Status = "yes" | "no" | "partial" | string;

export interface CompRow {
  category: string;
  feature: string;
  sintagma: Status;
  getcourse: Status;
  ispring: Status;
  moodle: Status;
}

export const compData: CompRow[] = [
  { category: "LMS", feature: "Конструктор курсов", sintagma: "yes", getcourse: "yes", ispring: "yes", moodle: "yes" },
  { category: "LMS", feature: "ИИ-генерация курсов", sintagma: "yes", getcourse: "no", ispring: "no", moodle: "no" },
  { category: "LMS", feature: "Тесты с банком вопросов", sintagma: "yes", getcourse: "yes", ispring: "yes", moodle: "yes" },
  { category: "LMS", feature: "Вебинары (Kinescope Live)", sintagma: "yes", getcourse: "yes", ispring: "partial", moodle: "partial" },
  { category: "LMS", feature: "Домашние задания", sintagma: "yes", getcourse: "yes", ispring: "yes", moodle: "yes" },
  { category: "LMS", feature: "Сертификаты и удостоверения", sintagma: "yes", getcourse: "partial", ispring: "yes", moodle: "partial" },
  { category: "LMS", feature: "Видеоидентификация (273-ФЗ)", sintagma: "yes", getcourse: "no", ispring: "no", moodle: "no" },
  { category: "Документооборот", feature: "Договоры", sintagma: "yes", getcourse: "no", ispring: "no", moodle: "no" },
  { category: "Документооборот", feature: "Акты выполненных работ", sintagma: "yes", getcourse: "no", ispring: "no", moodle: "no" },
  { category: "Документооборот", feature: "Счета", sintagma: "yes", getcourse: "no", ispring: "no", moodle: "no" },
  { category: "Документооборот", feature: "Протоколы проверки знаний", sintagma: "yes", getcourse: "no", ispring: "no", moodle: "no" },
  { category: "Документооборот", feature: "Приказы о зачислении", sintagma: "yes", getcourse: "no", ispring: "no", moodle: "no" },
  { category: "ИИ", feature: "Генерация курсов (до 35 уроков)", sintagma: "yes", getcourse: "no", ispring: "no", moodle: "no" },
  { category: "ИИ", feature: "Генерация тестов (15 вопросов)", sintagma: "yes", getcourse: "no", ispring: "partial", moodle: "no" },
  { category: "ИИ", feature: "Озвучка лекций (SaluteSpeech)", sintagma: "yes", getcourse: "no", ispring: "no", moodle: "no" },
  { category: "ИИ", feature: "Генерация обложек", sintagma: "yes", getcourse: "no", ispring: "no", moodle: "no" },
  { category: "ИИ", feature: "ИИ-чат для учеников", sintagma: "yes", getcourse: "no", ispring: "no", moodle: "no" },
  { category: "ФИС ФРДО", feature: "Выгрузка данных (ДПО/ПО)", sintagma: "yes", getcourse: "no", ispring: "no", moodle: "no" },
  { category: "ФИС ФРДО", feature: "Автозаполнение из карточки", sintagma: "yes", getcourse: "no", ispring: "no", moodle: "no" },
  { category: "Интеграции", feature: "Платёжные системы", sintagma: "yes", getcourse: "yes", ispring: "partial", moodle: "partial" },
  { category: "Интеграции", feature: "Email-рассылки (SMTP)", sintagma: "partial", getcourse: "yes", ispring: "yes", moodle: "partial" },
  { category: "Интеграции", feature: "Видеохостинг Kinescope", sintagma: "yes", getcourse: "no", ispring: "no", moodle: "no" },
  { category: "Тарифы", feature: "Бесплатный тариф навсегда", sintagma: "yes", getcourse: "partial", ispring: "no", moodle: "yes" },
  { category: "Тарифы", feature: "Стартовая цена", sintagma: "4 490 ₽/мес", getcourse: "4 990 ₽/мес", ispring: "27 000 ₽/год", moodle: "Бесплатно (self-hosted)" },
  { category: "Тарифы", feature: "Макс. учеников", sintagma: "Без ограничений", getcourse: "По тарифу", ispring: "По тарифу", moodle: "Без ограничений" },
  { category: "Поддержка", feature: "Техподдержка", sintagma: "yes", getcourse: "yes", ispring: "yes", moodle: "Сообщество" },
  { category: "Поддержка", feature: "Обучение работе", sintagma: "yes", getcourse: "partial", ispring: "yes", moodle: "no" },
  { category: "Поддержка", feature: "Документация", sintagma: "yes", getcourse: "yes", ispring: "yes", moodle: "yes" },
];

export type Competitor = "getcourse" | "ispring" | "moodle";
export const competitorLabels: Record<Competitor, string> = { getcourse: "GetCourse", ispring: "iSpring", moodle: "Moodle" };

export const heroTags = [
  { icon: BookOpen, label: "LMS" },
  { icon: FileText, label: "Документооборот" },
  { icon: Brain, label: "ИИ-ассистент" },
  { icon: Landmark, label: "ФИС ФРДО" },
];

export const problemCards = [
  { icon: FileText, title: "Бумажная работа", desc: "Договоры, протоколы, приказы — всё вручную", color: "hsl(0 72% 51%)" },
  { icon: Layers, title: "Разрозненные системы", desc: "Excel, мессенджеры, почта, диски — хаос", color: "hsl(38 92% 50%)" },
  { icon: AlertTriangle, title: "Нет контроля", desc: "Кто учится, кто завершил, кто просрочил — неизвестно", color: "hsl(262 80% 55%)" },
  { icon: Clock, title: "Потеря времени", desc: "До 70% рабочего времени — на администрирование", color: "hsl(210 80% 50%)" },
];

export const solutionItems = [
  { icon: BookOpen, label: "Курсы и обучение" },
  { icon: FileText, label: "Документооборот" },
  { icon: Brain, label: "ИИ-ассистент" },
  { icon: Video, label: "Видеоидентификация" },
  { icon: Database, label: "ФИС ФРДО" },
  { icon: Shield, label: "Охрана труда" },
];

export const lmsFeatures = [
  { icon: Play, title: "Видеолекции", desc: "Kinescope, загрузка видео, запрет перемотки" },
  { icon: ClipboardList, title: "Тесты", desc: "Банк вопросов, рандомизация, автопроверка" },
  { icon: Brain, title: "ИИ-генерация", desc: "Курс из темы за 5 минут — до 35 уроков" },
  { icon: FileText, title: "Материалы", desc: "Текст, HTML, файлы, вложения к урокам" },
  { icon: Award, title: "Сертификаты", desc: "Удостоверения, дипломы, свидетельства — авто" },
  { icon: Lock, title: "Гибкие настройки", desc: "Последовательность, проходной балл, доступ" },
];

export const aiFeatures = [
  { icon: Sparkles, text: "Генерация курсов из темы — до 35 уроков с контентом от 700 слов" },
  { icon: ClipboardList, text: "Генерация тестов — 15 вопросов с вариантами ответов" },
  { icon: Headphones, text: "Озвучка лекций (SaluteSpeech) — русский язык" },
  { icon: Image, text: "Генерация обложек для курсов" },
  { icon: MessageSquare, text: "ИИ-чат для учеников — отвечает по материалу курса" },
];

export const documentsList = [
  "Договор на обучение", "Приказ о зачислении", "Протокол проверки знаний",
  "Акт выполненных работ", "Удостоверение", "Согласие на обработку ПД",
  "Счёт на оплату", "Диплом о переподготовке", "Свидетельство о профессии",
];

export const frdoSteps = [
  { step: "1", label: "Заполнение данных", desc: "Автоматически из карточки ученика" },
  { step: "2", label: "Формирование XML", desc: "По стандарту Рособрнадзора (ДПО/ПО)" },
  { step: "3", label: "Выгрузка в реестр", desc: "Один клик — данные в ФИС ФРДО" },
];

export const safetyItems = [
  { icon: Users, title: "Группы обучения", desc: "Формирование групп, назначение программ" },
  { icon: ClipboardList, title: "Протоколы", desc: "Автоформирование протоколов проверки знаний" },
  { icon: FileText, title: "Журналы", desc: "Электронные журналы всех видов инструктажей" },
  { icon: Award, title: "Удостоверения", desc: "Автоматическая генерация и печать" },
];

export const marketplaceDirs = [
  { icon: Factory, name: "Промышленная безопасность", count: "80+" },
  { icon: Zap, name: "Электробезопасность", count: "120+" },
  { icon: Flame, name: "Энергетическая безопасность", count: "40+" },
  { icon: Waves, name: "Охрана труда и другие", count: "60+" },
];

export { Building2, GraduationCap, Users, CheckCircle2, HardHat };
