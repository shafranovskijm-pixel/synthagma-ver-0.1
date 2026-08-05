/**
 * P0 follow-up: черновик НИКОГДА не запускается прямым вызовом из списка.
 *
 * - draft / failed  -> «Подготовить запуск» (открыть редактор, где обязательны
 *   отправитель, получатели, согласие, переменные и квота);
 * - paused / зависший sending -> «Продолжить» (прямой resume, серверное
 *   подтверждение согласия уже сохранено);
 * - остальное -> никакой кнопки запуска.
 */
export type CampaignLaunchAction = "prepare" | "resume" | "none";

export function campaignLaunchAction(status: string, stuck: boolean): CampaignLaunchAction {
  if (status === "paused" || (status === "sending" && stuck)) return "resume";
  if (status === "draft" || status === "failed") return "prepare";
  return "none";
}

export function launchActionLabel(action: CampaignLaunchAction): string | null {
  if (action === "resume") return "Продолжить";
  if (action === "prepare") return "Подготовить запуск";
  return null;
}

/** Проверенный отправитель организации: активен и прошёл SMTP-тест. */
export interface VerifiedSenderLike {
  id: string;
  label: string | null;
  from_email: string;
  is_active: boolean;
  smtp_status: string | null;
}

export function pickVerifiedSender<T extends VerifiedSenderLike>(rows: T[] | null | undefined): T | null {
  const list = rows || [];
  return list.find((s) => s.is_active === true && s.smtp_status === "ok") || null;
}
