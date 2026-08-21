import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { Footer } from "@/components/landing/Footer";
import { AdminDashboardFooter } from "@/components/admin/AdminDashboardFooter";
import { OrgDashboardFooter } from "@/components/organization/OrgDashboardFooter";
import { StudentFooter } from "@/components/student/StudentFooter";
import { SalesDashboardFooter } from "@/components/admin/sales/SalesDashboardFooter";

vi.mock("@/components/landing/StarfieldCanvas", () => ({
  StarfieldCanvas: () => null,
}));

vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({
    organizationName: "Учебная организация",
    branding: { brandingSettings: { logoUrl: "" } },
  }),
}));

afterEach(() => cleanup());

function expectHelpLink() {
  expect(screen.getByRole("link", { name: "Помощь и обучение" })).toHaveAttribute("href", "/help");
}

describe("help links in user-facing footers", () => {
  it("is visible in the public landing footer", () => {
    render(<MemoryRouter><Footer /></MemoryRouter>);
    expectHelpLink();
  });

  it("is visible in the administrator footer", () => {
    render(<AdminDashboardFooter />);
    expectHelpLink();
  });

  it("is visible in the organization footer", () => {
    render(<OrgDashboardFooter />);
    expectHelpLink();
  });

  it("is visible in the student footer", () => {
    render(<StudentFooter orgName="Учебная организация" />);
    expectHelpLink();
  });

  it("is visible in the sales footer", () => {
    render(<SalesDashboardFooter />);
    expect(screen.getByRole("link", { name: "Помощь" })).toHaveAttribute("href", "/help");
  });

  it("opens the mounted help dialog from the administrator header", () => {
    const adminHeader = readFileSync(
      resolve(process.cwd(), "src/components/admin/AdminDashboardHeader.tsx"),
      "utf8",
    );

    expect(adminHeader).toContain("helpDialog.setOpen(true)");
    expect(adminHeader).not.toContain("open-support-chat");
  });
});
