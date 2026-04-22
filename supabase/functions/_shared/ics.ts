// Генерация iCal (.ics) приглашения на встречу
// RFC 5545 — минимальный набор полей для VEVENT

interface IcsEventInput {
  uid: string;
  title: string;
  description?: string;
  url?: string;
  startISO: string;
  durationMinutes: number;
  organizerEmail?: string;
  organizerName?: string;
  attendeeEmail?: string;
}

function pad2(n: number): string { return n < 10 ? "0" + n : "" + n; }

function toIcsDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.getUTCFullYear().toString() +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    "T" +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds()) +
    "Z"
  );
}

function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export function buildIcs(ev: IcsEventInput): string {
  const start = new Date(ev.startISO);
  const end = new Date(start.getTime() + ev.durationMinutes * 60_000);
  const dtStamp = toIcsDate(new Date().toISOString());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sintagma//Email Campaign//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${ev.uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${toIcsDate(start.toISOString())}`,
    `DTEND:${toIcsDate(end.toISOString())}`,
    `SUMMARY:${escapeIcsText(ev.title)}`,
  ];
  if (ev.description) lines.push(`DESCRIPTION:${escapeIcsText(ev.description)}`);
  if (ev.url) lines.push(`URL:${ev.url}`);
  if (ev.organizerEmail) {
    const cn = ev.organizerName ? `;CN=${escapeIcsText(ev.organizerName)}` : "";
    lines.push(`ORGANIZER${cn}:mailto:${ev.organizerEmail}`);
  }
  if (ev.attendeeEmail) {
    lines.push(`ATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:${ev.attendeeEmail}`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}
