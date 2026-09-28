import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DefaultMetadata } from "@/components/DefaultMetadata";
import FeatureDocuments from "@/pages/FeatureDocuments";
import FeatureVideoId from "@/pages/FeatureVideoId";
import FeatureLaborSafety from "@/pages/FeatureLaborSafety";
import FeatureCourseStore from "@/pages/FeatureCourseStore";
import FeatureDocumentChecklist from "@/pages/FeatureDocumentChecklist";
import FeatureCourseSettings from "@/pages/FeatureCourseSettings";
import FeatureBranding from "@/pages/FeatureBranding";
import FeatureAICourses from "@/pages/FeatureAICourses";
import FeatureEmailCampaigns from "@/pages/FeatureEmailCampaigns";
import FeatureSalesCRM from "@/pages/FeatureSalesCRM";
import NotFound from "@/pages/NotFound";

const origin = "https://xn--80aaiswd0ak.xn--p1ai";
const defaultTitle = "СИНТАГМА — СДО и документооборот для организаций";
const defaultSocialDescription = "Курсы, ученики, прогресс, документы и подготовка данных для ФИС ФРДО в одном кабинете.";
const entryHtml = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

// Real page components and real Helmet owners; only browser-only APIs are stubbed.
const pages = [
  {
    path: "/feature/documents", Component: FeatureDocuments,
    title: "Документооборот учебной группы — СИНТАГМА",
    description: "Документооборот учебной группы в СИНТАГМЕ: курсы, слушатели, договоры, версии документов и статусы готовности. Возможности и ограничения Beta.",
    heading: "От регистрации слушателя до готового комплекта документов",
  },
  {
    path: "/feature/video-id", Component: FeatureVideoId,
    title: "Фотоидентификация слушателей — СИНТАГМА",
    description: "Фотофиксация слушателя перед дистанционной аттестацией: привязка к зачислению, история статусов и ручная проверка администратором организации.",
    heading: "Идентификация обучающихся при дистанционной аттестации",
  },
  {
    path: "/feature/labor-safety", Component: FeatureLaborSafety,
    title: "Модуль обучения по охране труда — СИНТАГМА",
    description: "Обучение по охране труда в СИНТАГМЕ: группы слушателей, назначение курсов, статусы прохождения и подготовка протоколов проверки знаний.",
    heading: "Модуль обучения по охране труда",
  },
  {
    path: "/feature/course-store", Component: FeatureCourseStore,
    title: "Магазин курсов для организаций и слушателей — СИНТАГМА",
    description: "Магазин курсов СИНТАГМА: публикация и поиск курсов, заявки слушателей, настройка цен и управление размещёнными программами обучения.",
    heading: "Дополнительный канал продаж ваших курсов",
  },
  {
    path: "/feature/document-checklist", Component: FeatureDocumentChecklist,
    title: "Чек-лист документов слушателей — СИНТАГМА",
    description: "Чек-лист документов слушателей в СИНТАГМЕ: настройка списка, загрузка через личный кабинет, статусы комплектности, хранение и просмотр файлов.",
    heading: "Сбор и хранение документов слушателей",
  },
  {
    path: "/feature/course-settings", Component: FeatureCourseSettings,
    title: "Настройки курсов и прохождения обучения — СИНТАГМА",
    description: "Настройки курсов в СИНТАГМЕ: последовательность уроков, управление перемоткой видео, напоминания, сбор данных слушателей и уведомления о завершении.",
    heading: "Гибкие настройки курсов",
  },
  {
    path: "/feature/branding", Component: FeatureBranding,
    title: "Брендирование учебного кабинета — СИНТАГМА",
    description: "Брендирование в СИНТАГМЕ: логотип, обложка, фирменные цвета, название организации и персональная страница входа для слушателей.",
    heading: "Ваш бренд — на каждом экране",
  },
  {
    path: "/feature/ai-courses", Component: FeatureAICourses,
    title: "Создание курсов с помощью ИИ — СИНТАГМА",
    description: "Обзор ИИ-функций конструктора курсов СИНТАГМА: создание структуры, уроков и тестов, озвучка текста и демонстрация редактора.",
    heading: "Создавайте курсы с помощью ИИ",
  },
  {
    path: "/feature/email-campaigns", Component: FeatureEmailCampaigns,
    title: "Email-рассылки и SMTP — Синтагма",
    description: "Шаблоны, drip-цепочки, A/B-тест тем, click-tracking и UTM. Свой SMTP, проверка SPF/DKIM/DMARC, RFC 8058 unsubscribe и ФЗ-152.",
    heading: "Email-рассылки со своего домена",
    ogTitle: "Email-рассылки — Синтагма",
    ogDescription: "Профессиональные email-рассылки со своего SMTP. Шаблоны, A/B-тесты, drip-цепочки и трекинг открытий.",
  },
  {
    path: "/feature/sales-crm", Component: FeatureSalesCRM,
    title: "CRM и Продажи — Синтагма",
    description: "Канбан сделок, КП с PDF, договоры и ПЭП, счета и автонапоминания об оплате, лидерборд менеджеров и тайм-лайн «Сделки 360°».",
    heading: "CRM и продажи без хаоса",
    ogTitle: "CRM и Продажи — Синтагма",
    ogDescription: "Полноценная CRM для B2B: сделки, КП, договоры, счета и контроль менеджеров — в одной системе.",
  },
];

