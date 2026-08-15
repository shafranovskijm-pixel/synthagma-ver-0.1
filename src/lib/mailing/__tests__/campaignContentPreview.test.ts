import { describe, expect, it } from "vitest";
import {
  campaignAttachmentSummary,
  extractCampaignTemplateVariables,
  sanitizeCampaignHtmlForReport,
} from "@/lib/mailing/campaignContentPreview";

describe("campaign content report preview", () => {
  it("extracts unique personalization variables from subject variants and body", () => {
    expect(
      extractCampaignTemplateVariables(
        "{{first_name}}, тема для {{ organization_short }}",
        "Альтернативная тема для {{first_name}}",
        "<p>{{greeting}}</p><a href=\"{{unsubscribe_url}}\">Стоп</a>",
      ),
    ).toEqual(["first_name", "greeting", "organization_short", "unsubscribe_url"]);
  });

  it("keeps readable markup but cannot load tracking assets or open links", () => {
    const preview = sanitizeCampaignHtmlForReport(
      '<p style="background:url(https://tracker.test/pixel)">Текст <strong>письма</strong></p>' +
        '<a href="https://example.test/proposal" target="_blank">КП</a>' +
        '<img src="https://tracker.test/open" onerror="alert(1)">' +
        '<style>@import url("https://tracker.test/styles.css");</style>' +
        '<link rel="stylesheet" href="https://tracker.test/theme.css">' +
        '<iframe src="https://tracker.test/frame"></iframe><script>alert(1)</script>',
    );

    expect(preview).toContain("Текст <strong>письма</strong>");
    expect(preview).toContain("<a>КП</a>");
    expect(preview).not.toContain("tracker.test");
    expect(preview).not.toContain("style=");
    expect(preview).not.toContain("@import");
    expect(preview).not.toContain("<link");
    expect(preview).not.toContain("<img");
    expect(preview).not.toContain("<iframe");
    expect(preview).not.toContain("<script");
  });

  it("describes the only attachment type supported by the campaign sender", () => {
    expect(campaignAttachmentSummary(null)).toBe("Без вложений");
    expect(campaignAttachmentSummary({ meeting: { attach_ics: false } })).toBe("Без вложений");
    expect(campaignAttachmentSummary({ meeting: { attach_ics: true } })).toBe(
      "Календарное приглашение invite.ics",
    );
  });
});
