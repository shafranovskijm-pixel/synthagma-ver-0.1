// Backward-compatibility shim — re-exports everything from the refactored block-editor/ directory.
// All existing imports from "@/components/course-builder/BlockEditor" continue to work.
export {
  BlockEditor,
  BlockRenderer,
  blocksToJson,
  jsonToBlocks,
  markdownToBlocks,
  htmlToBlocks,
} from "./block-editor";

export type {
  BlockType,
  ContentBlock,
  QuizOption,
  SliderSlide,
  BlockEditorProps,
  StylePreset,
} from "./block-editor";
