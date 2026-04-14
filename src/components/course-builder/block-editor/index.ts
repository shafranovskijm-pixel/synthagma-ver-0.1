// Re-export all public API so existing imports from "@/components/course-builder/BlockEditor" continue working
// via the backward-compat shim in BlockEditor.tsx

export type { BlockType, ContentBlock, QuizOption, SliderSlide, BlockEditorProps, StylePreset } from "./types";
export {
  blockTypeConfig,
  createBlock,
  calloutItems,
  blockCategories,
  convertibleTypes,
  textStyleableTypes,
  bgColorPresets,
  bgColorDotStyles,
  textColorPresets,
  quickStyles,
  wrapCalloutTargets,
  wrapOtherTargets,
  STYLE_PRESET_KEYS,
} from "./types";

export {
  linkifyHtml,
  sanitizeHtml,
  renderHtml,
  summarizeExistingContent,
  loadPresets,
  savePresets,
  extractStyle,
  describeStyle,
} from "./utils";

export { blocksToJson, jsonToBlocks, markdownToBlocks, htmlToBlocks } from "./parsers";

export { BlockRenderer } from "./BlockRenderer";
export { BlockEditor } from "./BlockEditorMain";
