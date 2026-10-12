export interface CampaignRunFeedback {
  level: "success" | "info" | "warning" | "error";
  message: string;
  started: boolean;
}

const reasons: Record<string, string> = {
  manual_reconciliation_required: "Результат предыдущей отправки требует проверки. Повторная отправка не выполнялась.",
  ordinary_manual_reconciliation_required: "Результат предыдущей отправки требует проверки. Повторная отправка не выполнялась.",
  unresolved_attempt: "У предыдущей попытки не подтверждён результат. Сначала проверьте отчёт; повторная отправка не выполнялась.",
  unowned_sending_requires_review: "Состояние предыдущего запуска требует проверки. Повторная отправка не выполнялась.",
  already_running: "Кампания уже выполняется. Новый запуск не создан.",
  campaign_changed: "Кампания изменилась. Обновите список и проверьте её перед запуском.",
  user_paused: "Кампания приостановлена пользователем.",
  ab_wait_until_winner: "Кампания ожидает выбора варианта A/B-теста.",
  scheduled_in_future: "Кампания запланирована на более позднее время.",
  managed_by_mailing_send_jobs: "Кампания управляется отдельной очередью. Проверьте её состояние в отчёте.",
  consent_required: "Откройте редактор и подтвердите условия отправки перед запуском.",
  operator_attestation_required: "Откройте редактор и подтвердите готовность кампании перед запуском.",
  sender_not_found: "Отправитель больше недоступен. Проверьте выбранный ящик; отправка не началась.",
  sender_inactive: "Отправитель отключён. Проверьте настройки ящика; отправка не началась.",
  smtp_not_tested: "SMTP отправителя не подтверждён. Проверьте подключение ящика; отправка не началась.",
  campaign_org_mismatch: "Кампания и отправитель относятся к разным организациям. Обновите настройки; отправка не началась.",
  campaign_sender_mismatch: "Отправитель кампании изменился. Обновите список и проверьте настройки; отправка не началась.",
  invalid_count: "Не удалось подтвердить размер очереди. Проверьте состояние кампании; отправка не началась.",
};

export function campaignRunFeedback(data: any): CampaignRunFeedback {
  if (data?.quotaExceeded === true && data?.reason && reasons[data.reason]) return {
    level: "error", started: false, message: reasons[data.reason],
  };
  if (data?.quotaExceeded === true) return { level: "warning", started: false,
    message: "Отправка пока не началась: доступная квота отправителя исчерпана. Кампания остаётся на паузе до появления квоты." };
  if (data?.error) return { level: "error", started: false, message: reasons[data.error] || String(data.error) };
  if (data?.ok === true && Number.isInteger(data.started) && data.started > 0) return {
    level: "success", started: true,
    message: `Запущена отправка партии: ${data.started} писем.${data.deferred === true ? " Остальные получатели остаются в очереди; продолжение зависит от доступной квоты и работы планировщика." : ""}`,
  };
  if (data?.reason) return { level: data.reason === "already_running" ? "info" : "warning", started: false,
    message: reasons[data.reason] || "Новый запуск не подтверждён. Обновите список и проверьте состояние кампании." };
  if (data?.ok === true && (data.started === 0 || data.message === "Нет получателей в очереди")) return {
    level: "info", started: false, message: "Новая отправка не потребовалась: в выбранной очереди нет получателей.",
  };
  return { level: "error", started: false, message: "Не удалось подтвердить запуск. Проверьте состояние кампании перед повторной попыткой." };
}

export async function readCampaignRunFeedback(data: unknown, error: unknown): Promise<CampaignRunFeedback> {
  if (!error) return campaignRunFeedback(data);
  const response = (error as { context?: Response })?.context;
  if (response && typeof response.clone === "function") {
    try {
      const payload = await response.clone().json();
      if (payload?.error || payload?.reason || payload?.quotaExceeded) return campaignRunFeedback(payload);
    } catch { /* Non-JSON errors keep the fail-closed fallback below. */ }
  }
  return { level: "error", started: false, message: "Не удалось подтвердить запуск. Проверьте состояние кампании перед повторной попыткой." };
}

export function campaignPauseFeedback(reason: string | null | undefined, userPaused = false) {
  if (reason === "quota" || reason === "daily_quota") return {
    label: "Ожидает квоты / следующей партии", canResume: true,
    description: "Остальные адресаты остаются в очереди. Продолжение возможно при доступной квоте и работающем планировщике; точное время не подтверждено.",
  };
  if (reason === "ordinary_ab_wait") return { label: "Ожидает выбора A/B-варианта", canResume: false,
    description: "Отправка продолжится после выбора варианта A/B-теста." };
  if (reason && reason !== "user_paused") return { label: "Требуется проверка", canResume: false,
    description: reasons[reason] || "Кампания остановлена. Проверьте причину в отчёте перед новой отправкой." };
  return { label: userPaused || reason === "user_paused" ? "Приостановлена пользователем" : "На паузе", canResume: true,
    description: "Автоматическое продолжение не подтверждено. Перед продолжением проверьте состояние кампании." };
}
