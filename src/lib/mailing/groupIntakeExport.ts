export interface GroupIntakeCandidate {
  remote_name: string | null;
  remote_email: string;
  interest_hours: number | null;
  campaign_id: string;
  review_status: string;
}

const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

/**
 * Builds a working-group register that becomes directly compatible with the
 * existing student CSV importer after the operator fills the first four
 * columns. The outreach contact is deliberately kept separate from the
 * participant email: an organization mailbox must never be silently reused as
 * a student's account.
 */
export function buildGroupIntakeCsv(
  candidates: GroupIntakeCandidate[],
  campaignNames: Record<string, string>,
) {
  const rows = [
    [
      "ФИО",
      "Email",
      "Группа",
      "Курс 1",
      "Организация",
      "Ответственный",
      "Контактный Email",
      "Программа, часов",
      "Количество участников",
      "Период",
      "Форма обучения",
      "Кампания",
      "Статус данных",
    ],
    ...candidates.map((candidate) => [
      "",
      "",
      "",
      "",
      "",
      candidate.remote_name || "",
      candidate.remote_email,
      candidate.interest_hours || "",
      "",
      "17–21.08.2026",
      "ВКС",
      campaignNames[candidate.campaign_id] || candidate.campaign_id,
      "Требуются ФИО и личный email каждого участника",
    ]),
  ];

  return "\ufeff" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
}
