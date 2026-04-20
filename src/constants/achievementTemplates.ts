import { HardHat, Stethoscope, Monitor, Star, type LucideIcon } from "lucide-react";

export const RARITY_STYLES: Record<string, { bg: string; border: string; badge: string; label: string; glow: string }> = {
  common:    { bg: "bg-muted/40",       border: "border-border",           badge: "bg-muted text-muted-foreground",   label: "Обычное",     glow: "" },
  rare:      { bg: "bg-blue-500/5",     border: "border-blue-400/40",      badge: "bg-blue-500/15 text-blue-400",     label: "Редкое",      glow: "shadow-blue-500/10 shadow-md" },
  epic:      { bg: "bg-purple-500/5",   border: "border-purple-400/40",    badge: "bg-purple-500/15 text-purple-400", label: "Эпичное",     glow: "shadow-purple-500/15 shadow-lg" },
  legendary: { bg: "bg-amber-500/5",    border: "border-amber-400/50",     badge: "bg-amber-500/15 text-amber-500",   label: "Легендарное", glow: "shadow-amber-500/20 shadow-lg" },
};

export const getRarity = (r: string) => RARITY_STYLES[r] || RARITY_STYLES.common;

export interface TemplateItem {
  name: string;
  description: string;
  icon: string;
  rarity: string;
  code: string;
  category: string;
  color: string;
}

export interface TemplateCategory {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  gradient: string;
  borderColor: string;
  items: TemplateItem[];
}

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  {
    id: "construction", name: "Строительство", description: "Достижения для строительных курсов и охраны труда",
    icon: HardHat, gradient: "from-orange-500/20 to-amber-500/10", borderColor: "border-orange-400/30",
    items: [
      { name: "Прораб", description: "Завершил первый курс по строительству", icon: "🏗️", rarity: "common", code: "construction_start", category: "learning", color: "#f97316" },
      { name: "Каменщик знаний", description: "Изучил 10 уроков подряд", icon: "🧱", rarity: "rare", code: "brick_learner", category: "streak", color: "#3b82f6" },
      { name: "Архитектор", description: "Прошёл все курсы в категории", icon: "🏛️", rarity: "epic", code: "architect", category: "completion", color: "#8b5cf6" },
      { name: "Мастер безопасности", description: "Сдал экзамен по ОТ на 100%", icon: "🦺", rarity: "legendary", code: "safety_master", category: "excellence", color: "#f59e0b" },
      { name: "Высотник", description: "Завершил курс по работам на высоте", icon: "🏔️", rarity: "rare", code: "height_worker", category: "learning", color: "#06b6d4" },
    ],
  },
  {
    id: "medicine", name: "Медицина", description: "Достижения для медицинских и санитарных курсов",
    icon: Stethoscope, gradient: "from-emerald-500/20 to-teal-500/10", borderColor: "border-emerald-400/30",
    items: [
      { name: "Первая помощь", description: "Прошёл курс по первой помощи", icon: "🩺", rarity: "common", code: "first_aid", category: "learning", color: "#10b981" },
      { name: "Исследователь", description: "Изучил 20 уроков", icon: "🔬", rarity: "rare", code: "researcher", category: "streak", color: "#3b82f6" },
      { name: "Доктор наук", description: "Прошёл 5 медицинских курсов", icon: "💊", rarity: "epic", code: "doctor", category: "completion", color: "#8b5cf6" },
      { name: "Светило медицины", description: "Идеальный результат по всем тестам", icon: "⚕️", rarity: "legendary", code: "medical_star", category: "excellence", color: "#f59e0b" },
    ],
  },
  {
    id: "it", name: "IT и технологии", description: "Достижения для IT-курсов и цифровых навыков",
    icon: Monitor, gradient: "from-cyan-500/20 to-blue-500/10", borderColor: "border-cyan-400/30",
    items: [
      { name: "Кодер", description: "Начал обучение по программированию", icon: "💻", rarity: "common", code: "coder_start", category: "learning", color: "#06b6d4" },
      { name: "Баг-хантер", description: "Сдал 10 тестов без ошибок", icon: "🐛", rarity: "rare", code: "bug_hunter", category: "streak", color: "#3b82f6" },
      { name: "Деплой мастер", description: "Завершил продвинутый курс", icon: "🚀", rarity: "epic", code: "deploy_master", category: "completion", color: "#8b5cf6" },
      { name: "Full Stack", description: "Прошёл все IT-курсы организации", icon: "🧠", rarity: "legendary", code: "full_stack", category: "excellence", color: "#f59e0b" },
    ],
  },
  {
    id: "general", name: "Общие", description: "Универсальные достижения для любых курсов",
    icon: Star, gradient: "from-violet-500/20 to-pink-500/10", borderColor: "border-violet-400/30",
    items: [
      { name: "Первый шаг", description: "Начал обучение на платформе", icon: "👣", rarity: "common", code: "first_step", category: "learning", color: "#6366f1" },
      { name: "Книжный червь", description: "Провёл 10 часов за обучением", icon: "📖", rarity: "rare", code: "bookworm", category: "streak", color: "#3b82f6" },
      { name: "Звезда курса", description: "Лучший результат на курсе", icon: "🌟", rarity: "epic", code: "course_star", category: "excellence", color: "#8b5cf6" },
      { name: "Чемпион", description: "Прошёл все курсы с отличием", icon: "🏆", rarity: "legendary", code: "champion", category: "excellence", color: "#f59e0b" },
      { name: "Марафонец", description: "30 дней подряд обучения", icon: "🏃", rarity: "epic", code: "marathoner", category: "streak", color: "#ec4899" },
    ],
  },
];
