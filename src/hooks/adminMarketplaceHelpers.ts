import { MARKETPLACE_ORG_ID } from "@/constants/marketplace";

export const AUTO_CATEGORIZE_MAPPINGS: { keywords: string[]; categoryName: string; parentType: string; icon: string }[] = [
  { keywords: ["первая помощь", "медицин", "оказание помощи", "оказание первой помощи", "мероприятия по оказанию", "санитарн"], categoryName: "Медицина", parentType: "Охрана труда / Пожарная безопасность", icon: "Lightbulb" },
  { keywords: ["охрана труда", "безопасные условия", "правила по охране труда", "техники безопасности", "правила техники безопасности"], categoryName: "Охрана труда", parentType: "Охрана труда / Пожарная безопасность", icon: "ShieldCheck" },
  { keywords: ["пожарная безопасность", "пожарно-технический", "пожарн", "противопожарн"], categoryName: "Пожарная безопасность", parentType: "Охрана труда / Пожарная безопасность", icon: "Flame" },
  { keywords: ["промышленная безопасность", "ростехнадзор"], categoryName: "Промышленная безопасность", parentType: "Повышение квалификации", icon: "Factory" },
  { keywords: ["электробезопасность", "электроустановк", "электроустановок", "электроустановки", "эксплуатации электроуст"], categoryName: "Электробезопасность", parentType: "Повышение квалификации", icon: "Zap" },
  { keywords: ["энергетик", "теплоснабж", "котельн", "электрических станций", "электростанций", "электроэнергетич", "тепломеханич", "тепловых энерго"], categoryName: "Энергетика", parentType: "Повышение квалификации", icon: "Flame" },
  { keywords: ["экологич", "отходы"], categoryName: "Экологическая безопасность", parentType: "Повышение квалификации", icon: "Leaf" },
  { keywords: ["гидротехнич", "ГТС"], categoryName: "Гидротехнические сооружения", parentType: "Повышение квалификации", icon: "Droplets" },
  { keywords: ["строительный контроль", "строительн"], categoryName: "Строительный контроль", parentType: "Повышение квалификации", icon: "HardHat" },
];

export const PROGRAM_TYPE_GROUPS = [
  { category: "Повышение квалификации", badge: "ДПО" },
  { category: "Профессиональная переподготовка", badge: "ДПО" },
  { category: "Охрана труда / Пожарная безопасность", badge: "ОТ / ПБ" },
  { category: "Рабочие профессии", badge: "ПО" },
];

export { MARKETPLACE_ORG_ID };
