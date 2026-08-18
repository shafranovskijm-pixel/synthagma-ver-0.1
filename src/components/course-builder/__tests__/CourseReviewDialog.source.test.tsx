import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewSourceAnchor } from "../CourseReviewDialog";

const OFFICIAL_URL = "https://publication.pravo.gov.ru/document/0001202506020074";

describe("ReviewSourceAnchor", () => {
  it("renders the allowlisted official HTTPS deep link safely", () => {
    render(
      <ReviewSourceAnchor
        sourceUrl={OFFICIAL_URL}
        sourceLabel="Официальное опубликование: приказ Минэнерго России от 14.05.2025 № 511"
      />,
    );

    const link = screen.getByRole("link", {
      name: "Официальное опубликование: приказ Минэнерго России от 14.05.2025 № 511",
    });
    expect(link).toHaveAttribute("href", OFFICIAL_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it.each([
    "http://publication.pravo.gov.ru/document/0001202506020074",
    "https://publication.pravo.gov.ru.evil.example/document/0001202506020074",
    "https://evil.example/?next=https://publication.pravo.gov.ru",
    "javascript:alert(1)",
  ])("does not render a link for a non-allowlisted URL: %s", (sourceUrl) => {
    render(<ReviewSourceAnchor sourceUrl={sourceUrl} sourceLabel="Источник" />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
