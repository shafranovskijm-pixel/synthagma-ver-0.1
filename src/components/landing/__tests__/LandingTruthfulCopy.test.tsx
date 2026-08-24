import { cleanup, render, screen } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { Footer } from "@/components/landing/Footer";
import { Hero } from "@/components/landing/Hero";
import { MobileApp } from "@/components/landing/MobileApp";
import { RostechnadzorCourses } from "@/components/landing/RostechnadzorCourses";
import { Testimonials } from "@/components/landing/Testimonials";
import Install from "@/pages/Install";

const testimonialQueryMocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: testimonialQueryMocks.from },
}));

vi.mock("@/components/landing/TestimonialForm", () => ({
  TestimonialForm: () => null,
}));

vi.mock("@/components/landing/StarfieldCanvas", () => ({
  StarfieldCanvas: () => null,
}));

vi.mock("@/components/landing/FloatingParticles", () => ({
  FloatingParticles: () => null,
}));

beforeAll(() => {
  vi.stubGlobal("IntersectionObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

beforeEach(() => {
  testimonialQueryMocks.order.mockResolvedValue({ data: [], error: null });
  testimonialQueryMocks.eq.mockReturnValue({ order: testimonialQueryMocks.order });
  testimonialQueryMocks.select.mockReturnValue({ eq: testimonialQueryMocks.eq });
  testimonialQueryMocks.from.mockReturnValue({ select: testimonialQueryMocks.select });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("truthful landing copy", () => {
  it("describes the core workflow without an unconditional launch deadline", () => {
    render(<MemoryRouter><Hero /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: /Дистанционное обучение и документы/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Зарегистрировать организацию" })).toHaveAttribute("href", "/register-organization");
    expect(screen.queryByText(/7 дней/i)).not.toBeInTheDocument();
  });

  it("links pricing to the section that exists on the landing page", () => {
    render(<MemoryRouter><Footer /></MemoryRouter>);

    expect(screen.getByRole("link", { name: "Стоимость" })).toHaveAttribute("href", "/#pricing");
    expect(screen.getByRole("link", { name: "Помощь и обучение" })).toHaveAttribute("href", "/help");
  });

  it("presents the course catalog without fixed inventory promises", () => {
    render(<MemoryRouter><RostechnadzorCourses /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: /Готовые курсы для быстрого запуска обучения/ })).toBeInTheDocument();
    expect(screen.getByText("Каталог готовых курсов")).toBeInTheDocument();
    expect(screen.queryByText(/300\+/)).not.toBeInTheDocument();
    expect(screen.queryByText(/14 направлений/)).not.toBeInTheDocument();
    expect(screen.queryByText("24/7")).not.toBeInTheDocument();
  });

  it("identifies the mobile experience as a PWA", () => {
    render(<MemoryRouter><MobileApp /></MemoryRouter>);

    expect(screen.getByText("Веб-приложение (PWA)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Установить веб-приложение/ })).toHaveAttribute("href", "/install");
    expect(screen.getByText("Уведомления внутри платформы")).toBeInTheDocument();
    expect(screen.queryByText(/Курсы офлайн/)).not.toBeInTheDocument();
  });

  it("does not offer an APK that is not available", () => {
    render(
      <HelmetProvider>
        <MemoryRouter><Install /></MemoryRouter>
      </HelmetProvider>,
    );

    expect(screen.getByRole("heading", { name: "Установите веб-приложение" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "APK в разработке" })).toBeDisabled();
    expect(screen.queryByText("Доступ без интернета")).not.toBeInTheDocument();
    expect(screen.queryByText(/Push-уведомления/)).not.toBeInTheDocument();
  });

  it("shows only approved database testimonials and a neutral empty state", async () => {
    render(<Testimonials />);

    expect(await screen.findByText("Пока нет опубликованных отзывов.")).toBeInTheDocument();
    expect(screen.getByText("Опубликованные отзывы пользователей платформы")).toBeInTheDocument();
    expect(testimonialQueryMocks.eq).toHaveBeenCalledWith("is_approved", true);
    expect(screen.queryByText("Анна Морозова")).not.toBeInTheDocument();
    expect(screen.queryByText(/получили лицензию/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Пользуется/)).not.toBeInTheDocument();
  });

  it("uses code-native landing visuals instead of synthetic or obsolete product images", () => {
    const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
    const features = read("src/components/landing/Features.tsx");
    const mobileApp = read("src/components/landing/MobileApp.tsx");
    const websiteDevelopment = read("src/components/landing/WebsiteDevelopmentCard.tsx");
    const frdoPain = read("src/components/landing/FrdoPainSlide.tsx");
    const specialOffer = read("src/components/landing/SpecialOfferPopup.tsx");
    const presentationBlocks = read("src/pages/presentationBlocks.tsx");
    const platformPresentation = read("src/pages/PlatformPresentation.tsx");

    expect(features).not.toMatch(/assets\/features\/.+-bg\.jpg/);
    expect(features).not.toContain("screenshot-marketplace.png");
    expect(mobileApp).not.toContain("mobile-app-mockup.webp");
    expect(websiteDevelopment).not.toContain("website-dev-illustration.png");
    expect(frdoPain).not.toContain("frdo-errors-pain.png");
    expect(frdoPain).not.toContain("fis-frdo.obrnadzor.gov.ru");
    expect(specialOffer).not.toContain("special-offer-bg.jpg");
    expect(specialOffer).toContain("popup.image_url?.trim() || null");
    expect(presentationBlocks).not.toContain("mobile-app-mockup.webp");
    expect(presentationBlocks).not.toContain("300+ готовых курсов");
    expect(platformPresentation).not.toContain("screenshot-marketplace.png");
    expect(platformPresentation).not.toContain("screenshot-catalog.png");
    expect(platformPresentation).not.toContain("screenshot-company.png");
    expect(platformPresentation).not.toContain("screenshot-teacher.png");
  });

  it("qualifies identity, documents, FRDO, editor and commercial claims", () => {
    const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
    const features = read("src/components/landing/Features.tsx");
    const pricing = read("src/components/landing/PricingPlans.tsx");
    const howItWorks = read("src/components/landing/HowItWorks.tsx");
    const frdoSection = read("src/components/landing/FrdoSection.tsx");
    const frdoPain = read("src/components/landing/FrdoPainSlide.tsx");
    const testimonials = read("src/components/landing/Testimonials.tsx");
    const editorDemo = read("src/components/landing/EditorDemo.tsx");
    const editorDemoSection = read("src/components/landing/EditorDemoSection.tsx");
    const editorDemoSlider = read("src/components/landing/EditorDemoSlider.tsx");

    expect(features).toContain("Фотофиксация слушателя с ручной проверкой результата администратором");
    expect(features).not.toContain("опросы и запись");
    expect(pricing).not.toContain("домен вашей организации");
    expect(pricing).not.toContain("за 5 секунд");
    expect(pricing).toContain("состав работ и условия согласуются отдельно");
    expect(howItWorks).not.toContain("выданных документов");
    expect(howItWorks).not.toContain("Документы в порядке");
    expect(frdoSection).not.toContain("без ручной чистки таблиц");
    expect(frdoSection).not.toContain("скрытых ошибок");
    expect(frdoPain).toContain("проверяет результат");
    expect(testimonials).not.toContain("Проверенные отзывы");
    expect(testimonials).not.toContain("usageDuration");
    expect(editorDemo).not.toContain("Создавайте курсы за минуты");
    expect(editorDemoSection).not.toContain("Создавайте курсы за минуты");
    expect(editorDemoSlider).not.toContain("Создавайте курсы за минуты");
  });

  it("keeps metadata, FRDO copy and the sitemap aligned with implemented behavior", () => {
    const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
    const indexPage = read("src/pages/Index.tsx");
    const html = read("index.html");
    const features = read("src/components/landing/Features.tsx");
    const pricing = read("src/components/landing/PricingPlans.tsx");
    const websiteDevelopment = read("src/components/landing/WebsiteDevelopmentCard.tsx");
    const finalCta = read("src/components/landing/FinalCta.tsx");
    const catalogPage = read("src/pages/RostechnadzorCoursesPage.tsx");
    const frdoFeaturePage = read("src/pages/FeatureFRDO.tsx");
    const sitemap = read("public/sitemap.xml");

    expect(indexPage).not.toContain("aggregateRating");
    expect(indexPage).not.toContain("priceValidUntil");
    expect(indexPage).not.toContain("273-ФЗ");
    expect(html).not.toContain("273-ФЗ");
    expect(html).not.toContain("gpt-engineer-file-uploads");
    expect(html).not.toContain("ChatGPT_Image");
    expect(html).toContain("курсы, ученики, прогресс, документы и подготовка данных для ФИС ФРДО");
    expect(html).toContain("https://xn--80aaiswd0ak.xn--p1ai/");
    expect(indexPage).toContain("https://xn--80aaiswd0ak.xn--p1ai/og-registration-organization.jpg");
    expect(existsSync(resolve(process.cwd(), "public/og-registration-organization.jpg"))).toBe(true);
    expect(features).toContain("Подготовка XLSX-файлов");
    expect(pricing).toContain("41/35 столбцов");
    expect(pricing).toContain("встроенных вебинаров LiveKit");
    expect(pricing).not.toContain("Автоматическое формирование XML");
    expect(pricing).not.toContain("Соответствие требованиям 273-ФЗ");
    expect(websiteDevelopment).not.toContain("1 неделю");
    expect(websiteDevelopment).not.toContain("соответствующей требованиям к образовательным организациям");
    expect(finalCta).not.toContain("Оставьте заявку");
    expect(catalogPage).not.toContain("Запуск за 5 минут");
    expect(catalogPage).not.toContain("Актуальные на 2026 год");
    expect(catalogPage).not.toContain("получите доступ ко всей библиотеке курсов");
    expect(frdoFeaturePage).not.toContain("frdo-errors-pain.png");
    expect(frdoFeaturePage).not.toContain("Прямая выгрузка в ФИС ФРДО");
    expect(frdoFeaturePage).not.toContain("С Синтагмой — ноль ошибок");
    expect(frdoFeaturePage).not.toContain("Постановление Правительства РФ № 729");
    expect(frdoFeaturePage).toContain("постановлением Правительства РФ от 31.05.2021 № 825");
    expect(frdoFeaturePage).toContain("30 календарных дней");
    expect(sitemap).toContain("https://xn--80aaiswd0ak.xn--p1ai/help");
    expect(sitemap).not.toContain("https://sintagma.com.ru/");
  });

  it("keeps secondary public pages free of unsupported claims and stale pricing", () => {
    const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
    const demonstration = read("src/pages/DemonstrationPage.tsx");
    const presentation = read("src/pages/PlatformPresentation.tsx");
    const presentationSections = read("src/pages/presentationSections.ts");
    const presentationBlocks = read("src/pages/presentationBlocks.tsx");
    const about = read("src/pages/About.tsx");
    const videoId = read("src/pages/FeatureVideoId.tsx");
    const publicRoutes = read("src/routes/publicRoutes.tsx");
    const sitemap = read("public/sitemap.xml");

    expect(demonstration).not.toContain("300+ готовых курсов");
    expect(demonstration).not.toContain("за 7 дней");
    expect(demonstration).not.toContain("в течение 30 минут");
    expect(demonstration).not.toContain("электронная подпись");
    expect(demonstration).not.toContain("IP-телефонию");
    expect(demonstration).not.toContain("в один клик");
    expect(demonstration).toContain("https://xn--80aaiswd0ak.xn--p1ai/demonstration");
    expect(demonstration).toContain("Иллюстрация раздела");

    expect(presentation).not.toContain("Сравнение с конкурентами");
    expect(presentation).not.toContain("pricingPlans");
    expect(presentation).not.toContain("3D-тренажёры");
    expect(presentation).toContain('to="/#pricing"');
    expect(presentation).toContain("Посмотреть актуальные тарифы");
    expect(presentationSections).not.toContain("До 70%");
    expect(presentationSections).not.toContain("за 5 минут");
    expect(presentationSections).not.toContain("35 уроков");
    expect(presentationSections).not.toContain("700 слов");
    expect(presentationSections).not.toContain("15 вопросов");
    expect(presentationSections).not.toContain("3D-тренажёры");
    expect(presentationBlocks).not.toContain("~2 минуты");
    expect(presentationBlocks).not.toContain("актуальным НПА 2026 года");

    expect(about).not.toContain("полностью соответствует требованиям 273-ФЗ");
    expect(about).not.toContain("готова к интеграции с ФРДО");
    expect(about).toContain("Соответствие процессов требованиям законодательства обеспечивает образовательная организация");
    expect(videoId).not.toContain("1 марта 2023 года");
    expect(videoId).not.toContain("Обеспечьте соответствие требованиям закона");
    expect(videoId).not.toContain("Видеоидентификация доступна на тарифах");
    expect(videoId).toContain("определяет образовательная организация");

    expect(publicRoutes).not.toContain('import("@/pages/Features")');
    expect(publicRoutes).toContain('<Route path="/features" element={<Navigate to="/#pricing" replace />} />');
    expect(sitemap).not.toContain("/features");
  });
});
