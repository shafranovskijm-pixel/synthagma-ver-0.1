/**
 * Карта субъектов РФ → IANA timezone.
 * Используется в кабинете менеджера, чтобы показывать местное время региона
 * (удобно ли звонить лиду прямо сейчас).
 */

const TZ_MAP: Record<string, string> = {
  // UTC+2 (МСК-1)
  "Калининградская область": "Europe/Kaliningrad",

  // UTC+3 (МСК)
  "Москва": "Europe/Moscow",
  "Санкт-Петербург": "Europe/Moscow",
  "Московская область": "Europe/Moscow",
  "Ленинградская область": "Europe/Moscow",
  "Адыгея": "Europe/Moscow",
  "Республика Адыгея": "Europe/Moscow",
  "Архангельская область": "Europe/Moscow",
  "Белгородская область": "Europe/Moscow",
  "Брянская область": "Europe/Moscow",
  "Владимирская область": "Europe/Moscow",
  "Волгоградская область": "Europe/Moscow",
  "Вологодская область": "Europe/Moscow",
  "Воронежская область": "Europe/Moscow",
  "Ивановская область": "Europe/Moscow",
  "Кабардино-Балкарская Республика": "Europe/Moscow",
  "Кабардино-Балкария": "Europe/Moscow",
  "Калмыкия": "Europe/Moscow",
  "Республика Калмыкия": "Europe/Moscow",
  "Калужская область": "Europe/Moscow",
  "Карачаево-Черкесская Республика": "Europe/Moscow",
  "Карелия": "Europe/Moscow",
  "Республика Карелия": "Europe/Moscow",
  "Костромская область": "Europe/Moscow",
  "Краснодарский край": "Europe/Moscow",
  "Курская область": "Europe/Moscow",
  "Липецкая область": "Europe/Moscow",
  "Марий Эл": "Europe/Moscow",
  "Республика Марий Эл": "Europe/Moscow",
  "Мордовия": "Europe/Moscow",
  "Республика Мордовия": "Europe/Moscow",
  "Мурманская область": "Europe/Moscow",
  "Ненецкий автономный округ": "Europe/Moscow",
  "Нижегородская область": "Europe/Moscow",
  "Новгородская область": "Europe/Moscow",
  "Орловская область": "Europe/Moscow",
  "Пензенская область": "Europe/Moscow",
  "Псковская область": "Europe/Moscow",
  "Ростовская область": "Europe/Moscow",
  "Рязанская область": "Europe/Moscow",
  "Северная Осетия": "Europe/Moscow",
  "Республика Северная Осетия": "Europe/Moscow",
  "Северная Осетия — Алания": "Europe/Moscow",
  "Смоленская область": "Europe/Moscow",
  "Ставропольский край": "Europe/Moscow",
  "Тамбовская область": "Europe/Moscow",
  "Тверская область": "Europe/Moscow",
  "Тульская область": "Europe/Moscow",
  "Чечня": "Europe/Moscow",
  "Чеченская Республика": "Europe/Moscow",
  "Ингушетия": "Europe/Moscow",
  "Республика Ингушетия": "Europe/Moscow",
  "Дагестан": "Europe/Moscow",
  "Республика Дагестан": "Europe/Moscow",
  "Чувашия": "Europe/Moscow",
  "Чувашская Республика": "Europe/Moscow",
  "Ярославская область": "Europe/Moscow",
  "Крым": "Europe/Simferopol",
  "Республика Крым": "Europe/Simferopol",
  "Севастополь": "Europe/Simferopol",

  // UTC+4 (МСК+1)
  "Самарская область": "Europe/Samara",
  "Удмуртия": "Europe/Samara",
  "Удмуртская Республика": "Europe/Samara",
  "Астраханская область": "Europe/Astrakhan",
  "Саратовская область": "Europe/Saratov",
  "Ульяновская область": "Europe/Ulyanovsk",

  // UTC+5 (МСК+2)
  "Башкортостан": "Asia/Yekaterinburg",
  "Республика Башкортостан": "Asia/Yekaterinburg",
  "Свердловская область": "Asia/Yekaterinburg",
  "Челябинская область": "Asia/Yekaterinburg",
  "Курганская область": "Asia/Yekaterinburg",
  "Оренбургская область": "Asia/Yekaterinburg",
  "Пермский край": "Asia/Yekaterinburg",
  "Тюменская область": "Asia/Yekaterinburg",
  "Ханты-Мансийский автономный округ": "Asia/Yekaterinburg",
  "ХМАО": "Asia/Yekaterinburg",
  "Ямало-Ненецкий автономный округ": "Asia/Yekaterinburg",
  "ЯНАО": "Asia/Yekaterinburg",

  // UTC+6 (МСК+3)
  "Омская область": "Asia/Omsk",

  // UTC+7 (МСК+4)
  "Алтайский край": "Asia/Barnaul",
  "Республика Алтай": "Asia/Barnaul",
  "Алтай": "Asia/Barnaul",
  "Новосибирская область": "Asia/Novosibirsk",
  "Кемеровская область": "Asia/Novokuznetsk",
  "Кемеровская область — Кузбасс": "Asia/Novokuznetsk",
  "Томская область": "Asia/Tomsk",
  "Красноярский край": "Asia/Krasnoyarsk",
  "Тыва": "Asia/Krasnoyarsk",
  "Республика Тыва": "Asia/Krasnoyarsk",
  "Хакасия": "Asia/Krasnoyarsk",
  "Республика Хакасия": "Asia/Krasnoyarsk",

  // UTC+8 (МСК+5)
  "Иркутская область": "Asia/Irkutsk",
  "Бурятия": "Asia/Irkutsk",
  "Республика Бурятия": "Asia/Irkutsk",

  // UTC+9 (МСК+6)
  "Якутия": "Asia/Yakutsk",
  "Республика Саха (Якутия)": "Asia/Yakutsk",
  "Саха": "Asia/Yakutsk",
  "Амурская область": "Asia/Yakutsk",
  "Забайкальский край": "Asia/Chita",

  // UTC+10 (МСК+7)
  "Приморский край": "Asia/Vladivostok",
  "Хабаровский край": "Asia/Vladivostok",
  "Еврейская автономная область": "Asia/Vladivostok",

  // UTC+11 (МСК+8)
  "Магаданская область": "Asia/Magadan",
  "Сахалинская область": "Asia/Sakhalin",

  // UTC+12 (МСК+9)
  "Камчатский край": "Asia/Kamchatka",
  "Чукотский автономный округ": "Asia/Anadyr",
  "Чукотка": "Asia/Anadyr",
};

