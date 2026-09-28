import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DefaultMetadata } from "@/components/DefaultMetadata";
import AutoSchools from "@/pages/AutoSchools";
import NotFound from "@/pages/NotFound";
import Index from "@/pages/Index";
import DemonstrationPage from "@/pages/DemonstrationPage";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, userRole: null, loading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock("@/components/landing/Hero", () => ({ Hero: () => null }));
vi.mock("@/components/landing/HowItWorks", () => ({ HowItWorks: () => null }));
vi.mock("@/components/landing/EditorDemoSection", () => ({ EditorDemoSection: () => null }));
vi.mock("@/components/landing/FrdoSection", () => ({ FrdoSection: () => null }));
vi.mock("@/components/landing/Features", () => ({ Features: () => null }));
vi.mock("@/components/landing/RostechnadzorCourses", () => ({ RostechnadzorCourses: () => null }));
vi.mock("@/components/landing/LandingHeader", () => ({ LandingHeader: () => null }));
vi.mock("@/components/landing/PricingPlans", () => ({ PricingPlans: () => null }));
vi.mock("@/components/landing/BoxedVersionCard", () => ({ BoxedVersionCard: () => null }));
vi.mock("@/components/landing/WebsiteDevelopmentCard", () => ({ WebsiteDevelopmentCard: () => null }));
vi.mock("@/components/landing/Testimonials", () => ({ Testimonials: () => null }));
vi.mock("@/components/landing/MobileApp", () => ({ MobileApp: () => null }));
vi.mock("@/components/landing/FinalCta", () => ({ FinalCta: () => null }));
vi.mock("@/components/landing/Footer", () => ({ Footer: () => null }));
vi.mock("@/components/ui/ScrollToTop", () => ({ ScrollToTop: () => null }));
vi.mock("@/components/proposal/ProposalDownloadButton", () => ({ ProposalDownloadButton: () => null }));

const entryHtml = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const defaultTitle = "СИНТАГМА — СДО и документооборот для организаций";
const autoTitle = "Программа для автошколы: ученики и расписание вождения — СИНТАГМА";
const origin = "https://xn--80aaiswd0ak.xn--p1ai";

function meta(key: string, property = false) {
  const elements = document.head.querySelectorAll(`meta[${property ? "property" : "name"}="${key}"]`);
  expect(elements).toHaveLength(1);
  return elements[0].getAttribute("content");
}

function canonical() {
  const elements = document.head.querySelectorAll('link[rel="canonical"]');
  expect(elements).toHaveLength(1);
  return elements[0].getAttribute("href");
}

