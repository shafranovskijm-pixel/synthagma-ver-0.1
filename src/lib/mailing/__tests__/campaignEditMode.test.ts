import { describe, it, expect } from "vitest";
import {
  buildDraftMutation,
  buildEditorInitial,
  hasUnsavedChanges,
  initialSnapshot,
  isCampaignEditable,
} from "@/lib/mailing/campaignEditMode";
import { validateSeedTest } from "@/lib/mailing/senderPresets";

const row = {
  id: "camp-1",
  name: "Промо",
  subject: "Тема",
  html_body: "<p>Привет</p>",
  recipient_source: "manual",
  sender_id: "sender-1",
  from_name: "Sintagma",
  reply_to: "reply@x.ru",
  status: "draft",
};

describe("campaign edit mode", () => {
  it("draft and failed campaigns are editable, sending/completed are not", () => {
    expect(isCampaignEditable("draft")).toBe(true);
    expect(isCampaignEditable("failed")).toBe(true);
    expect(isCampaignEditable("sending")).toBe(false);
    expect(isCampaignEditable("completed")).toBe(false);
  });

  it("hydrates editor initial with id, content and sender", () => {
    const initial = buildEditorInitial(row);
    expect(initial).toMatchObject({
      id: "camp-1",
      name: "Промо",
      subject: "Тема",
      html: "<p>Привет</p>",
      recipientSource: "manual",
      senderId: "sender-1",
      fromName: "Sintagma",
      replyTo: "reply@x.ru",
      status: "draft",
    });
    expect(buildEditorInitial({ ...row, status: "failed" }).status).toBe("failed");
  });

  it("updates existing campaign instead of inserting, and leaves recipients untouched", () => {
    const m = buildDraftMutation({
      campaignId: "camp-1",
      recipientsTouched: false,
      payload: { scope: "org", organization_id: "org-1", created_by: "u", subject: "Тема 2", status: "draft" },
      recipientFields: { recipient_source: "all_students", manual_emails: null },
    });
    expect(m.op).toBe("update");
    expect(m.id).toBe("camp-1");
    expect(m.payload).not.toHaveProperty("recipient_source");
    expect(m.payload).not.toHaveProperty("manual_emails");
    expect(m.payload).not.toHaveProperty("scope");
    expect(m.payload.status).toBe("draft");
  });

  it("applies recipient fields on update only after an explicit change", () => {
    const m = buildDraftMutation({
      campaignId: "camp-1",
      recipientsTouched: true,
      payload: { status: "draft" },
      recipientFields: { recipient_source: "manual", manual_emails: ["a@b.ru"] },
    });
    expect(m.op).toBe("update");
    expect(m.payload.recipient_source).toBe("manual");
  });

  it("new campaign inserts with explicit empty recipients as draft", () => {
    const m = buildDraftMutation({
      campaignId: null,
      recipientsTouched: false,
      payload: { scope: "org", organization_id: "org-1", status: "draft" },
      recipientFields: { recipient_source: "none", manual_emails: null },
    });
    expect(m.op).toBe("insert");
    expect(m.id).toBeNull();
    expect(m.payload).toMatchObject({ scope: "org", recipient_source: "none", manual_emails: null, status: "draft" });
  });

  it("detects unsaved changes against the saved snapshot", () => {
    const initial = buildEditorInitial(row);
    const snap = initialSnapshot(initial);
    const same = {
      name: "Промо",
      subject: "Тема",
      html: "<p>Привет</p>",
      fromName: "Sintagma",
      replyTo: "reply@x.ru",
      senderId: "sender-1",
    };
    expect(hasUnsavedChanges(snap, same)).toBe(false);
    expect(hasUnsavedChanges(snap, { ...same, subject: "Другая" })).toBe(true);
  });
});

describe("seed test gate in edit mode", () => {
  const base = { senderAccountId: "sender-1", smtpStatus: "ok", seedRaw: "seed@example.com" };

  it("uses the campaign id from a reopened campaign", () => {
    const r = validateSeedTest({ ...base, campaignId: "camp-1" });
    expect(r.ok).toBe(true);
    expect(r.emails).toEqual(["seed@example.com"]);
  });

  it("blocks seed send while the form has unsaved changes", () => {
    const r = validateSeedTest({ ...base, campaignId: "camp-1", hasUnsavedChanges: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("Сохраните изменения");
  });

  it("still blocks unsaved new campaigns", () => {
    expect(validateSeedTest({ ...base, campaignId: null }).ok).toBe(false);
  });

  it("keeps the 1–5 manual seed address limit", () => {
    const many = "a@b.ru, c@d.ru, e@f.ru, g@h.ru, i@j.ru, k@l.ru";
    expect(validateSeedTest({ ...base, seedRaw: many, campaignId: "camp-1" }).ok).toBe(false);
  });
});