const MSK_TZ = "Europe/Moscow";

export function getRegionTimezone(region: string | null | undefined): string | null {
  if (!region) return null;
  const key = region.trim();
  if (TZ_MAP[key]) return TZ_MAP[key];
  // partial match
  for (const k of Object.keys(TZ_MAP)) {
    if (key.includes(k) || k.includes(key)) return TZ_MAP[k];
  }
  return null;
}

function getOffsetHours(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
  });
  const parts = dtf.formatToParts(date);
  const off = parts.find(p => p.type === "timeZoneName")?.value || "GMT+0";
  const m = off.match(/GMT([+-]?\d+)(?::(\d+))?/);
  if (!m) return 0;
  return parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) / 60 : 0);
}

export interface RegionLocalTime {
  /** "HH:mm" в локальном времени региона */
  time: string;
  /** "МСК+3" или "МСК-1" */
  mskOffsetLabel: string;
  /** часы относительно МСК (целое число) */
  mskOffsetHours: number;
  /** часы относительно UTC */
  utcOffsetHours: number;
}

export function getRegionLocalTime(region: string | null | undefined, now: Date = new Date()): RegionLocalTime | null {
  const tz = getRegionTimezone(region);
  if (!tz) return null;
  const time = new Intl.DateTimeFormat("ru-RU", {
    timeZone: tz, hour: "2-digit", minute: "2-digit",
  }).format(now);
  const utcOff = getOffsetHours(tz, now);
  const mskOff = getOffsetHours(MSK_TZ, now);
  const diff = Math.round(utcOff - mskOff);
  const label = diff === 0 ? "МСК" : diff > 0 ? `МСК+${diff}` : `МСК${diff}`;
  return { time, mskOffsetLabel: label, mskOffsetHours: diff, utcOffsetHours: utcOff };
}

/** "комфортно ли звонить" — будни 9:00..19:00 по местному времени */
export function isBusinessHours(region: string | null | undefined, now: Date = new Date()): boolean {
  const lt = getRegionLocalTime(region, now);
  if (!lt) return true;
  const [h] = lt.time.split(":").map(Number);
  return h >= 9 && h < 19;
}
