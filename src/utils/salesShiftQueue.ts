import type { SalesLead } from '@/hooks/useSalesManager';
import { getRegionLocalTime, getRegionTimezone } from '@/utils/regionTimezones';

export interface ShiftQueueItem {
  lead: SalesLead;
  localTime: string | null;      // "HH:mm" в местной зоне лида
  mskLabel: string | null;       // "МСК+3"
  minutesUntilClose: number;     // сколько минут до 18:00 по местному
  hasTimezone: boolean;
}

/** Рабочее окно — 09:00..18:00 по местному времени лида. */
const WORK_START = 9;
const WORK_END = 18;

/** Статусы, по которым уже не звоним. */
const DEAD_STATUSES = new Set(['won', 'client', 'not_interested']);

/**
 * Формирует очередь «кому звонить прямо сейчас».
 * - фильтрует по рабочему окну 09:00–18:00 местного времени;
 * - сортирует: сначала регионы, где день скоро закончится (мало минут до 18:00),
 *   потом — свежие лиды (created_at desc).
 * Лиды без известного региона попадают в конец списка.
 */
export function buildShiftQueue(leads: SalesLead[], now: Date = new Date()): ShiftQueueItem[] {
  const items: ShiftQueueItem[] = [];

  for (const lead of leads) {
    if (DEAD_STATUSES.has(lead.status)) continue;

    const tz = getRegionTimezone(lead.region);
    const lt = getRegionLocalTime(lead.region, now);

    if (!tz || !lt) {
      // регион неизвестен — всё равно оставляем, но в самый конец
      items.push({
        lead,
        localTime: null,
        mskLabel: null,
        minutesUntilClose: Number.POSITIVE_INFINITY,
        hasTimezone: false,
      });
      continue;
    }

    const [h, m] = lt.time.split(':').map(Number);
    if (h < WORK_START || h >= WORK_END) continue; // вне рабочего окна

    const minutesUntilClose = (WORK_END - h) * 60 - m;
    items.push({
      lead,
      localTime: lt.time,
      mskLabel: lt.mskOffsetLabel,
      minutesUntilClose,
      hasTimezone: true,
    });
  }

  items.sort((a, b) => {
    if (a.hasTimezone !== b.hasTimezone) return a.hasTimezone ? -1 : 1;
    if (a.minutesUntilClose !== b.minutesUntilClose) return a.minutesUntilClose - b.minutesUntilClose;
    return (b.lead.created_at || '').localeCompare(a.lead.created_at || '');
  });

  return items;
}

/**
 * Читает дневную норму дозвонов из app_settings.sales_daily_plan.
 * Формат: { "default": 80, "byManager": { "<manager_id>": 80 } }
 */
export interface DailyPlanConfig {
  default: number;
  byManager: Record<string, number>;
}

export function parseDailyPlan(raw: unknown): DailyPlanConfig {
  const fallback: DailyPlanConfig = { default: 80, byManager: {} };
  if (!raw) return fallback;
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (obj && typeof obj === 'object') {
      return {
        default: Number((obj as any).default) || fallback.default,
        byManager: ((obj as any).byManager && typeof (obj as any).byManager === 'object')
          ? (obj as any).byManager
          : {},
      };
    }
  } catch { /* noop */ }
  return fallback;
}

export function planForManager(cfg: DailyPlanConfig, managerId: string | null): number {
  if (managerId && cfg.byManager[managerId] != null) return Number(cfg.byManager[managerId]) || cfg.default;
  return cfg.default;
}
