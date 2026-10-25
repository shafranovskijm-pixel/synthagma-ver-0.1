// Source-checked official donor manifests; this is not FIS acceptance or legal policy approval.
import {deepFreeze} from './hash.ts';
export const OFFICIAL_TEMPLATES = deepFreeze({
  "dpo": {
    "id": "dpo20230116",
    "stream": "dpo",
    "column_count": 40,
    "donor_sha256": "882c9f65af250372e177288d16c85c960814e2276c933e3908d6e3bfd510c1b1",
    "donor_bytes": 156369,
    "dictionary_sha256": "3d6be1c5ce05b93626e448ba4ab6094d4d603a9a28f8139919ae38daf598436e",
    "mapping_revision": "uc020-v2",
    "maximum_data_rows": 1000,
    "sheet_path": "xl/worksheets/sheet1.xml",
    "sheet_name": "Шаблон",
    "date_columns": [
      8,
      25,
      36
    ],
    "native_dimension": "A1:AN1001",
    "parts": [
      {
        "path": "[Content_Types].xml",
        "bytes": 1557,
        "sha256": "a0c2a2d4310ffafdb5524472cb6fc644eb4556e0ca05759e88e292a3e214f7e0"
      },
      {
        "path": "_rels/.rels",
        "bytes": 735,
        "sha256": "ad78dfe44ec71f967f96e95bdf6baf2545c39e1a5e4413e7b8e9413eb95fd922"
      },
      {
        "path": "xl/_rels/workbook.xml.rels",
        "bytes": 839,
        "sha256": "15e353ac27ab7362603f4a0d0754a97885e8e2ce523615a3cd59b458ddcd60e9"
      },
      {
        "path": "xl/workbook.xml",
        "bytes": 2571,
        "sha256": "e49a4a844fa17e52dd631a3cfdb12e72138d7fa36736ef64b05d7e98b9fadacb"
      },
      {
        "path": "xl/styles.xml",
        "bytes": 13076,
        "sha256": "d4905029f6f6f7ed598cee29577bd9f9b1349400355ddd2dc2a4aee67547a08b"
      },
      {
        "path": "xl/worksheets/_rels/sheet2.xml.rels",
        "bytes": 293,
        "sha256": "ac2075ad5ad18eaee04da95ec4b12db9c771cc7cef61bcf1376be2026715d327"
      },
      {
        "path": "xl/worksheets/sheet2.xml",
        "bytes": 108240,
        "sha256": "fb6879b187d767b1cc6e22abfeb63ad57b7a13c00a0a1fb4112fd5a387ea758a"
      },
      {
        "path": "xl/theme/theme1.xml",
        "bytes": 6849,
        "sha256": "a10db1e59511e0533b346219f9ddf937bae92b8222b40048b9f5f22de2d31c97"
      },
      {
        "path": "xl/worksheets/sheet1.xml",
        "bytes": 885595,
        "sha256": "fcfd19a5b41eb367cde79750f8725cc9967ed77244349a2323ed432d669796fb"
      },
      {
        "path": "xl/sharedStrings.xml",
        "bytes": 52203,
        "sha256": "88860a710239aa17de8e6fe8806ff7e99e30c7d6a40347ae9fd42093ad927dfa"
      },
      {
        "path": "docProps/custom.xml",
        "bytes": 956,
        "sha256": "2b34605839289be471b97064f22fc3baeb0c1fb6baf64a09899f5662c2076da7"
      },
      {
        "path": "docProps/core.xml",
        "bytes": 767,
        "sha256": "e6a62893edf24a54f70079605256aae23166e3849a923c30488f88e92ffe7de4"
      },
      {
        "path": "xl/tables/table1.xml",
        "bytes": 974,
        "sha256": "905eb073123736c4de2a5b74c5c47da9fbb79c20aec86e4cf47e8467ce6cff3d"
      },
      {
        "path": "docProps/app.xml",
        "bytes": 1626,
        "sha256": "03bfaadb25ab9333d64e3b3852f8d45b3ec9da8b6ad463553f3075678002df07"
      }
    ],
    "columns": [
      {
        "index": 1,
        "letter": "A",
        "header": "Вид документа",
        "rule": "document_type"
      },
      {
        "index": 2,
        "letter": "B",
        "header": "Статус документа",
        "rule": "document_status"
      },
      {
        "index": 3,
        "letter": "C",
        "header": "Подтверждение утраты",
        "rule": "loss"
      },
      {
        "index": 4,
        "letter": "D",
        "header": "Подтверждение обмена",
        "rule": "exchange"
      },
      {
        "index": 5,
        "letter": "E",
        "header": "Подтверждение уничтожения",
        "rule": "destruction"
      },
      {
        "index": 6,
        "letter": "F",
        "header": "Серия документа",
        "rule": "series"
      },
      {
        "index": 7,
        "letter": "G",
        "header": "Номер документа",
        "rule": "number"
      },
      {
        "index": 8,
        "letter": "H",
        "header": "Дата выдачи документа",
        "rule": "issue_date"
      },
      {
        "index": 9,
        "letter": "I",
        "header": "Регистрационный номер",
        "rule": "reg_number"
      },
      {
        "index": 10,
        "letter": "J",
        "header": "Дополнительная профессиональная программа (повышение квалификации/ профессиональная переподготовка)",
        "rule": "program_type_dpo"
      },
      {
        "index": 11,
        "letter": "K",
        "header": "Наименование дополнительной профессиональной программы",
        "rule": "title_dpo"
      },
      {
        "index": 12,
        "letter": "L",
        "header": "Наименование области профессиональной деятельности",
        "rule": "professional_area"
      },
      {
        "index": 13,
        "letter": "M",
        "header": "Укрупненные группы специальностей",
        "rule": "specialty_group"
      },
      {
        "index": 14,
        "letter": "N",
        "header": "Наименование квалификации, профессии, специальности",
        "rule": "qualification"
      },
      {
        "index": 15,
        "letter": "O",
        "header": "Уровень образования ВО/СПО",
        "rule": "prior_education"
      },
      {
        "index": 16,
        "letter": "P",
        "header": "Фамилия указанная в дипломе о ВО или СПО",
        "rule": "prior_last_name"
      },
      {
        "index": 17,
        "letter": "Q",
        "header": "Серия документа о ВО/СПО",
        "rule": "prior_series"
      },
      {
        "index": 18,
        "letter": "R",
        "header": "Номер документа о ВО/СПО",
        "rule": "prior_number"
      },
      {
        "index": 19,
        "letter": "S",
        "header": "Год начала обучения (для документа о квалификации)",
        "rule": "start_year"
      },
      {
        "index": 20,
        "letter": "T",
        "header": "Год окончания обучения (для документа о квалификации)",
        "rule": "end_year"
      },
      {
        "index": 21,
        "letter": "U",
        "header": "Срок обучения, часов (для документа о квалификации)",
        "rule": "hours_dpo"
      },
      {
        "index": 22,
        "letter": "V",
        "header": "Фамилия получателя",
        "rule": "last_name"
      },
      {
        "index": 23,
        "letter": "W",
        "header": "Имя получателя",
        "rule": "first_name"
      },
      {
        "index": 24,
        "letter": "X",
        "header": "Отчество получателя",
        "rule": "middle_name"
      },
      {
        "index": 25,
        "letter": "Y",
        "header": "Дата рождения получателя",
        "rule": "birth_date"
      },
      {
        "index": 26,
        "letter": "Z",
        "header": "Пол получателя",
        "rule": "gender"
      },
      {
        "index": 27,
        "letter": "AA",
        "header": "СНИЛС",
        "rule": "snils"
      },
      {
        "index": 28,
        "letter": "AB",
        "header": "Форма обучения",
        "rule": "training_form"
      },
      {
        "index": 29,
        "letter": "AC",
        "header": "Источник финансирования обучения",
        "rule": "financing"
      },
      {
        "index": 30,
        "letter": "AD",
        "header": "Форма получения образования на момент прекращения образовательных отношений",
        "rule": "education_form"
      },
      {
        "index": 31,
        "letter": "AE",
        "header": "Гражданство получателя (код страны по ОКСМ)",
        "rule": "citizenship"
      },
      {
        "index": 32,
        "letter": "AF",
        "header": "Наименование документа об образовании (оригинала)",
        "rule": "original_type"
      },
      {
        "index": 33,
        "letter": "AG",
        "header": "Серия (оригинала)",
        "rule": "original_series"
      },
      {
        "index": 34,
        "letter": "AH",
        "header": "Номер (оригинала)",
        "rule": "original_number_dpo"
      },
      {
        "index": 35,
        "letter": "AI",
        "header": "Регистрационный N (оригинала)",
        "rule": "original_reg_dpo"
      },
      {
        "index": 36,
        "letter": "AJ",
        "header": "Дата выдачи (оригинала)",
        "rule": "original_issue"
      },
      {
        "index": 37,
        "letter": "AK",
        "header": "Фамилия получателя (оригинала)",
        "rule": "original_last"
      },
      {
        "index": 38,
        "letter": "AL",
        "header": "Имя получателя (оригинала)",
        "rule": "original_first"
      },
      {
        "index": 39,
        "letter": "AM",
        "header": "Отчество получателя (оригинала)",
        "rule": "original_middle"
      },
      {
        "index": 40,
        "letter": "AN",
        "header": "Номер документа для изменения",
        "rule": "change_number"
      }
    ]
  },
  "po": {
    "id": "po16102026",
    "stream": "po",
    "column_count": 35,
    "donor_sha256": "4d528f83573d0ada6ff421cdb0b9d77eb42134d33eb3ef08c60ec95c66a08439",
    "donor_bytes": 269211,
    "dictionary_sha256": "dee5aa87cbd1922b6a993e15bc5d135477514297cc6eb776e05d13612b2c7f42",
    "mapping_revision": "uc020-v2",
    "maximum_data_rows": 1000,
    "sheet_path": "xl/worksheets/sheet1.xml",
    "sheet_name": "Шаблон",
    "date_columns": [
      8,
      20,
      31
    ],
    "native_dimension": "A1:AI1002",
    "parts": [
      {
        "path": "[Content_Types].xml",
        "bytes": 1548,
        "sha256": "32e73660bf97d57b9d1809468b91b57cede663b1a2955e08611cba21a0a069ae"
      },
      {
        "path": "_rels/.rels",
        "bytes": 588,
        "sha256": "73e5a29f48d5ab979eeda062493bc7e679265c1344ef936978b8becec5549497"
      },
      {
        "path": "xl/workbook.xml",
        "bytes": 2906,
        "sha256": "fb91190486a09b3e65b535f738414f70230b38ae15cc1559dc11dccbdb5fe85b"
      },
      {
        "path": "xl/_rels/workbook.xml.rels",
        "bytes": 839,
        "sha256": "15e353ac27ab7362603f4a0d0754a97885e8e2ce523615a3cd59b458ddcd60e9"
      },
      {
        "path": "xl/worksheets/sheet1.xml",
        "bytes": 778612,
        "sha256": "ed58ba67b8340c3f85f9824dd73d47999af214475770a1e6a2efe1e1bb7bfa29"
      },
      {
        "path": "xl/worksheets/sheet2.xml",
        "bytes": 564882,
        "sha256": "a6584a5313a29727180838448c1f067b86f169e16492cea6b010ea45c11b8648"
      },
      {
        "path": "xl/theme/theme1.xml",
        "bytes": 6847,
        "sha256": "868bbfaabb40a5ba3c37c759423c9cb78442b0c304f01c6527ee4f257f1b1c2c"
      },
      {
        "path": "xl/styles.xml",
        "bytes": 14544,
        "sha256": "07d1f05011dfb22effaa6cb97c98f3805ed0176d7cc77bc4fe5a92aa37d22d40"
      },
      {
        "path": "xl/sharedStrings.xml",
        "bytes": 439698,
        "sha256": "6bc4cabb0ce247856d01d71482ab4c469d96087c9da6ba187e6c8bd465d4d8f7"
      },
      {
        "path": "xl/worksheets/_rels/sheet2.xml.rels",
        "bytes": 458,
        "sha256": "7278090537b94e2da15ea13592e03a77fc42074b866dc43282215321ccdb0054"
      },
      {
        "path": "xl/printerSettings/printerSettings1.bin",
        "bytes": 29480,
        "sha256": "f0f7d531b9b80c96150e5fedbf1f5e3f6c3e79815d3d1b6cb4a449eda6b58771"
      },
      {
        "path": "xl/tables/table1.xml",
        "bytes": 1613,
        "sha256": "236947a1b1d708245bf1796eee22af43c1e44b9aa51a482f69a636dbca9128b2"
      },
      {
        "path": "docProps/core.xml",
        "bytes": 622,
        "sha256": "af7fec7ed192a075a6f12205be938d063bfa9689a7b72b22c6b49b7e61588903"
      },
      {
        "path": "docProps/app.xml",
        "bytes": 1392,
        "sha256": "f025a0a390b3d5339d3d335c9eacbba0e04d2f31c0a078930002625ce72468b2"
      }
    ],
    "columns": [
      {
        "index": 1,
        "letter": "A",
        "header": "Вид документа",
        "rule": "document_type"
      },
      {
        "index": 2,
        "letter": "B",
        "header": "Статус документа",
        "rule": "document_status"
      },
      {
        "index": 3,
        "letter": "C",
        "header": "Подтверждение утраты",
        "rule": "loss"
      },
      {
        "index": 4,
        "letter": "D",
        "header": "Подтверждение обмена",
        "rule": "exchange"
      },
      {
        "index": 5,
        "letter": "E",
        "header": "Подтверждение уничтожения",
        "rule": "destruction"
      },
      {
        "index": 6,
        "letter": "F",
        "header": "Серия документа",
        "rule": "series"
      },
      {
        "index": 7,
        "letter": "G",
        "header": "Номер документа",
        "rule": "number"
      },
      {
        "index": 8,
        "letter": "H",
        "header": "Дата выдачи документа",
        "rule": "issue_date"
      },
      {
        "index": 9,
        "letter": "I",
        "header": "Регистрационный номер",
        "rule": "reg_number"
      },
      {
        "index": 10,
        "letter": "J",
        "header": "Программа профессионального обучения, направление подготовки",
        "rule": "program_type_po"
      },
      {
        "index": 11,
        "letter": "K",
        "header": "Наименование программы профессионального обучения",
        "rule": "title_po"
      },
      {
        "index": 12,
        "letter": "L",
        "header": "Наименование профессий рабочих, должностей служащих",
        "rule": "profession"
      },
      {
        "index": 13,
        "letter": "M",
        "header": "Присвоенный квалификационный разряд, класс, категория (при наличии)",
        "rule": "rank"
      },
      {
        "index": 14,
        "letter": "N",
        "header": "Год начала обучения",
        "rule": "start_year"
      },
      {
        "index": 15,
        "letter": "O",
        "header": "Год окончания обучения",
        "rule": "end_year"
      },
      {
        "index": 16,
        "letter": "P",
        "header": "Срок обучения, часов",
        "rule": "hours_po"
      },
      {
        "index": 17,
        "letter": "Q",
        "header": "Фамилия получателя",
        "rule": "last_name"
      },
      {
        "index": 18,
        "letter": "R",
        "header": "Имя получателя",
        "rule": "first_name"
      },
      {
        "index": 19,
        "letter": "S",
        "header": "Отчество получателя",
        "rule": "middle_name"
      },
      {
        "index": 20,
        "letter": "T",
        "header": "Дата рождения получателя",
        "rule": "birth_date"
      },
      {
        "index": 21,
        "letter": "U",
        "header": "Пол получателя",
        "rule": "gender"
      },
      {
        "index": 22,
        "letter": "V",
        "header": "СНИЛС",
        "rule": "snils"
      },
      {
        "index": 23,
        "letter": "W",
        "header": "Гражданство получателя (код страны по ОКСМ)",
        "rule": "citizenship"
      },
      {
        "index": 24,
        "letter": "X",
        "header": "Форма обучения",
        "rule": "training_form"
      },
      {
        "index": 25,
        "letter": "Y",
        "header": "Источник финансирования обучения",
        "rule": "financing"
      },
      {
        "index": 26,
        "letter": "Z",
        "header": "Форма получения образования на момент прекращения образовательных отношений",
        "rule": "education_form"
      },
      {
        "index": 27,
        "letter": "AA",
        "header": "Наименование документа об образовании (оригинала)",
        "rule": "original_type"
      },
      {
        "index": 28,
        "letter": "AB",
        "header": "Серия (оригинала)",
        "rule": "original_series"
      },
      {
        "index": 29,
        "letter": "AC",
        "header": "Номер (оригинала)",
        "rule": "original_number_po"
      },
      {
        "index": 30,
        "letter": "AD",
        "header": "Регистрационный N (оригинала)",
        "rule": "original_reg_po"
      },
      {
        "index": 31,
        "letter": "AE",
        "header": "Дата выдачи (оригинала)",
        "rule": "original_issue"
      },
      {
        "index": 32,
        "letter": "AF",
        "header": "Фамилия получателя (оригинала)",
        "rule": "original_last"
      },
      {
        "index": 33,
        "letter": "AG",
        "header": "Имя получателя (оригинала)",
        "rule": "original_first"
      },
      {
        "index": 34,
        "letter": "AH",
        "header": "Отчество получателя (оригинала)",
        "rule": "original_middle"
      },
      {
        "index": 35,
        "letter": "AI",
        "header": "Номер документа для изменения",
        "rule": "change_number"
      }
    ]
  }
} as const);
