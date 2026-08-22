import DOMPurify, { type Config } from "dompurify";

/**
 * Keep normal educational formatting while removing active content that can
 * execute in the Synthagma origin. The same function is used before imported
 * lessons are persisted and again at render time as defence in depth.
 */
const COURSE_HTML_CONFIG: Config = {
  USE_PROFILES: { html: true },
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: [
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "option",
    "svg",
    "math",
    "meta",
    "link",
    "base",
  ],
  FORBID_ATTR: ["srcdoc"],
};

export function sanitizeCourseHtml(html: string | null | undefined): string {
  return DOMPurify.sanitize(html ?? "", COURSE_HTML_CONFIG);
}
