export type RtnUpdateKind = 'news' | 'source_change' | 'bank_release';
export type RtnUpdateFilter = RtnUpdateKind | 'questions';
export interface RtnUpdateEvent {
  id: string;
  sequence: number;
  kind: RtnUpdateKind;
  topic: string;
  previous_event_id: string | null;
  bank_id: string | null;
  source_revision_id: string | null;
  release_id: string | null;
  canonical_url: string;
  title: string;
  source_excerpt: string;
  own_summary: string;
  published_at: string | null;
  effective_from: string | null;
  observed_at: string;
  historical: boolean;
  notifiable: boolean;
}
export interface RtnNewsSourceHealth {
  code: 'official-news-rss';
  feed_url: 'https://www.gosnadzor.ru/news/rss/';
  last_checked_at: string | null;
  last_success_at: string | null;
  status: 'never_checked' | 'success' | 'partial' | 'error' | 'blocked';
  coverage_kind: 'unknown' | 'finite_rss_window' | 'verified_archive_interval';
  coverage_from: string | null;
  coverage_until: string | null;
  error_code: string | null;
  complete_archive: false;
}
export interface RtnUpdatePage {
  events: RtnUpdateEvent[];
  has_more: boolean;
  next_before_sequence: number | null;
  source_health: RtnNewsSourceHealth;
}
export interface RtnUpdateSummary {
  latest_event: RtnUpdateEvent | null;
  event_count: number;
  count_is_lower_bound: boolean;
  count_semantics: 'known_events_not_unread';
  source_health: RtnNewsSourceHealth;
}
