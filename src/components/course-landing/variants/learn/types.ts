/**
 * Общий тип props для всех вариантов секции «Что вы освоите» (learn).
 * Все варианты получают одинаковый набор данных и колбэков редактора —
 * чтобы диспетчер `LandingLearnSection` мог подменять реализацию без
 * изменения вызывающего кода.
 */
import type { LearnItem } from "../../LandingLearnSection";

export interface LearnVariantProps {
  title: string;
  description: string;
  items: LearnItem[];
  isEditing?: boolean;
  onTitleChange?: (v: string) => void;
  onDescriptionChange?: (v: string) => void;
  onItemChange?: (index: number, field: keyof LearnItem, value: string) => void;
  onAddItem?: () => void;
  onRemoveItem?: (index: number) => void;
  onIconPickerOpen?: (index: number) => void;
}
