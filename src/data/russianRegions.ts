// Справочник кодов регионов РФ для Checko Search API
// Code = код субъекта РФ (используется в Checko как параметр `region`)

export interface RussianRegion {
  code: number;
  name: string;
  district: string;
}

export const RUSSIAN_REGIONS: RussianRegion[] = [
  // Центральный ФО
  { code: 31, name: 'Белгородская область', district: 'ЦФО' },
  { code: 32, name: 'Брянская область', district: 'ЦФО' },
  { code: 33, name: 'Владимирская область', district: 'ЦФО' },
  { code: 36, name: 'Воронежская область', district: 'ЦФО' },
  { code: 37, name: 'Ивановская область', district: 'ЦФО' },
  { code: 40, name: 'Калужская область', district: 'ЦФО' },
  { code: 44, name: 'Костромская область', district: 'ЦФО' },
  { code: 46, name: 'Курская область', district: 'ЦФО' },
  { code: 48, name: 'Липецкая область', district: 'ЦФО' },
  { code: 50, name: 'Московская область', district: 'ЦФО' },
  { code: 57, name: 'Орловская область', district: 'ЦФО' },
  { code: 62, name: 'Рязанская область', district: 'ЦФО' },
  { code: 67, name: 'Смоленская область', district: 'ЦФО' },
  { code: 68, name: 'Тамбовская область', district: 'ЦФО' },
  { code: 69, name: 'Тверская область', district: 'ЦФО' },
  { code: 71, name: 'Тульская область', district: 'ЦФО' },
  { code: 76, name: 'Ярославская область', district: 'ЦФО' },
  { code: 77, name: 'Москва', district: 'ЦФО' },

  // Северо-Западный ФО
  { code: 10, name: 'Республика Карелия', district: 'СЗФО' },
  { code: 11, name: 'Республика Коми', district: 'СЗФО' },
  { code: 29, name: 'Архангельская область', district: 'СЗФО' },
  { code: 35, name: 'Вологодская область', district: 'СЗФО' },
  { code: 39, name: 'Калининградская область', district: 'СЗФО' },
  { code: 47, name: 'Ленинградская область', district: 'СЗФО' },
  { code: 51, name: 'Мурманская область', district: 'СЗФО' },
  { code: 53, name: 'Новгородская область', district: 'СЗФО' },
  { code: 60, name: 'Псковская область', district: 'СЗФО' },
  { code: 78, name: 'Санкт-Петербург', district: 'СЗФО' },
  { code: 83, name: 'Ненецкий АО', district: 'СЗФО' },

  // Южный ФО
  { code: 1, name: 'Республика Адыгея', district: 'ЮФО' },
  { code: 8, name: 'Республика Калмыкия', district: 'ЮФО' },
  { code: 23, name: 'Краснодарский край', district: 'ЮФО' },
  { code: 30, name: 'Астраханская область', district: 'ЮФО' },
  { code: 34, name: 'Волгоградская область', district: 'ЮФО' },
  { code: 61, name: 'Ростовская область', district: 'ЮФО' },
  { code: 91, name: 'Республика Крым', district: 'ЮФО' },
  { code: 92, name: 'Севастополь', district: 'ЮФО' },

  // Северо-Кавказский ФО
  { code: 5, name: 'Республика Дагестан', district: 'СКФО' },
  { code: 6, name: 'Республика Ингушетия', district: 'СКФО' },
  { code: 7, name: 'Кабардино-Балкарская Республика', district: 'СКФО' },
  { code: 9, name: 'Карачаево-Черкесская Республика', district: 'СКФО' },
  { code: 15, name: 'Республика Северная Осетия — Алания', district: 'СКФО' },
  { code: 20, name: 'Чеченская Республика', district: 'СКФО' },
  { code: 26, name: 'Ставропольский край', district: 'СКФО' },

  // Приволжский ФО
  { code: 2, name: 'Республика Башкортостан', district: 'ПФО' },
  { code: 12, name: 'Республика Марий Эл', district: 'ПФО' },
  { code: 13, name: 'Республика Мордовия', district: 'ПФО' },
  { code: 16, name: 'Республика Татарстан', district: 'ПФО' },
  { code: 18, name: 'Удмуртская Республика', district: 'ПФО' },
  { code: 21, name: 'Чувашская Республика', district: 'ПФО' },
  { code: 43, name: 'Кировская область', district: 'ПФО' },
  { code: 52, name: 'Нижегородская область', district: 'ПФО' },
  { code: 56, name: 'Оренбургская область', district: 'ПФО' },
  { code: 58, name: 'Пензенская область', district: 'ПФО' },
  { code: 59, name: 'Пермский край', district: 'ПФО' },
  { code: 63, name: 'Самарская область', district: 'ПФО' },
  { code: 64, name: 'Саратовская область', district: 'ПФО' },
  { code: 73, name: 'Ульяновская область', district: 'ПФО' },

  // Уральский ФО
  { code: 45, name: 'Курганская область', district: 'УФО' },
  { code: 66, name: 'Свердловская область', district: 'УФО' },
  { code: 72, name: 'Тюменская область', district: 'УФО' },
  { code: 74, name: 'Челябинская область', district: 'УФО' },
  { code: 86, name: 'Ханты-Мансийский АО — Югра', district: 'УФО' },
  { code: 89, name: 'Ямало-Ненецкий АО', district: 'УФО' },

  // Сибирский ФО
  { code: 3, name: 'Республика Бурятия', district: 'СФО' },
  { code: 4, name: 'Республика Алтай', district: 'СФО' },
  { code: 17, name: 'Республика Тыва', district: 'СФО' },
  { code: 19, name: 'Республика Хакасия', district: 'СФО' },
  { code: 22, name: 'Алтайский край', district: 'СФО' },
  { code: 24, name: 'Красноярский край', district: 'СФО' },
  { code: 38, name: 'Иркутская область', district: 'СФО' },
  { code: 42, name: 'Кемеровская область — Кузбасс', district: 'СФО' },
  { code: 54, name: 'Новосибирская область', district: 'СФО' },
  { code: 55, name: 'Омская область', district: 'СФО' },
  { code: 70, name: 'Томская область', district: 'СФО' },

  // Дальневосточный ФО
  { code: 14, name: 'Республика Саха (Якутия)', district: 'ДФО' },
  { code: 25, name: 'Приморский край', district: 'ДФО' },
  { code: 27, name: 'Хабаровский край', district: 'ДФО' },
  { code: 28, name: 'Амурская область', district: 'ДФО' },
  { code: 41, name: 'Камчатский край', district: 'ДФО' },
  { code: 49, name: 'Магаданская область', district: 'ДФО' },
  { code: 65, name: 'Сахалинская область', district: 'ДФО' },
  { code: 75, name: 'Забайкальский край', district: 'ДФО' },
  { code: 79, name: 'Еврейская АО', district: 'ДФО' },
  { code: 87, name: 'Чукотский АО', district: 'ДФО' },

  // Новые субъекты
  { code: 80, name: 'Донецкая Народная Республика', district: 'ЮФО' },
  { code: 81, name: 'Луганская Народная Республика', district: 'ЮФО' },
  { code: 84, name: 'Запорожская область', district: 'ЮФО' },
  { code: 85, name: 'Херсонская область', district: 'ЮФО' },
];

export const REGION_BY_CODE = new Map(RUSSIAN_REGIONS.map(r => [r.code, r]));

export function regionName(code: number): string {
  return REGION_BY_CODE.get(code)?.name ?? `Регион ${code}`;
}
