import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DefaultMetadata } from "@/components/DefaultMetadata";
import DocumentsIndex from "@/pages/DocumentsIndex";
import DocumentPage from "@/pages/DocumentPage";
import { DOCUMENT_GROUPS } from "@/content/documents/manifest";

vi.mock("@/components/landing/LandingHeader", () => ({ LandingHeader: () => null }));
vi.mock("@/components/landing/Footer", () => ({ Footer: () => null }));
vi.mock("@/components/proposal/SignatureStampBlock", () => ({ SignatureStampBlock: () => null }));

const origin = "https://xn--80aaiswd0ak.xn--p1ai";
const documents = DOCUMENT_GROUPS.flatMap((group) => group.documents);
const entryHtml = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

function value(selector: string, attribute: string) {
  const nodes = document.head.querySelectorAll(selector);
  expect(nodes).toHaveLength(1);
  return nodes[0].getAttribute(attribute);
}

function mount(path: string) {
  return render(<HelmetProvider><DefaultMetadata /><MemoryRouter initialEntries={[path]}>
    <nav>
      <Link to="/documents">List QA</Link>
      <Link to="/documents/user-agreement">Document QA</Link>
      <Link to="/documents/not-a-real-document">Missing QA</Link>
    </nav>
    <Routes>
      <Route path="/documents" element={<DocumentsIndex />} />
      <Route path="/documents/:slug" element={<DocumentPage />} />
    </Routes>
  </MemoryRouter></HelmetProvider>);
}

beforeEach(() => {
  const parsed = new DOMParser().parseFromString(entryHtml, "text/html");
  document.head.innerHTML = "";
  for (const element of parsed.head.querySelectorAll("title, meta, link")) {
    document.head.appendChild(element.cloneNode(true));
  }
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("public document URL ownership", () => {
  it("uses the primary domain for the index without changing document links", async () => {
    mount("/documents?utm_source=qa");
    await waitFor(() => expect(document.title).toBe("Документы платформы СИНТАГМА"));
    expect(value('link[rel="canonical"]', "href")).toBe(`${origin}/documents`);
    expect(value('meta[property="og:url"]', "content")).toBe(`${origin}/documents`);
    expect(value('meta[name="twitter:title"]', "content")).toBe(document.title);
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    const hrefs = [...document.querySelectorAll("a")].map((node) => node.getAttribute("href"));
    for (const doc of documents) {
      expect(hrefs).toContain(`/documents/${doc.slug}`);
      expect(hrefs).toContain(doc.pdfPath);
    }
  });

  it.each(documents)("keeps metadata and download consistent for $slug", async (doc) => {
    mount(`/documents/${doc.slug}?utm_source=qa&yclid=test-only`);
    await waitFor(() => expect(document.title).toBe(`${doc.title} — СИНТАГМА`));
    const canonical = `${origin}/documents/${doc.slug}`;
    expect(value('link[rel="canonical"]', "href")).toBe(canonical);
    expect(value('meta[property="og:url"]', "content")).toBe(canonical);
    expect(value('meta[name="description"]', "content")).toBe(doc.summary.slice(0, 155));
    expect(value('meta[name="twitter:title"]', "content")).toBe(document.title);
    expect(value('meta[name="twitter:description"]', "content")).toBe(doc.summary.slice(0, 155));
    const scripts = document.head.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts).toHaveLength(1);
    const data = JSON.parse(scripts[0].textContent!);
    expect(data.url).toBe(canonical);
    expect(data.name).toBe(doc.title);
    expect(data.version).toBe(doc.version);
    expect(screen.getByRole("link", { name: /Скачать PDF/ })).toHaveAttribute("href", doc.pdfPath);
    expect(document.querySelector("article")?.textContent?.length).toBeGreaterThan(0);
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it("removes document metadata on a missing slug and clears noindex on return", async () => {
    mount("/documents/user-agreement");
    await waitFor(() => expect(document.title).toBe("Пользовательское соглашение — СИНТАГМА"));
    fireEvent.click(screen.getByText("Missing QA"));
    await waitFor(() => expect(document.title).toBe("Документ не найден — СИНТАГМА"));
    expect(value('meta[name="robots"]', "content")).toBe("noindex, follow");
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.head.querySelector('script[type="application/ld+json"]')).toBeNull();
    fireEvent.click(screen.getByText("List QA"));
    await waitFor(() => expect(document.title).toBe("Документы платформы СИНТАГМА"));
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
    expect(value('link[rel="canonical"]', "href")).toBe(`${origin}/documents`);
  });

  it("marks a direct missing document noindex without claiming an HTTP404", async () => {
    mount("/documents/not-a-real-document");
    await waitFor(() => expect(value('meta[name="robots"]', "content")).toBe("noindex, follow"));
    expect(screen.getByRole("heading", { name: "Документ не найден" })).toBeInTheDocument();
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
  });
});
