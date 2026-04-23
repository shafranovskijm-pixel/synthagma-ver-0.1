// Справочник лицензирующих органов для Checko Search API.
// `code` — значение, передаваемое в параметр `licens` Checko (можно несколько через запятую).

export interface CheckoLicenseType {
  code: string;
  name: string;
  description: string;
  category: 'education' | 'safety' | 'medical' | 'transport' | 'industrial' | 'security' | 'other';
}

export const CHECKO_LICENSE_TYPES: CheckoLicenseType[] = [
  // Образование (ключевое для нашей платформы)
  {
    code: 'rosobr',
    name: 'Рособрнадзор',
    description: 'Лицензии на образовательную деятельность (ДПО, профобучение, СПО, ВО)',
    category: 'education',
  },
  // Пожарная безопасность
  {
    code: 'mchs',
    name: 'МЧС России',
    description: 'Пожарная безопасность, монтаж средств защиты, обучение мерам ПБ',
    category: 'safety',
  },
  // Медицина
  {
    code: 'roszdrav',
    name: 'Росздравнадзор',
    description: 'Медицинская и фармацевтическая деятельность',
    category: 'medical',
  },
  // Транспорт
  {
    code: 'rostrans',
    name: 'Ространснадзор',
    description: 'Перевозки пассажиров, опасных грузов, транспортная безопасность',
    category: 'transport',
  },
  // Промышленная безопасность
  {
    code: 'rostech',
    name: 'Ростехнадзор',
    description: 'Опасные производственные объекты, эксплуатация ОПО, экспертиза ПБ',
    category: 'industrial',
  },
  // Связь и ИТ
  {
    code: 'roskomnadzor',
    name: 'Роскомнадзор',
    description: 'Услуги связи, оператор персональных данных',
    category: 'other',
  },
  // Защита информации
  {
    code: 'fstek',
    name: 'ФСТЭК России',
    description: 'Техническая защита конфиденциальной информации',
    category: 'security',
  },
  {
    code: 'fsb',
    name: 'ФСБ России',
    description: 'Шифровальные средства, государственная тайна',
    category: 'security',
  },
  // Охрана и оружие
  {
    code: 'mvd',
    name: 'МВД России',
    description: 'Частная охранная и детективная деятельность, оружие',
    category: 'security',
  },
  // Культура
  {
    code: 'minkult',
    name: 'Минкультуры России',
    description: 'Сохранение объектов культурного наследия, реставрация',
    category: 'other',
  },
  // Финансы
  {
    code: 'cbrf',
    name: 'Банк России',
    description: 'Банковская, страховая, профдеятельность на рынке ценных бумаг',
    category: 'other',
  },
  // Алкоголь
  {
    code: 'rosalko',
    name: 'Росалкогольрегулирование',
    description: 'Производство и оборот алкогольной продукции',
    category: 'other',
  },
  // Недра
  {
    code: 'rosnedra',
    name: 'Роснедра',
    description: 'Пользование недрами, геологоразведка',
    category: 'industrial',
  },
  // Экология
  {
    code: 'rosprirod',
    name: 'Росприроднадзор',
    description: 'Обращение с отходами I-IV класса опасности',
    category: 'industrial',
  },
];

export const LICENSE_TYPE_BY_CODE = new Map(CHECKO_LICENSE_TYPES.map(l => [l.code, l]));

export function licenseName(code: string): string {
  return LICENSE_TYPE_BY_CODE.get(code)?.name ?? code;
}

export const LICENSE_CATEGORIES: { key: CheckoLicenseType['category']; label: string }[] = [
  { key: 'education', label: 'Образование' },
  { key: 'safety', label: 'Безопасность' },
  { key: 'medical', label: 'Медицина' },
  { key: 'transport', label: 'Транспорт' },
  { key: 'industrial', label: 'Промышленность' },
  { key: 'security', label: 'Защита информации и охрана' },
  { key: 'other', label: 'Прочие' },
];
