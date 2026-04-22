import React from "react";
import {
  GraduationCap, Award, ShieldCheck, Store, BookOpen,
  Factory, Zap, Flame, Leaf, Droplets, HardHat, Lightbulb, Building2,
  DollarSign, Briefcase, TrendingUp,
  Brain, Heart, Cpu, Stethoscope, Scale, Truck, Wheat, Palette,
  Megaphone, Wrench, Pickaxe, Calculator, Microscope, Plane,
  Newspaper, Activity, Hammer, Users, BookMarked, Languages,
} from "lucide-react";

export const programTypeMetaAdmin: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  "Повышение квалификации": { icon: GraduationCap, color: "text-blue-600", bgColor: "bg-blue-500/10" },
  "Профессиональная переподготовка": { icon: Award, color: "text-violet-600", bgColor: "bg-violet-500/10" },
  "Охрана труда / Пожарная безопасность": { icon: ShieldCheck, color: "text-amber-600", bgColor: "bg-amber-500/10" },
  "Рабочие профессии": { icon: Store, color: "text-emerald-600", bgColor: "bg-emerald-500/10" },
};

export const subCategoryMetaAdmin: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  "Промышленная безопасность": { icon: Factory, color: "text-orange-500", bgColor: "bg-orange-500/10" },
  "Электробезопасность": { icon: Zap, color: "text-yellow-500", bgColor: "bg-yellow-500/10" },
  "Энергетика": { icon: Flame, color: "text-red-500", bgColor: "bg-red-500/10" },
  "Экологическая безопасность": { icon: Leaf, color: "text-green-500", bgColor: "bg-green-500/10" },
  "Гидротехнические сооружения": { icon: Droplets, color: "text-blue-500", bgColor: "bg-blue-500/10" },
  "Строительный контроль": { icon: HardHat, color: "text-accent", bgColor: "bg-accent/10" },
};

export const ICON_OPTIONS: { name: string; icon: React.ElementType; label: string }[] = [
  { name: "Factory", icon: Factory, label: "Промышленность" },
  { name: "Zap", icon: Zap, label: "Электричество" },
  { name: "Flame", icon: Flame, label: "Огонь" },
  { name: "Leaf", icon: Leaf, label: "Экология" },
  { name: "Droplets", icon: Droplets, label: "Вода" },
  { name: "HardHat", icon: HardHat, label: "Стройка" },
  { name: "ShieldCheck", icon: ShieldCheck, label: "Защита" },
  { name: "BookOpen", icon: BookOpen, label: "Книга" },
  { name: "Award", icon: Award, label: "Награда" },
  { name: "Lightbulb", icon: Lightbulb, label: "Идея" },
  { name: "Building2", icon: Building2, label: "Здание" },
  { name: "GraduationCap", icon: GraduationCap, label: "Учёба" },
  { name: "DollarSign", icon: DollarSign, label: "Финансы" },
  { name: "Briefcase", icon: Briefcase, label: "Бизнес" },
  { name: "TrendingUp", icon: TrendingUp, label: "Рост" },
];

export const iconMap: Record<string, React.ElementType> = {
  Factory, Zap, Flame, Leaf, Droplets, HardHat, ShieldCheck, BookOpen, Award, Lightbulb, Building2, GraduationCap,
  DollarSign, Briefcase, TrendingUp,
  Brain, Heart, Cpu, Stethoscope, Scale, Truck, Wheat, Palette,
  Megaphone, Wrench, Pickaxe, Calculator, Microscope, Plane,
  Newspaper, Activity, Hammer, Users, BookMarked, Languages,
};

