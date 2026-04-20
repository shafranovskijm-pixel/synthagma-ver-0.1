import mammoth from "mammoth";
import { htmlToBlocks } from "@/components/course-builder/block-editor/parsers";
import type { ContentBlock } from "@/components/course-builder/BlockEditor";

export interface DocxImportResult {
  blocks: ContentBlock[];
  warnings: string[];
}

/**
 * Convert a .docx File into ContentBlock[] via mammoth → HTML → htmlToBlocks.
 * Inline images become base64 data URLs (later can be uploaded separately).
 */
export async function importDocxFile(file: File): Promise<DocxImportResult> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      styleMap: [
        "p[style-name='Title'] => h1",
        "p[style-name='Heading 1'] => h1",
        "p[style-name='Heading 2'] => h2",
        "p[style-name='Heading 3'] => h3",
        "p[style-name='Heading 4'] => h4",
        "p[style-name='Quote'] => blockquote",
      ],
      includeDefaultStyleMap: true,
    },
  );
  const blocks = htmlToBlocks(result.value || "");
  const warnings = (result.messages || []).map((m) => m.message).filter(Boolean);
  return { blocks, warnings };
}
