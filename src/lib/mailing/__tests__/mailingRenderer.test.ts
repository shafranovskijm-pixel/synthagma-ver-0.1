import { describe, it, expect } from "vitest";
import {
  buildListUnsubscribeHeaders,
  buildSeedUnsubscribeMailto,
  buildSeedVariableValues,
  hasUnresolvedTokens,
  renderMailingTemplate,
  ALL_MAILING_VARIABLE_KEYS as EDGE_KEYS,
  URL_MAILING_VARIABLE_KEYS as EDGE_URL_KEYS,
} from "../../../../supabase/functions/_shared/mailing-variables";
import {
  ALL_MAILING_VARIABLE_KEYS,
  URL_MAILING_VARIABLE_KEYS,
} from "../variableRegistry";
import { MAILING_VARIABLES as CORE_LIST } from "../variables";
import { MAILING_VARIABLES as UI_LIST, LEGACY_VARIABLES } from "@/utils/mailing/mailingVariables";

describe("единый allowlist переменных", () => {
  it("edge и frontend списки идентичны", () => {
    expect([...EDGE_KEYS]).toEqual([...ALL_MAILING_VARIABLE_KEYS]);
    expect([...EDGE_URL_KEYS]).toEqual([...URL_MAILING_VARIABLE_KEYS]);
  });

  it("UI-список и core-список согласованы с реестром", () => {
    expect(UI_LIST.map((v) => v.key)).toEqual([...CORE_LIST]);
    for (const key of [...CORE_LIST, ...LEGACY_VARIABLES]) {
      expect(ALL_MAILING_VARIABLE_KEYS).toContain(key);
    }
  });
});

describe("renderMailingTemplate", () => {
  it("экранирует HTML, но не URL-переменные", () => {
    const out = renderMailingTemplate(
      '<p>{{first_name}}</p><a href="{{unsubscribe_url}}">x</a>',
      { first_name: "<b>Иван</b>", unsubscribe_url: "https://e.x/u?a=1&b=2" },
    );
    expect(out).toContain("&lt;b&gt;Иван&lt;/b&gt;");
    expect(out).toContain('href="https://e.x/u?a=1&b=2"');
  });

  it("keep оставляет неизвестный токен, strip убирает", () => {
    expect(renderMailingTemplate("{{nope}}", {})).toBe("{{nope}}");
    expect(renderMailingTemplate("{{nope}}", {}, { unresolved: "strip" })).toBe("");
  });
});

describe("seed fallbacks", () => {
  const ctx = {
    seedEmail: "seed@example.com",
    organizationName: "ЧОУ ДПО «Тест»",
    fromName: "СИНТАГМА",
    fromEmail: "ngal@torgi.com.ru",
  };

  it("подставляет все поддерживаемые переменные", () => {
    const values = buildSeedVariableValues(ctx);
    for (const key of ALL_MAILING_VARIABLE_KEYS) expect(values[key]).toBeDefined();
    expect(values.first_name).toBe("Коллега");
    expect(values.name).toBe("Коллега");
    expect(values.last_name).toBe("");
    expect(values.city).toBe("");
    expect(values.organization).toBe("ЧОУ ДПО «Тест»");
    expect(values.org_name).toBe("ЧОУ ДПО «Тест»");
    expect(values.email).toBe("seed@example.com");
    expect(values.unsubscribe_url).toBe("mailto:ngal@torgi.com.ru?subject=unsubscribe");
  });

  it("в письме не остаётся токенов {{...}}", () => {
    const values = buildSeedVariableValues(ctx);
    const subject = renderMailingTemplate("{{first_name}}, контрактная система {{unknown_x}}", values, {
      escapeHtml: false,
      unresolved: "strip",
    });
    const html = renderMailingTemplate(
      '<p>{{first_name}}</p><a href="{{unsubscribe_url}}">off</a><span>{{weird}}</span>',
      values,
      { unresolved: "strip" },
    );
    expect(hasUnresolvedTokens(subject)).toBe(false);
    expect(hasUnresolvedTokens(html)).toBe(false);
    expect(subject).toContain("Коллега");
    expect(html).toContain("mailto:ngal@torgi.com.ru?subject=unsubscribe");
  });

  it("организация падает на from_name, если имени нет", () => {
    const values = buildSeedVariableValues({ ...ctx, organizationName: "" });
    expect(values.organization).toBe("СИНТАГМА");
  });

  it("mailto не строится из некорректного адреса", () => {
    expect(buildSeedUnsubscribeMailto("not-an-email")).toBe("");
  });
});

describe("List-Unsubscribe", () => {
  it("http URL + mailto, one-click только для http", () => {
    const h = buildListUnsubscribeHeaders({
      unsubscribeUrl: "https://x.y/email-unsubscribe?t=abc",
      fromEmail: "a@b.co",
      oneClick: true,
    });
    expect(h["List-Unsubscribe"]).toBe("<https://x.y/email-unsubscribe?t=abc>, <mailto:a@b.co?subject=unsubscribe>");
    expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("seed mailto без one-click и без дублирования", () => {
    const h = buildListUnsubscribeHeaders({
      unsubscribeUrl: "mailto:a@b.co?subject=unsubscribe",
      fromEmail: "a@b.co",
      oneClick: true,
    });
    expect(h["List-Unsubscribe"]).toBe("<mailto:a@b.co?subject=unsubscribe>");
    expect(h["List-Unsubscribe-Post"]).toBeUndefined();
  });

  it("отбрасывает небезопасные значения и не отдаёт пустой заголовок", () => {
    expect(buildListUnsubscribeHeaders({ unsubscribeUrl: "javascript:alert(1)", fromEmail: "" })).toEqual({});
    const h = buildListUnsubscribeHeaders({ unsubscribeUrl: "https://x.y/u\r\nX-Evil: 1", fromEmail: "a@b.co" });
    expect(h["List-Unsubscribe"]).toBe("<mailto:a@b.co?subject=unsubscribe>");
  });
});
