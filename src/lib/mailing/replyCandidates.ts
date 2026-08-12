export type ReplyCandidateClassification =
  | "interested"
  | "not_interested"
  | "unsubscribe"
  | "auto_reply"
  | "needs_review";

export type ReplyCandidateReviewStatus =
  | "new"
  | "qualified"
  | "contacted"
  | "enrolled"
  | "closed";

export interface ReplyCandidateRow {
  id: string;
  remote_email: string;
  received_at: string;
  updated_at?: string | null;
  classification: ReplyCandidateClassification;
  review_status: ReplyCandidateReviewStatus;
}

const contactKey = (row: ReplyCandidateRow) => {
  const email = String(row.remote_email || "").trim().toLocaleLowerCase("ru-RU");
  return email || `reply:${row.id}`;
};

const rowTimestamp = (row: ReplyCandidateRow) => Math.max(
  Date.parse(row.received_at) || 0,
  Date.parse(row.updated_at || "") || 0,
);

const newestFirst = <T extends ReplyCandidateRow>(left: T, right: T) =>
  rowTimestamp(right) - rowTimestamp(left) || right.id.localeCompare(left.id);

/**
 * Produces one active candidate per normalized email address.
 *
 * A refusal or unsubscribe is fail-closed: the contact is not exported even
 * when an older reply showed interest. This keeps a historical positive reply
 * from leaking a later stop request into the working group.
 */
export function buildUniqueReplyCandidates<T extends ReplyCandidateRow>(rows: T[]): T[] {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = contactKey(row);
    grouped.set(key, [...(grouped.get(key) || []), row]);
  }

  const candidates: T[] = [];
  for (const contactRows of grouped.values()) {
    if (contactRows.some((row) => row.classification === "unsubscribe" || row.classification === "not_interested")) {
      continue;
    }

    const interested = contactRows
      .filter((row) => row.classification === "interested")
      .sort(newestFirst);
    const latest = interested[0];
    if (latest && latest.review_status !== "closed") candidates.push(latest);
  }

  return candidates.sort(newestFirst);
}

export function summarizeReplyContacts<T extends ReplyCandidateRow>(rows: T[]) {
  const candidates = buildUniqueReplyCandidates(rows);
  const latestByContact = new Map<string, T>();
  const stoppedContacts = new Set<string>();

  for (const row of [...rows].sort(newestFirst)) {
    const key = contactKey(row);
    if (!latestByContact.has(key)) latestByContact.set(key, row);
    if (row.classification === "unsubscribe" || row.classification === "not_interested") {
      stoppedContacts.add(key);
    }
  }

  return {
    candidates,
    interested: candidates.length,
    enrolled: candidates.filter((row) => row.review_status === "enrolled").length,
    needsReview: [...latestByContact.values()].filter((row) =>
      !stoppedContacts.has(contactKey(row))
      && row.classification === "needs_review"
      && row.review_status === "new").length,
    stopped: stoppedContacts.size,
  };
}
