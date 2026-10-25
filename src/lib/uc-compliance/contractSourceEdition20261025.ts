/**
 * Supplemental research edition for the contract helper, checked 25 October 2026.
 * This adds evidence alongside the historical catalogue; it does not replace
 * CATALOG_VERSION, source snapshots, centre decisions or legal approvals.
 * Add a new dated edition for later research instead of rewriting this one.
 */
export const CONTRACT_SOURCE_EDITION_20261025 = {
  id: "uc029-contract-sources-2026-10-25-v1",
  state: "source_checked",
  legalApproval: "not_recorded",
  historicalCatalogVersion: "uc-requirements-2026-10-18-v1",
  sources: [
    {
      id: "contract-education-mchs-20261025",
      historicalSourceId: "LEGAL-01",
      title: "273-ФЗ «Об образовании в Российской Федерации»",
      primaryUrl: "https://mchs.gov.ru/dokumenty/bazovye-normativnye-pravovye-akty/federalnye-zakony/7992",
      checkedOn: "2026-10-25",
      checkedOnLabel: "25.10.2026",
      summary: "Сверены статьи 53 и 54 по копии МЧС России: редакция от 04.08.2026 с изменениями, вступающими в силу с 01.09.2026. В них указаны форма и стороны договора, программа, срок, стоимость и порядок оплаты.",
      limitation: "Сверка этих положений не подтверждает применимость каждого требования к вашему центру и не утверждает проект договора.",
      references: [
        {
          label: "Копия текста на сайте МЧС",
          url: "https://mchs.gov.ru/uploads/document/2026-09-24/b5bb7424f411b38df7dfe047a2415cbb.docx",
          kind: "official_agency_fulltext_copy",
          capturedOn: "2026-10-25",
          bytes: 569251,
          sha256: "86278c1884d094137193300a20a4085271b003694b2f0d3d03abcff5fd762d22",
          declaredEdition: "2026-08-04",
          declaredChangesEffectiveFrom: "2026-09-01",
          provisions: ["ст. 53", "ст. 54"],
        },
      ],
    },
    {
      id: "contract-paid-rules-agencies-20261025",
      historicalSourceId: "LEGAL-16",
      title: "Правила платных образовательных услуг № 1441",
      primaryUrl: "https://31.rospotrebnadzor.ru/kontrol-i-nadzor/nadzor-v-oblasti-zashchity-prav-potrebiteley/16677/",
      checkedOn: "2026-10-25",
      checkedOnLabel: "25.10.2026",
      summary: "По копии, размещённой Роспотребнадзором 21.04.2023, сверены пункты 12–16. В этой копии ещё указан прежний срок действия — до 31.12.2026. Официальное сообщение Роспотребнадзора от 25.08.2026 подтверждает продление до 01.09.2032 постановлением № 1053; изменение вступило в силу 29.08.2026.",
      limitation: "Полный первичный текст постановления № 1053 в этой проверке не получен. Сообщение о продлении не является полной новой редакцией Правил; актуальность и применимость условий договора требуют отдельной проверки.",
      references: [
        {
          label: "Копия Правил на сайте Роспотребнадзора",
          url: "https://31.rospotrebnadzor.ru/upload/iblock_content/49ecc323df0be0d1b632da1682db589a.docx",
          kind: "official_agency_fulltext_copy",
          capturedOn: "2026-10-25",
          bytes: 17860,
          sha256: "f6a0e2775cc3d4c949a35bf4a8eb2e09ed47a314890fe189b4d9e97dc2d9961c",
          agencyPublicationDate: "2023-04-21",
          printedExpiry: "2026-12-31",
          provisions: ["п. 12", "п. 13", "п. 14", "п. 15", "п. 16"],
        },
        {
          label: "Официальное сообщение о продлении до 2032 года",
          url: "https://86.rospotrebnadzor.ru/news/prodlyon-srok-dejstviya-pravil-platnyix-obrazovatelnyix-uslug.html",
          kind: "official_regulator_announcement",
          capturedOn: "2026-10-24",
          bytes: 31993,
          sha256: "cd8a136e553c21323d7e4877ecd05d09ea2230403f829817519c238bbb02d451",
          announcementDate: "2026-08-25",
          announcedExpiry: "2032-09-01",
          announcedEffectiveFrom: "2026-08-29",
          fullAmendingTextVerified: false,
        },
      ],
    },
    {
      id: "contract-consumer-belgorod-20261025",
      historicalSourceId: null,
      title: "Закон РФ от 07.02.1992 № 2300-1 «О защите прав потребителей»",
      primaryUrl: "https://31.rospotrebnadzor.ru/search/content/20382/",
      checkedOn: "2026-10-25",
      checkedOnLabel: "25.10.2026",
      summary: "Сверены преамбула, статьи 16 и 32 по размещённой Роспотребнадзором копии с изменениями, вступившими в силу с 01.10.2026. Дополнительные платные услуги требуют согласия; автоматические отметки о согласии не допускаются. При отказе от услуг учитываются фактически понесённые связанные расходы.",
      limitation: "Применимость к потребительским отношениям проверяется по их составу и цели, а не только по тому, кто оплачивает обучение.",
      references: [
        {
          label: "Копия закона на сайте Роспотребнадзора",
          url: "https://31.rospotrebnadzor.ru/upload/New%20Folder/%D0%97%D0%B0%D0%BA%D0%BE%D0%BD%20%D0%A0%D0%A4%20%D0%BE%D1%82%2007.02.1992%20N%202300-1%20(%D1%80%D0%B5%D0%B4.%20%D0%BE%D1%82%2028.12.2025,%20%D1%81%20%D0%B8%D0%B7%D0%BC.%20(2).docx",
          kind: "official_agency_fulltext_copy",
          capturedOn: "2026-10-25",
          bytes: 105218,
          sha256: "f028070b0c21b71ddf76d41913225b975574ba2e5bd8d756d16a67726c07b5c9",
          declaredEdition: "2025-12-28",
          declaredConstitutionalCourtChange: "2026-02-17",
          declaredChangesEffectiveFrom: "2026-10-01",
          provisions: ["преамбула", "ст. 16", "ст. 32"],
        },
      ],
    },
  ],
} as const;

/** Preparation checklist from the saved agency copy, paragraph 13 а–п. */
export const CONTRACT_REVIEW_FIELDS_20261025 = [
  "Полное наименование Исполнителя и фирменное наименование (при наличии), либо ФИО исполнителя — ИП",
  "Место нахождения или место жительства Исполнителя",
  "Наименование / ФИО Заказчика и (или) законного представителя обучающегося, телефон (при наличии)",
  "Место нахождения или место жительства Заказчика и (или) законного представителя обучающегося",
  "ФИО представителей сторон и реквизиты документов, подтверждающих их полномочия",
  "ФИО, место жительства и телефон обучающегося, если он не Заказчик (при наличии)",
  "Права, обязанности и ответственность Исполнителя, Заказчика и обучающегося",
  "Полная стоимость образовательных услуг и порядок оплаты",
  "Сведения о лицензии (орган, номер, дата), если законом не предусмотрено иное",
  "Вид, уровень и (или) направленность программы или её части",
  "Форма обучения",
  "Сроки освоения программы или её части (продолжительность обучения)",
  "Вид выдаваемого после успешного освоения программы документа (при наличии)",
  "Порядок изменения и расторжения договора",
  "Другие необходимые сведения с учётом конкретных платных образовательных услуг",
] as const;