// Маппинг родительских направлений ПП на иконки и цвета (для ipo.msk.ru)
export const ppCategoryMeta: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  "Психология": { icon: Brain, color: "text-violet-600", bgColor: "bg-violet-500/10" },
  "Медицина": { icon: Heart, color: "text-red-500", bgColor: "bg-red-500/10" },
  "Информатика": { icon: Cpu, color: "text-blue-600", bgColor: "bg-blue-500/10" },
  "Бухгалтерия": { icon: DollarSign, color: "text-emerald-600", bgColor: "bg-emerald-500/10" },
  "Менеджмент": { icon: Briefcase, color: "text-indigo-600", bgColor: "bg-indigo-500/10" },
  "Юриспруденция": { icon: Scale, color: "text-slate-700", bgColor: "bg-slate-500/10" },
  "Логистика": { icon: Truck, color: "text-orange-600", bgColor: "bg-orange-500/10" },
  "Агрономия": { icon: Wheat, color: "text-yellow-600", bgColor: "bg-yellow-500/10" },
  "Архитектура и дизайн": { icon: Palette, color: "text-pink-600", bgColor: "bg-pink-500/10" },
  "Маркетинг": { icon: TrendingUp, color: "text-cyan-600", bgColor: "bg-cyan-500/10" },
  "Реклама и PR": { icon: Megaphone, color: "text-fuchsia-600", bgColor: "bg-fuchsia-500/10" },
  "Машиностроение": { icon: Wrench, color: "text-slate-600", bgColor: "bg-slate-500/10" },
  "Горная промышленность": { icon: Pickaxe, color: "text-amber-700", bgColor: "bg-amber-500/10" },
  "Сметное дело": { icon: Calculator, color: "text-emerald-700", bgColor: "bg-emerald-500/10" },
  "Метрология": { icon: Microscope, color: "text-teal-600", bgColor: "bg-teal-500/10" },
  "Транспорт (БДД)": { icon: Plane, color: "text-sky-600", bgColor: "bg-sky-500/10" },
  "Журналистика": { icon: Newspaper, color: "text-stone-600", bgColor: "bg-stone-500/10" },
  "Спорт и фитнес": { icon: Activity, color: "text-lime-600", bgColor: "bg-lime-500/10" },
  "Строительство": { icon: Hammer, color: "text-orange-500", bgColor: "bg-orange-500/10" },
  "Соцработа": { icon: Users, color: "text-rose-600", bgColor: "bg-rose-500/10" },
  "Педагогика": { icon: BookMarked, color: "text-blue-500", bgColor: "bg-blue-500/10" },
  "Логопедия": { icon: Languages, color: "text-purple-600", bgColor: "bg-purple-500/10" },
  "Охрана труда": { icon: ShieldCheck, color: "text-amber-600", bgColor: "bg-amber-500/10" },
  "Экология": { icon: Leaf, color: "text-green-600", bgColor: "bg-green-500/10" },
  "Электроэнергетика": { icon: Zap, color: "text-yellow-500", bgColor: "bg-yellow-500/10" },
  "Теплоэнергетика": { icon: Flame, color: "text-red-600", bgColor: "bg-red-500/10" },
  "Нефтегазовое дело": { icon: Droplets, color: "text-blue-700", bgColor: "bg-blue-500/10" },
  "Экономика": { icon: TrendingUp, color: "text-emerald-600", bgColor: "bg-emerald-500/10" },
  "ГМУ": { icon: Building2, color: "text-indigo-700", bgColor: "bg-indigo-500/10" },
  "Закупки": { icon: Briefcase, color: "text-teal-700", bgColor: "bg-teal-500/10" },
};

export const getPpCategoryMeta = (name: string) =>
  ppCategoryMeta[name] || { icon: GraduationCap, color: "text-primary", bgColor: "bg-primary/10" };

// Shared between CourseStoreManager and AdminMarketplaceManager
export const programTypeMeta: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  ...programTypeMetaAdmin,
};

export const subCategoryMeta: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  ...subCategoryMetaAdmin,
};

export const getProgramTypeMeta = (category: string) =>
  programTypeMeta[category] || { icon: BookOpen, color: "text-primary", bgColor: "bg-primary/10" };

export const getSubCategoryMeta = (category: string) =>
  subCategoryMeta[category] || { icon: BookOpen, color: "text-primary", bgColor: "bg-primary/10" };

export const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "Ожидает", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  approved: { label: "Одобрена", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  paid: { label: "Оплачена", color: "bg-green-500/10 text-green-600 border-green-500/20" },
  completed: { label: "Завершена", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  cancelled: { label: "Отменена", color: "bg-red-500/10 text-red-600 border-red-500/20" },
};
