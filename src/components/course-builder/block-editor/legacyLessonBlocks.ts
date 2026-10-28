import type { ContentBlock, QuizOption } from "./types";

type Row = Record<string, unknown>;
const own = (row: Row, key: string) => Object.prototype.hasOwnProperty.call(row, key);
const row = (value: unknown): value is Row => !!value && typeof value === "object" && !Array.isArray(value);
const calloutKinds = new Set(["info", "warning", "tip", "success", "danger"]);
function text(block: Row, key: string, legacy?: string): string {
  const value = own(block, key) ? block[key] : legacy ? block[legacy] : undefined;
  if (value === undefined) return "";
  if (typeof value !== "string") throw new Error("Содержимое блока не удалось безопасно открыть. Исходные данные сохранены.");
  return value;
}
function quizOptions(block: Row): QuizOption[] {
  if (own(block, "quizOptions")) {
    return Array.isArray(block.quizOptions) && block.quizOptions.every(option => row(option) && typeof option.text === "string" && typeof option.isCorrect === "boolean")
      ? block.quizOptions.map(option => ({ ...option })) as QuizOption[] : [];
  }
  if (!Array.isArray(block.options)) return [];
  if (block.options.every(option => typeof option === "string")) {
    const verified = block.options.every(option => option.trim() !== "") && Number.isInteger(block.correctIndex) && Number(block.correctIndex) >= 0 && Number(block.correctIndex) < block.options.length;
    return block.options.map((option, index) => ({ text: option, isCorrect: verified && index === block.correctIndex }));
  }
  if (!block.options.every(option => row(option) && typeof option.text === "string")) return [];
  const options = block.options as Row[];
  const identities = options.map(option => option.id);
  const validIds = identities.every(id => typeof id === "string" && id !== "") && new Set(identities).size === options.length;
  const explicitFlags = options.every(option => typeof option.isCorrect === "boolean" && (option.text as string).trim() !== "");
  const exactlyOne = options.filter(option => option.isCorrect === true).length === 1;
  const indexAgrees = !own(block, "correctIndex") || (Number.isInteger(block.correctIndex) && Number(block.correctIndex) >= 0 && Number(block.correctIndex) < options.length && options[Number(block.correctIndex)].isCorrect === true);
  const verified = validIds && explicitFlags && exactlyOne && indexAgrees;
  // False here means unconfirmed view state, never a source/key rewrite or a guessed first answer.
  return options.map(option => ({ ...option, text: option.text as string, isCorrect: verified && option.isCorrect === true }));
}

/** View-only aliases. The source object/IDs/order/unknown fields are never mutated. */
export function normalizeLessonBlocks(values: unknown[]): ContentBlock[] {
  return values.map(value => {
    // Other lesson formats (for example slide arrays) are opaque here, not migrated.
    if (!row(value) || typeof value.id !== "string" || !value.id || typeof value.type !== "string") return value as unknown as ContentBlock;
    const block: Row = { ...value };
    if (value.type === "heading") {
      if (!Number.isInteger(value.level) || Number(value.level) < 1 || Number(value.level) > 6) throw new Error("Уровень заголовка не подтверждён. Исходные данные сохранены.");
      block.type = "heading" + Math.min(Number(value.level), 4);
    } else if (value.type === "callout") {
      if (typeof value.variant !== "string" || !calloutKinds.has(value.variant)) throw new Error("Вид заметки не подтверждён. Исходные данные сохранены.");
      block.type = "callout-" + value.variant;
    }
    block.content = text(value, "content", "text");
    switch (block.type) {
      case "quiz":
        block.quizQuestion = text(value, "quizQuestion", "question");
        block.quizOptions = quizOptions(value);
        block.quizExplanation = text(value, "quizExplanation", "explanation");
        break;
      case "image": block.imageSrc = text(value, "imageSrc", "url"); block.imageAlt = text(value, "imageAlt", "alt"); break;
      case "button":
        block.buttonLabel = text(value, "buttonLabel", "label"); block.buttonUrl = text(value, "buttonUrl", "url");
        if (!own(value, "buttonVariant") && typeof value.variant === "string") block.buttonVariant = value.variant === "default" ? "primary" : value.variant;
        break;
      case "accordion": {
        const source = own(value, "accordionItems") ? value.accordionItems : value.items;
        if (source !== undefined) {
          if (!Array.isArray(source) || !source.every(item => row(item) && typeof item.id === "string" && typeof item.title === "string" && typeof item.content === "string")) {
            throw new Error("Разделы блока не удалось безопасно открыть. Исходные данные сохранены.");
          }
          block.accordionItems = source.map(item => ({ ...item }));
        } else block.accordionTitle = text(value, "accordionTitle", "title");
        break;
      }
      default:
        if (String(block.type).startsWith("callout-") || block.type === "highlight") block.calloutTitle = text(value, "calloutTitle", "title");
    }
    return block as unknown as ContentBlock;
  });
}

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (!row(value)) return value;
  return Object.fromEntries(Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => [key, ordered(value[key])]));
}
const same = (left: unknown, right: unknown) => JSON.stringify(ordered(left)) === JSON.stringify(ordered(right));