function meta(key: string, property = false) {
  const elements = document.head.querySelectorAll(`meta[${property ? "property" : "name"}="${key}"]`);
  expect(elements).toHaveLength(1);
  return elements[0].getAttribute("content");
}

function assertPageMetadata(page: typeof pages[number]) {
  expect(document.head.querySelectorAll("title")).toHaveLength(1);
  expect(document.title).toBe(page.title);
  expect(meta("description")).toBe(page.description);
  const canonicals = document.head.querySelectorAll('link[rel="canonical"]');
  expect(canonicals).toHaveLength(1);
  expect(canonicals[0].getAttribute("href")).toBe(`${origin}${page.path}`);
  expect(meta("og:url", true)).toBe(`${origin}${page.path}`);
  expect(meta("og:title", true)).toBe(page.ogTitle ?? page.title);
  expect(meta("og:description", true)).toBe(page.ogDescription ?? page.description);
  expect(meta("twitter:title")).toBe(page.title);
  expect(meta("twitter:description")).toBe(page.description);
  expect(meta("og:type", true)).toBe("website");
  expect(meta("twitter:card")).toBe("summary_large_image");
  expect(meta("og:image", true)).toBe(`${origin}/og-registration-organization.jpg`);
  expect(meta("twitter:image")).toBe(`${origin}/og-registration-organization.jpg`);
  expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(page.heading);
}

function mountPage(path: string) {
  return render(
    <HelmetProvider>
      <DefaultMetadata />
      <MemoryRouter initialEntries={[path]}>
        <nav aria-label="Metadata test navigation">
          {pages.map((page) => <Link key={page.path} to={`${page.path}?utm_source=transition#details`}>{page.path} QA</Link>)}
          <Link to="/missing-feature-test">Missing QA</Link>
          <Link to="/bare-feature-test">Bare QA</Link>
        </nav>
        <Routes>
          {pages.map(({ path, Component }) => <Route key={path} path={path} element={<Component />} />)}
          <Route path="/bare-feature-test" element={<div>Route without page metadata</div>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network is forbidden in metadata tests"); }));
  // jsdom has no canvas implementation; retain the real Footer component.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  const parsed = new DOMParser().parseFromString(entryHtml, "text/html");
  document.head.innerHTML = "";
  // Adopt the actual static fallback tags, without executing analytics scripts.
  for (const element of parsed.head.querySelectorAll("title, meta, link")) {
    document.head.appendChild(element.cloneNode(true));
  }
});

afterEach(() => {
  cleanup();
  expect(fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("public feature page metadata", () => {
  it.each(pages)("renders unique metadata at $path without query or fragment in canonical", async (page) => {
    mountPage(`${page.path}?utm_source=metadata_test&next=%2Fprivate#details`);
    await waitFor(() => assertPageMetadata(page));
  });

  it("gives every feature its own title and description", async () => {
    mountPage(pages[0].path);
    const titles = new Set<string>();
    const descriptions = new Set<string | null>();
    for (const page of pages) {
      fireEvent.click(screen.getByRole("link", { name: `${page.path} QA` }));
      await waitFor(() => assertPageMetadata(page));
      titles.add(document.title);
      descriptions.add(meta("description"));
    }
    expect(titles.size).toBe(pages.length);
    expect(descriptions.size).toBe(pages.length);

    fireEvent.click(screen.getByRole("link", { name: "Missing QA" }));
    await waitFor(() => expect(meta("robots")).toBe("noindex, follow"));
    expect(document.title).toBe("Страница не найдена — СИНТАГМА");
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();

    fireEvent.click(screen.getByRole("link", { name: `${pages[0].path} QA` }));
    await waitFor(() => assertPageMetadata(pages[0]));

    fireEvent.click(screen.getByRole("link", { name: "Bare QA" }));
    await waitFor(() => expect(document.title).toBe(defaultTitle));
    expect(document.head.querySelectorAll("title")).toHaveLength(1);
    expect(meta("description")).toContain("система дистанционного обучения");
    expect(meta("og:title", true)).toBe(defaultTitle);
    expect(meta("og:description", true)).toBe(defaultSocialDescription);
    expect(meta("og:url", true)).toBe(`${origin}/`);
    expect(meta("twitter:title")).toBe(defaultTitle);
    expect(meta("twitter:description")).toBe(defaultSocialDescription);
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  }, 15_000); // Ten real pages plus 404/reset require multiple Helmet update frames.
});