function mountPage(path = "/auto-schools") {
  return render(<HelmetProvider><DefaultMetadata /><MemoryRouter initialEntries={[path]}>
    <nav><Link to="/">Home QA</Link><Link to="/auto-schools">Auto QA</Link><Link to="/demonstration">Demo QA</Link><Link to="/unknown">Missing QA</Link><Link to="/bare">Bare QA</Link></nav>
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/auto-schools" element={<AutoSchools />} />
      <Route path="/demonstration" element={<DemonstrationPage />} />
      <Route path="/bare" element={<div>Route without Helmet</div>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  </MemoryRouter></HelmetProvider>);
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  });
  const parsed = new DOMParser().parseFromString(entryHtml, "text/html");
  document.head.innerHTML = "";
  // Real static head tags, without executing analytics/privacy scripts in this test.
  for (const element of parsed.head.querySelectorAll("title, meta, link")) {
    document.head.appendChild(element.cloneNode(true));
  }
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("metadata ownership and route transitions", () => {
  it("adopts static fallback tags into Helmet without duplicate SEO fields", async () => {
    mountPage("/auto-schools?utm_source=seo_test");
    await waitFor(() => expect(document.title).toBe(autoTitle));
    expect(document.head.querySelectorAll("title")).toHaveLength(1);
    expect(meta("description")).toContain("(Beta)");
    expect(meta("og:title", true)).toBe(autoTitle);
    expect(meta("og:description", true)).toBe(meta("description"));
    expect(meta("og:url", true)).toBe(`${origin}/auto-schools`);
    expect(meta("twitter:title")).toBe(autoTitle);
    expect(canonical()).toBe(`${origin}/auto-schools`);
    expect(screen.getByText("Автошколы · Beta")).toBeInTheDocument();
    expect(screen.getByText(/Документы пока имеют статус черновиков/)).toHaveTextContent("Банковская интеграция, официальный банк ПДД и передача сведений в государственные системы не заявлены.");
    expect(screen.getByRole("link", { name: /Войти как организация/ })).toHaveAttribute("href", "/login?next=%2Forganization%2Fdriving-school");
    expect(screen.getByRole("link", { name: "Зарегистрировать организацию" })).toHaveAttribute("href", "/register-organization?module=driving-school");
  });

  it("restores home defaults, replaces demo description, and clears noindex after leaving 404", async () => {
    mountPage();
    await waitFor(() => expect(document.title).toBe(autoTitle));
    fireEvent.click(screen.getByText("Home QA"));
    await waitFor(() => expect(document.title).toBe(defaultTitle));
    expect(canonical()).toBe(`${origin}/`);
    expect(meta("description")).toContain("система дистанционного обучения");
    expect(meta("og:title", true)).toBe(defaultTitle);
    expect(meta("twitter:title")).toBe(defaultTitle);
    fireEvent.click(screen.getByText("Demo QA"));
    await waitFor(() => expect(document.title).toBe("Демонстрация возможностей СИНТАГМА — СДО для учебных центров"));
    expect(meta("description")).toBe("Живая демонстрация СИНТАГМА: конструктор курсов, подготовка данных для ФИС ФРДО, документы, ученики и CRM.");
    expect(canonical()).toBe(`${origin}/demonstration`);
    fireEvent.click(screen.getByText("Missing QA"));
    await waitFor(() => expect(meta("robots")).toBe("noindex, follow"));
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
    fireEvent.click(screen.getByText("Bare QA"));
    await waitFor(() => expect(document.title).toBe(defaultTitle));
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
    expect(meta("description")).toContain("система дистанционного обучения");
    expect(meta("og:title", true)).toBe(defaultTitle);
  });

  it("marks a direct unknown route noindex without claiming an HTTP status", async () => {
    mountPage("/a/missing/page");
    await waitFor(() => expect(meta("robots")).toBe("noindex, follow"));
    expect(document.title).toBe("Страница не найдена — СИНТАГМА");
    expect(screen.getByRole("heading", { name: "404" })).toBeInTheDocument();
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
  });
});

describe("crawl files", () => {
  it("uses one universal group with the same six private-path exclusions", () => {
    const robots = readFileSync(resolve(process.cwd(), "public/robots.txt"), "utf8");
    expect([...robots.matchAll(/^\s*User-agent:\s*(.+)$/gm)].map((match) => match[1])).toEqual(["*"]);
    expect([...robots.matchAll(/^\s*Disallow:\s*(.+)$/gm)].map((match) => match[1])).toEqual(["/admin", "/organization", "/student", "/course-editor", "/course-builder", "/course-learning"]);
    expect(robots).toMatch(/Allow:\s*\//);
    expect(robots).toContain(`Sitemap: ${origin}/sitemap.xml`);
  });

  it("adds only the two public sitemap routes without invented lastmod dates", () => {
    const xml = new DOMParser().parseFromString(readFileSync(resolve(process.cwd(), "public/sitemap.xml"), "utf8"), "application/xml");
    expect(xml.querySelector("parsererror")).toBeNull();
    const entries = [...xml.querySelectorAll("url")];
    expect(entries).toHaveLength(20);
    expect(new Set(entries.map((entry) => entry.querySelector("loc")?.textContent)).size).toBe(20);
    for (const path of ["/auto-schools", "/demonstration"]) {
      const entry = entries.find((item) => item.querySelector("loc")?.textContent === `${origin}${path}`);
      expect(entry).toBeDefined();
      expect(entry!.querySelector("lastmod")).toBeNull();
    }
  });
});