/** Keep source bytes on a no-edit save; on edit, map changed known fields back by stable ID. */
export function serializeLessonBlocks(blocks: ContentBlock[], originalContent?: string | null): string {
  if (typeof originalContent !== "string") return JSON.stringify(blocks);
  let originals: unknown;
  try { originals = JSON.parse(originalContent); } catch { return JSON.stringify(blocks); }
  if (!Array.isArray(originals)) return JSON.stringify(blocks);
  const baseline = normalizeLessonBlocks(originals);
  if (same(blocks, baseline)) return originalContent;
  const byId = new Map<string, { source: Row; normalized: ContentBlock }>();
  originals.forEach((source: unknown, index) => {
    if (!row(source) || typeof source.id !== "string" || byId.has(source.id)) throw new Error("Идентификаторы блоков неоднозначны. Исходные данные не перезаписаны.");
    byId.set(source.id, { source, normalized: baseline[index] });
  });
  return JSON.stringify(blocks.map(block => {
    const previous = byId.get(block.id);
    if (!previous) return block;
    const original = previous.source, normalized = previous.normalized as unknown as Row;
    const current = block as unknown as Row;
    const output: Row = { ...original };
    const alias = (canonical: string, legacy: string, value: unknown) => { output[!own(original, canonical) && own(original, legacy) ? legacy : canonical] = value; };
    // Legacy mirrors are not editor inputs. After our previous save they may be stale
    // in memory while originalContent already contains the saved canonical change.
    const mirrors = new Set<string>();
    if (own(current, "content")) mirrors.add("text");
    if (original.type === "heading") mirrors.add("level");
    if (original.type === "callout" || own(current, "buttonVariant")) mirrors.add("variant");
    if (own(current, "calloutTitle") || own(current, "accordionTitle")) mirrors.add("title");
    if (own(current, "quizQuestion")) mirrors.add("question");
    if (own(current, "quizOptions")) { mirrors.add("options"); mirrors.add("correctIndex"); }
    if (own(current, "quizExplanation")) mirrors.add("explanation");
    if (own(current, "imageSrc") || own(current, "buttonUrl")) mirrors.add("url");
    if (own(current, "imageAlt")) mirrors.add("alt");
    if (own(current, "buttonLabel")) mirrors.add("label");
    if (own(current, "accordionItems")) mirrors.add("items");
    for (const [key, value] of Object.entries(current)) {
      if (mirrors.has(key) || same(value, normalized[key])) continue;
      if (key === "type" && original.type === "heading" && /^heading[1-4]$/.test(String(value))) {
        output.type = "heading"; output.level = Number(String(value).slice(-1));
      } else if (key === "type" && original.type === "callout" && /^callout-(info|warning|tip|success|danger)$/.test(String(value))) {
        output.type = "callout"; output.variant = String(value).slice(8);
      } else if (key === "content") alias(key, "text", value);
      else if (key === "quizQuestion") alias(key, "question", value);
      else if (key === "quizExplanation") alias(key, "explanation", value);
      else if (key === "imageSrc" || key === "buttonUrl") alias(key, "url", value);
      else if (key === "imageAlt") alias(key, "alt", value);
      else if (key === "buttonLabel") alias(key, "label", value);
      else if (key === "buttonVariant" && !own(original, key) && own(original, "variant")) output.variant = value === "primary" ? "default" : value;
      else if (key === "calloutTitle" || key === "accordionTitle") alias(key, "title", value);
      else if (key === "accordionItems") alias(key, "items", value);
      else if (key === "quizOptions" && !own(original, key) && own(original, "options")) {
        if (!Array.isArray(value) || !value.every(option => row(option) && typeof option.text === "string" && typeof option.isCorrect === "boolean")) throw new Error("Варианты самопроверки не подтверждены. Исходные данные не перезаписаны.");
        const optionsToSave = value as QuizOption[];
        const correct = optionsToSave.map((option, index) => option.isCorrect === true ? index : -1).filter(index => index >= 0);
        if (Array.isArray(original.options) && original.options.every(option => typeof option === "string")) {
          output.options = optionsToSave.map(option => option.text);
          if (correct.length === 1) output.correctIndex = correct[0]; else delete output.correctIndex;
        } else if (Array.isArray(original.options) && original.options.every(option => row(option) && typeof option.id === "string")) {
          const oldOptions = original.options as Row[];
          if (new Set(oldOptions.map(option => option.id)).size !== oldOptions.length || !optionsToSave.every(option => typeof option.id === "string" && option.id !== "") || new Set(optionsToSave.map(option => option.id)).size !== optionsToSave.length) throw new Error("Идентификаторы вариантов неоднозначны. Исходные данные не перезаписаны.");
          const oldById = new Map(oldOptions.map(option => [option.id, option]));
          const beforeOptions = normalized.quizOptions as QuizOption[];
          const beforeById = new Map(beforeOptions.map(option => [option.id, option]));
          const keyEdited = optionsToSave.some(option => { const beforeOption = beforeById.get(option.id); return beforeOption ? beforeOption.isCorrect !== option.isCorrect : option.isCorrect === true; });
          output.options = optionsToSave.map(option => {
            const old = oldById.get(option.id), beforeOption = beforeById.get(option.id);
            if (!old || !beforeOption) return { ...option };
            const next = { ...old };
            for (const [field, fieldValue] of Object.entries(option)) {
              if (field === "isCorrect" && !keyEdited) continue;
              if (!same(fieldValue, beforeOption[field]) || field === "isCorrect" && keyEdited) next[field] = fieldValue;
            }
            return next;
          });
          // Object-option flags are the existing authority; never materialize a top-level index.
          if (own(original, "correctIndex") && keyEdited) { if (correct.length === 1) output.correctIndex = correct[0]; else delete output.correctIndex; }
        } else throw new Error("Форма вариантов не подтверждена. Исходные данные не перезаписаны.");
      } else output[key] = value;
    }
    return output;
  }));
}
