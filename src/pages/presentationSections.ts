import React from "react";
import {
  BookOpen, FileText, Brain, Video, Shield, Database,
  Play, ClipboardList, Award, Lock,
  Sparkles, Headphones, Image, MessageSquare,
  Users, Globe, Zap, Smartphone, CheckCircle2
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
  { icon: Video, title: "Потеря времени", desc: "До 70% рабочего времени — на администрирование", color: "hsl(210 80% 50%)" },
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
  { icon: Brain, title: "ИИ-генерация", desc: "Курс из темы за 5 минут — до 35 уроков" },
  { icon: FileText, title: "Материалы", desc: "Текст, HTML, файлы, вложения к урокам" },
  { icon: Award, title: "Сертификаты", desc: "Удостоверения, дипломы, свидетельства — авто" },
  { icon: Lock, title: "Гибкие настройки", desc: "Последовательность, проходной балл, доступ" },
];

export const aiFeatures: FeatureItem[] = [
  { icon: Sparkles, text: "Генерация курсов из темы — до 35 уроков с контентом от 700 слов" },
  { icon: ClipboardList, text: "Генерация тестов — 15 вопросов с вариантами ответов" },
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
  { icon: Globe, text: "PWA — работает как нативное приложение" },
  { icon: Zap, text: "Оффлайн-режим — учёба без интернета" },
  { icon: MessageSquare, text: "Push-уведомления" },
  { icon: Smartphone, text: "Android и iOS" },
];

export interface PricingPlan {
  name: string; desc: string; price: string; students: string; courses: string; storage: string; popular?: boolean; features: string[];
}

export const pricingPlans: PricingPlan[] = [
  { name: "Бесплатный", desc: "Для знакомства с платформой", price: "0", students: "10", courses: "3", storage: "100 МБ", features: ["Настройки курсов", "Магазин курсов", "Чек-лист документов", "Видеоидентификация", "Брендирование", "Документы для ЛОО", "Охрана труда", "ФИС ФРДО", "ИИ-генерация", "ИИ-озвучка"] },
  { name: "Старт", desc: "Для начинающих организаций", price: "4 490", students: "100", courses: "15", storage: "3 ГБ", features: ["Настройки курсов", "Магазин курсов", "Чек-лист документов", "Видеоидентификация", "Брендирование", "Документы для ЛОО", "Охрана труда", "ФИС ФРДО", "ИИ-генерация", "ИИ-озвучка"] },
  { name: "Стандарт", desc: "Для активных организаций", price: "6 990", students: "200", courses: "30", storage: "10 ГБ", popular: true, features: ["Настройки курсов", "Магазин курсов", "Чек-лист документов", "Видеоидентификация", "Брендирование", "Документы для ЛОО", "Охрана труда", "ФИС ФРДО", "ИИ-генерация", "ИИ-озвучка"] },
  { name: "Профессиональный", desc: "Для крупных организаций", price: "16 990", students: "1 000", courses: "50", storage: "50 ГБ", features: ["Настройки курсов", "Магазин курсов", "Чек-лист документов", "Видеоидентификация", "Брендирование", "Документы для ЛОО", "Охрана труда", "ФИС ФРДО+", "Вебинары", "Видеосервис+", "ИИ-генерация", "ИИ-озвучка"] },
  { name: "Максимальный", desc: "Полный доступ ко всем функциям", price: "24 990", students: "∞", courses: "∞", storage: "100 ГБ", features: ["Настройки курсов", "Магазин курсов", "Чек-лист документов", "Видеоидентификация", "Брендирование", "Документы для ЛОО", "Охрана труда", "ФИС ФРДО+", "Вебинары", "Видеосервис+", "3D-тренажёры", "ИИ-генерация", "ИИ-озвучка"] },
];
