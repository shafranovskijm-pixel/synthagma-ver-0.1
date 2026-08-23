import { describe, expect, it } from "vitest";
import {
  demoRequestErrorMessage,
  isDemoRequestAccepted,
  isReasonableDemoPhone,
} from "@/lib/demoRequest";

describe("demo request frontend response contract", () => {
  it("accepts only an explicit ok=true response", () => {
    expect(isDemoRequestAccepted({ ok: true, lead_id: "lead-1" })).toBe(true);
    expect(isDemoRequestAccepted({
      ok: true,
      lead_id: "lead-2",
      delivery: { lead: "stored", telegram: "failed", email: "failed" },
    })).toBe(true);
    expect(isDemoRequestAccepted({ ok: false })).toBe(false);
    expect(isDemoRequestAccepted({ ok: true, lead_id: null })).toBe(false);
    expect(isDemoRequestAccepted({ ok: true, lead_id: "lead-3", delivery: { lead: "failed" } })).toBe(false);
    expect(isDemoRequestAccepted({ lead_id: "lead-without-ok" })).toBe(false);
    expect(isDemoRequestAccepted(null)).toBe(false);
  });

  it("does not expose backend details in the user-facing error", () => {
    expect(demoRequestErrorMessage({ error: "name_and_phone_required" }))
      .toBe("Укажите имя и телефон");
    expect(demoRequestErrorMessage({ error: "database password=secret" }))
      .toBe("Не удалось отправить заявку. Попробуйте ещё раз.");
  });

  it("does not accept the untouched phone placeholder", () => {
    expect(isReasonableDemoPhone("+7 ")).toBe(false);
    expect(isReasonableDemoPhone("+7 (999) 123-45-67")).toBe(true);
  });
});
