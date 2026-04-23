// Универсальный helper завершения LiveKit-вебинара.
// Используется и в кабинете организации (WebinarsManager), и в админке (AdminWebinarsOverview),
// чтобы цепочка stop-recording → end-room → status=ended всегда выполнялась полностью
// и пользователь видел пошаговый прогресс через toast.
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface EndLiveKitOptions {
  /** Показывать toast-progress (по умолчанию true). */
  showToast?: boolean;
}

/**
 * Корректно завершает LiveKit-вебинар:
 *  1) если идёт запись — останавливает Egress (чтобы не потерять MP4);
 *  2) удаляет LiveKit-комнату (моментально отключает участников, освобождает минуты тарифа);
 *  3) выставляет webinars.status = 'ended'.
 * Возвращает true, если все шаги выполнены без фатальной ошибки.
 */
export async function endLiveKitWebinar(
  webinarId: string,
  opts: EndLiveKitOptions = {},
): Promise<boolean> {
  const showToast = opts.showToast !== false;
  const toastId = showToast ? toast.loading("Останавливаю запись…") : undefined;

  try {
    const { data: full } = await supabase
      .from("webinars")
      .select("recording_status, source_type, room_name, player_settings")
      .eq("id", webinarId)
      .maybeSingle();

    const ps = ((full as any)?.player_settings ?? {}) as Record<string, any>;
    const roomName: string | null = ps?.livekit?.roomName ?? (full as any)?.room_name ?? null;
    const isLiveKit = (full as any)?.source_type === "livekit";

    // 1) Стоп записи (только если активна)
    if ((full as any)?.recording_status === "active") {
      try {
        await supabase.functions.invoke("livekit-stop-recording", { body: { webinarId } });
      } catch (e) {
        console.warn("[endLiveKitWebinar] stop-recording failed", e);
      }
    }

    // 2) Удалить комнату — даже если roomName в legacy-колонке (edge-функция читает оба места)
    if (showToast && toastId !== undefined) toast.loading("Закрываю комнату…", { id: toastId });
    if (isLiveKit && roomName) {
      try {
        await supabase.functions.invoke("livekit-end-room", { body: { webinarId } });
      } catch (e) {
        console.warn("[endLiveKitWebinar] end-room failed", e);
      }
    }

    // 3) Статус
    if (showToast && toastId !== undefined) toast.loading("Завершаю эфир…", { id: toastId });
    await supabase.from("webinars").update({ status: "ended" } as any).eq("id", webinarId);

    if (showToast && toastId !== undefined) toast.success("Эфир завершён", { id: toastId });
    return true;
  } catch (e) {
    console.error("[endLiveKitWebinar] error", e);
    if (showToast && toastId !== undefined) {
      toast.error((e as Error).message || "Не удалось завершить эфир", { id: toastId });
    }
    return false;
  }
}
