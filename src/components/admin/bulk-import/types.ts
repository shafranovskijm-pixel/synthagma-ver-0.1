import { QuestionTags } from "@/utils/excelTestBulkParser";

export const VOLTAGE_OPTIONS = [
  { key: "v1000" as const, label: "до 1000 В" },
  { key: "vAbove1000" as const, label: "до и выше 1000 В" },
];

export const GROUP_OPTIONS = [
  { key: "gII" as const, label: "II" },
  { key: "gIII" as const, label: "III" },
  { key: "gIV" as const, label: "IV" },
  { key: "gV" as const, label: "V" },
];

export type VoltageKey = typeof VOLTAGE_OPTIONS[number]["key"];
export type GroupKey = typeof GROUP_OPTIONS[number]["key"];

export interface CourseCombo {
  sectionIdx: number;
  sectionTitle: string;
  voltage: VoltageKey;
  voltageLabel: string;
  group: GroupKey;
  groupLabel: string;
  questionCount: number;
  customTitle: string;
  selected: boolean;
}

export function getTagStats(tags: QuestionTags) {
  return {
    voltages: [
      tags.v1000 && "до 1000 В",
      tags.vAbove1000 && "до и выше 1000 В",
    ].filter(Boolean) as string[],
    groups: [
      tags.gII && "II",
      tags.gIII && "III",
      tags.gIV && "IV",
      tags.gV && "V",
    ].filter(Boolean) as string[],
  };
}
