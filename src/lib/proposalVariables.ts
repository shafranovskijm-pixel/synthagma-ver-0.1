/**
 * Подстановка переменных в HTML-блоки коммерческого предложения.
 * Поддерживает переменные курса: {{course_name}}, {{course_duration}}, {{course_price}}, {{course_url}}
 * и компании: {{company_name}}, {{contact_person}}.
 */

export interface ProposalVariableContext {
  course?: {
    title?: string | null;
    duration?: string | null;
    price?: number | null;
    slug?: string | null;
    id?: string;
  } | null;
  companyName?: string | null;
  contactPerson?: string | null;
  webinarTitle?: string | null;
  webinarDate?: string | null;
  webinarTime?: string | null;
}

const moneyFmt = new Intl.NumberFormat("ru-RU");

export function applyProposalVariables(html: string, ctx: ProposalVariableContext): string {
  if (!html) return "";
  const courseUrl = ctx.course?.slug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/c/${ctx.course.slug}`
    : "#";
  const map: Record<string, string> = {
    course_name: ctx.course?.title || "",
    course_duration: ctx.course?.duration || "",
    course_price: ctx.course?.price != null ? `${moneyFmt.format(ctx.course.price)} ₽` : "",
    course_url: courseUrl,
    company_name: ctx.companyName || "",
    contact_person: ctx.contactPerson || "",
    webinar_title: ctx.webinarTitle || "",
    webinar_date: ctx.webinarDate || "",
    webinar_time: ctx.webinarTime || "",
  };
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => (key in map ? map[key] : `{{${key}}}`));
}
