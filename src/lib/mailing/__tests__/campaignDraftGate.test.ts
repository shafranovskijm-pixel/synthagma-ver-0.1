import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  defaultRecipientValue,
  validateDraft,
  validateSend,
  DEFAULT_RECIPIENT_SOURCE,
} from "@/lib/mailing/campaignDraftGate";

const editorSrc = readFileSync(
  resolve(__dirname, "../../../components/admin/broadcast/CampaignEditor.tsx"),
  "utf8",
);
const pickerSrc = readFileSync(
  resolve(__dirname, "../../../components/admin/broadcast/RecipientPicker.tsx"),
  "utf8",
);

const content = { name: "Промо", subject: "Тема", html: "<p>Привет</p>" };

describe("P0 — новая кампания без получателей", () => {
  it("дефолтный источник — none, 0 получателей", () => {
    const v = defaultRecipientValue();
    expect(DEFAULT_RECIPIENT_SOURCE).toBe("none");
    expect(v.source).toBe("none");
    expect(v.count).toBe(0);
    expect(v.manualEmails).toEqual([]);
  });

  it("редактор не выбирает students/organizations по умолчанию", () => {
    expect(editorSrc).not.toMatch(/scope === "platform" \? "organizations" : "students"/);
    expect(editorSrc).toContain("defaultRecipientValue()");
  });

  it("picker показывает явный вариант «Без получателей / добавить позже» и не запрашивает превью для none", () => {
    expect(pickerSrc).toContain("Без получателей / добавить позже");
    expect(pickerSrc).toMatch(/value\.source === "none"/);
  });

  it("существующая кампания сохраняет свой явный источник", () => {
    expect(editorSrc).toContain("initial?.recipientSource");
  });
});

describe("P0 — сохранение черновика", () => {
  it("черновик сохраняется без согласия, SMTP, получателей и расписания", () => {
    expect(validateDraft(content).ok).toBe(true);
  });

  it("черновик требует только название/тему/тело", () => {
    expect(validateDraft({ ...content, name: " " }).ok).toBe(false);
    expect(validateDraft({ ...content, subject: "" }).ok).toBe(false);
    expect(validateDraft({ ...content, html: "" }).ok).toBe(false);
  });

  it("черновик не создаёт получателей — вставка только в email_campaigns", () => {
    const inserts = editorSrc.match(/\.from\("([a-z_]+)"\)\.insert/g) || [];
    expect(inserts).toEqual(['.from("email_campaigns").insert']);
    expect(editorSrc).not.toContain('from("email_campaign_recipients").insert');
  });
});

describe("P0 — отправка остаётся заблокированной", () => {
  const base = {
    ...content,
    consent: true,
    recipientCount: 10,
    previewReady: true,
    variablesOk: true,
    senderAccountId: "sender-1",
  };


  it("ок при полной готовности", () => {
    expect(validateSend(base).ok).toBe(true);
  });

  it("блок без получателей", () => {
    expect(validateSend({ ...base, recipientCount: 0 }).ok).toBe(false);
  });

  it("блок без согласия", () => {
    const r = validateSend({ ...base, consent: false });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("согласие");
  });

  it("блок при неизвестных переменных, превышении лимита и квоте (SMTP/прогрев)", () => {
    expect(validateSend({ ...base, variablesOk: false }).ok).toBe(false);
    expect(validateSend({ ...base, overDailyLimit: true }).ok).toBe(false);
    expect(validateSend({ ...base, quotaBlocked: true, quotaReason: "SMTP не настроен" }).reason).toBe(
      "SMTP не настроен",
    );
    expect(validateSend({ ...base, previewReady: false }).ok).toBe(false);
  });

  it("планирование проходит через send-гейт, а не через draft-гейт", () => {
    expect(editorSrc).toContain("const isSendAction = launch || scheduleEnabled");
  });
});
