/**
 * Единый тип Webinar для всего приложения.
 * Раньше интерфейс дублировался в 3+ местах с расхождениями.
 *
 * Источник истины — таблица `webinars` в БД.
 * Используем `Database['public']['Tables']['webinars']['Row']` как базу,
 * расширяем production-полями (recording_*, player_settings).
 */
import type { Database } from "@/integrations/supabase/types";

export type WebinarRow = Database["public"]["Tables"]["webinars"]["Row"];

/** Полная карточка вебинара для UI организации */
export interface Webinar {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string | null;
  duration_minutes: number | null;
  status: string;
  source_type: string;
  kinescope_live_id: string | null;
  kinescope_video_id: string | null;
  external_url: string | null;
  embed_url: string | null;
  rtmp_url: string | null;
  rtmp_key: string | null;
  cover_url: string | null;
  course_id: string | null;
  created_at: string;
  public_token: string | null;
  allow_guests: boolean;
  guest_password: string | null;
  recording_url?: string | null;
  recording_status?: string | null;
  recording_size_bytes?: number | null;
  player_settings?: Record<string, unknown> | null;
}

/** Облегчённый тип для списков и пикеров */
export type WebinarSummary = Pick<
  Webinar,
  "id" | "title" | "scheduled_at" | "status" | "cover_url" | "source_type"
>;
