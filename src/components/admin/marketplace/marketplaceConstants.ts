import React from "react";
import {
  GraduationCap, Award, ShieldCheck, Store, BookOpen,
  Factory, Zap, Flame, Leaf, Droplets, HardHat, Lightbulb, Building2,
  DollarSign, Briefcase, TrendingUp,
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
};

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
