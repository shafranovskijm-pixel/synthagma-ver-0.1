/**
 * P0: режим редактирования существующей кампании.
 *
 * Чистая логика, чтобы гарантировать:
 *  - существующая кампания обновляется (UPDATE), а не дублируется (INSERT);
 *  - получатели не создаются и не меняются без явного действия пользователя;
 *  - seed-отправка возможна только по сохранённой и несгрязнённой форме.
 */

export interface CampaignEditInitial {
  id?: string;
  name?: string;
  subject?: string;
  html?: string;
  recipientSource?: string;
  senderId?: string | null;
  fromName?: string | null;
  replyTo?: string | null;
  status?: string;
}

/** Кампании, которые безопасно открывать в редакторе. */
export const EDITABLE_CAMPAIGN_STATUSES = ["draft", "failed"] as const;

export function isCampaignEditable(status: string): boolean {
  return (EDITABLE_CAMPAIGN_STATUSES as readonly string[]).includes(status);
}

export interface CampaignRowLike {
  id: string;
  name: string;
  subject: string;
  html_body: string;
  recipient_source: string;
  sender_id?: string | null;
  from_name: string | null;
  reply_to: string | null;
  status: string;
}

/** Что именно передаётся в CampaignEditor при открытии существующей кампании. */
export function buildEditorInitial(row: CampaignRowLike): CampaignEditInitial {
  return {
    id: row.id,
    name: row.name || "",
    subject: row.subject || "",
    html: row.html_body || "",
    recipientSource: row.recipient_source,
    senderId: row.sender_id ?? null,
    fromName: row.from_name ?? "",
    replyTo: row.reply_to ?? "",
    status: row.status,
  };
}

export interface CampaignFormSnapshot {
  name: string;
  subject: string;
  html: string;
  fromName: string;
  replyTo: string;
  senderId: string;
}

export function snapshotOf(v: CampaignFormSnapshot): string {
  return JSON.stringify({
    name: v.name.trim(),
    subject: v.subject.trim(),
    html: v.html,
    fromName: (v.fromName || "").trim(),
    replyTo: (v.replyTo || "").trim(),
    senderId: v.senderId || "",
  });
}

export function initialSnapshot(initial: CampaignEditInitial | undefined): string {
  return snapshotOf({
    name: initial?.name || "",
    subject: initial?.subject || "",
    html: initial?.html || "",
    fromName: initial?.fromName || "",
    replyTo: initial?.replyTo || "",
    senderId: initial?.senderId || "",
  });
}

export function hasUnsavedChanges(savedSnapshot: string, current: CampaignFormSnapshot): boolean {
  return savedSnapshot !== snapshotOf(current);
}

export interface DraftMutationInput {
  campaignId: string | null;
  /** Пользователь явно менял выбор получателей в этой сессии редактора. */
  recipientsTouched: boolean;
  payload: Record<string, unknown>;
  /** Поля получателей, которые применяются только при явном действии. */
  recipientFields: Record<string, unknown>;
}

export interface DraftMutation {
  op: "insert" | "update";
  id: string | null;
  payload: Record<string, unknown>;
}

/**
 * Для новой кампании — INSERT со всеми полями (включая явно пустых получателей).
 * Для существующей — UPDATE только этой строки; поля получателей входят
 * в апдейт исключительно если пользователь их менял.
 */
export function buildDraftMutation(input: DraftMutationInput): DraftMutation {
  if (!input.campaignId) {
    return {
      op: "insert",
      id: null,
      payload: { ...input.payload, ...input.recipientFields },
    };
  }
  const payload = { ...input.payload };
  delete payload.scope;
  delete payload.organization_id;
  delete payload.created_by;
  return {
    op: "update",
    id: input.campaignId,
    payload: input.recipientsTouched ? { ...payload, ...input.recipientFields } : payload,
  };
}
