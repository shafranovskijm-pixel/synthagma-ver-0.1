import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { vi, expect, it } from "vitest";
import { Footer } from "../Footer";
import About from "@/pages/About";
import { PLATFORM_CONTACTS as contacts } from "../../../../supabase/functions/_shared/platform-support-contacts";
vi.mock("@/components/landing/StarfieldCanvas", () => ({ StarfieldCanvas: () => null }));
vi.mock("@/components/landing/LandingHeader", () => ({ LandingHeader: () => null }));
vi.mock("@/components/ui/TypewriterText", () => ({ TypewriterText: () => null }));
vi.mock("/images/about/mission.png", () => ({ default: "synthetic-mission.png" }));
vi.mock("/images/about/innovation.png", () => ({ default: "synthetic-innovation.png" }));
vi.mock("/images/about/compliance.png", () => ({ default: "synthetic-compliance.png" }));
vi.mock("/images/about/requisites-bg.jpg", () => ({ default: "synthetic-requisites.jpg" }));

it("keeps the exact published footer displays and tel/mailto targets from canonical data", () => {
  render(<MemoryRouter><Footer /></MemoryRouter>);
  expect(screen.getByText("8 (914) 721-34-24").closest("a")).toHaveAttribute("href", contacts.primaryPhone.href);
  expect(screen.getByText("8 (924) 721-34-24").closest("a")).toHaveAttribute("href", contacts.secondaryPhone.href);
  expect(screen.getByText(contacts.supportEmail).closest("a")).toHaveAttribute("href", "mailto:" + contacts.supportEmail);
  expect(screen.getByText("Контакты").closest("a")).toHaveAttribute("href", "mailto:" + contacts.ownerEmail);
});
it("keeps the about-page international phone display and public owner email", () => {
  render(<HelmetProvider><MemoryRouter><About /></MemoryRouter></HelmetProvider>);
  expect(screen.getByText("+7 (914) 721-34-24").closest("a")).toHaveAttribute("href", contacts.primaryPhone.href);
  expect(screen.getByText(contacts.ownerEmail).closest("a")).toHaveAttribute("href", "mailto:" + contacts.ownerEmail);
});
