import DOMPurify from "dompurify";

const TEMPLATE_VARIABLE_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

const BLOCKED_PREVIEW_TAGS = [
  "audio",
  "button",
  "embed",
  "form",
  "iframe",
  "img",
  "input",
  "link",
  "object",
  "source",
  "style",
  "track",
  "video",
];

export function extractCampaignTemplateVariables(...templates: Array<string | null | undefined>) {
  const variables = new Set<string>();

  for (const template of templates) {
    for (const match of String(template || "").matchAll(TEMPLATE_VARIABLE_RE)) {
      variables.add(match[1]);
    }
  }

  return [...variables].sort((left, right) => left.localeCompare(right));
}

export function sanitizeCampaignHtmlForReport(html: string) {
  const sanitized = DOMPurify.sanitize(String(html || ""), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: BLOCKED_PREVIEW_TAGS,
    FORBID_ATTR: ["src", "srcset", "style"],
    ALLOW_DATA_ATTR: false,
  });

  const document = new DOMParser().parseFromString(sanitized, "text/html");
  document.querySelectorAll("a").forEach((link) => {
    link.removeAttribute("href");
    link.removeAttribute("target");
    link.removeAttribute("rel");
  });

  return document.body.innerHTML;
}

export function campaignAttachmentSummary(recipientFilter: unknown) {
  if (!recipientFilter || typeof recipientFilter !== "object" || Array.isArray(recipientFilter)) {
    return "Без вложений";
  }

  const meeting = (recipientFilter as Record<string, unknown>).meeting;
  if (!meeting || typeof meeting !== "object" || Array.isArray(meeting)) {
    return "Без вложений";
  }

  return (meeting as Record<string, unknown>).attach_ics === true
    ? "Календарное приглашение invite.ics"
    : "Без вложений";
}
