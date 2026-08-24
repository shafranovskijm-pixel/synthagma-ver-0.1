import {
  BookOpen, FileText, Brain, Video, Shield, Database,
  Play, ClipboardList, Award, Lock,
  Sparkles, Headphones, Image, MessageSquare,
  Users, Globe, Zap, Smartphone
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface FeatureItem { icon: LucideIcon; label?: string; title?: string; desc?: string; text?: string; }

export const heroTags: FeatureItem[] = [
  { icon: BookOpen, label: "LMS" },
  { icon: FileText, label: "Документооборот" },
  { icon: Brain, label: "ИИ-ассистент" },
];

export const problemCards = [
  { icon: FileText, title: "Бумажная работа", desc: "Договоры, протоколы, приказы — всё вручную", color: "hsl(0 72% 51%)" },
  { icon: Database, title: "Разрозненные системы", desc: "Excel, мессенджеры, почта, диски — хаос", color: "hsl(38 92% 50%)" },
  { icon: Shield, title: "Нет контроля", desc: "Кто учится, кто завершил, кто просрочил — неизвестно", color: "hsl(262 80% 55%)" },
  { icon: Video, title: "Повторяющиеся операции", desc: "Одни и те же данные приходится переносить между разными инструментами", color: "hsl(210 80% 50%)" },
];

export const solutionMarquee: FeatureItem[] = [
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
  { icon: Brain, title: "ИИ-генерация", desc: "Подготовка структуры курса, материалов и тестовых вопросов" },
  { icon: FileText, title: "Материалы", desc: "Текст, HTML, файлы, вложения к урокам" },
  { icon: Award, title: "Сертификаты", desc: "Удостоверения, дипломы, свидетельства — авто" },
  { icon: Lock, title: "Гибкие настройки", desc: "Последовательность, проходной балл, доступ" },
];

export const aiFeatures: FeatureItem[] = [
  { icon: Sparkles, text: "Генерация структуры курса и материалов по заданной теме" },
  { icon: ClipboardList, text: "Генерация тестовых вопросов с вариантами ответов" },
  { icon: Headphones, text: "Озвучка лекций (SaluteSpeech) — русский язык" },
  { icon: Image, text: "Генерация обложек для курсов" },
  { icon: MessageSquare, text: "ИИ-чат для учеников — отвечает по материалу курса" },
];

export const documentTypes = [
  "Договор на обучение", "Приказ о зачислении", "Протокол проверки знаний",
  "Акт выполненных работ", "Удостоверение", "Согласие на обработку ПД",
  "Счёт на оплату", "Диплом о переподготовке", "Свидетельство о профессии",
];

export const safetyFeatures = [
  { icon: Users, title: "Группы обучения", desc: "Формирование групп, назначение программ" },
  { icon: ClipboardList, title: "Протоколы", desc: "Автоформирование протоколов проверки знаний" },
  { icon: FileText, title: "Журналы", desc: "Электронные журналы всех видов инструктажей" },
  { icon: Award, title: "Удостоверения", desc: "Автоматическая генерация и печать" },
];

export const mobileFeatures: FeatureItem[] = [
  { icon: Globe, text: "PWA — открывается в поддерживаемом браузере" },
  { icon: Zap, text: "Можно добавить на главный экран устройства" },
  { icon: MessageSquare, text: "Уведомления внутри платформы" },
  { icon: Smartphone, text: "Адаптивный интерфейс для телефона и планшета" },
];
