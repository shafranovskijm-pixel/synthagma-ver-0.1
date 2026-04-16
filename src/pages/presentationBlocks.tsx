import React from "react";
import { Link } from "react-router-dom";
import {
  GraduationCap, Building2, Users, BookOpen, Brain, FileText,
  Smartphone, CheckCircle2, HardHat,
  Factory, Flame, Waves, Zap
} from "lucide-react";
import {
  problemCards, solutionMarquee, lmsFeatures, aiFeatures,
  documentTypes, safetyFeatures, mobileFeatures,
} from "./presentationSections";
import { TypewriterText, InViewTypewriterText } from "@/components/ui/TypewriterText";
import { StarfieldCanvas } from "@/components/landing/StarfieldCanvas";

type SectionComponent = React.ComponentType<{ children: React.ReactNode; className?: string }>;

export function PresentationHero({ Section, heroBg }: { Section: SectionComponent; heroBg: string }) {
  return (
    <Section className="relative text-white overflow-hidden bg-[#0a0e1a]">
      <img src={heroBg} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" width={1920} height={1080} />
      <StarfieldCanvas />
      <div className="relative max-w-7xl mx-auto px-4 md:px-8 py-20 md:py-32 text-center">
        <div className="w-20 h-20 md:w-28 md:h-28 rounded-3xl bg-gradient-to-br from-[hsl(174_72%_46%)] to-[hsl(174_65%_30%)] flex items-center justify-center mx-auto mb-8 shadow-[0_0_60px_hsl(174_72%_46%/0.4)]">
          <GraduationCap className="w-10 h-10 md:w-16 md:h-16 text-white" />
        </div>
        <h1 className="text-5xl md:text-8xl font-bold tracking-tight mb-4 bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
          <TypewriterText text="СИНТАГМА" speed={80} delay={500} />
        </h1>
        <p className="text-lg md:text-2xl text-white/60 font-light mb-10">
          <TypewriterText text="Платформа для образовательных организаций" speed={40} delay={1200} />
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {[
            { icon: BookOpen, label: "LMS" },
            { icon: FileText, label: "Документооборот" },
            { icon: Brain, label: "ИИ-ассистент" },
            { icon: GraduationCap, label: "ФИС ФРДО" },
          ].map(t => (
            <span key={t.label} className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/20 text-sm md:text-base text-white/70 backdrop-blur-sm bg-white/5">
              <t.icon className="w-4 h-4" />{t.label}
            </span>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function PresentationProblem({ Section }: { Section: SectionComponent }) {
  return (
    <Section className="bg-[hsl(40_20%_98%)] dark:bg-[hsl(0_0%_8%)]">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-24">
        <h2 className="text-3xl md:text-5xl font-bold text-[hsl(0_0%_8%)] dark:text-white mb-3"><InViewTypewriterText text="Проблема" speed={60} delay={200} /></h2>
        <p className="text-base md:text-xl text-[hsl(0_0%_45%)] dark:text-white/60 mb-10">С чем сталкиваются образовательные организации каждый день</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
          {problemCards.map((p, i) => (
            <div key={i} className="bg-white dark:bg-white/5 rounded-2xl p-6 md:p-8 border border-[hsl(40_15%_90%)] dark:border-white/10 shadow-sm flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${p.color.replace(")", " / 0.1)")}` }}>
                <p.icon className="w-6 h-6" style={{ color: p.color }} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[hsl(0_0%_8%)] dark:text-white mb-1">{p.title}</h3>
                <p className="text-sm text-[hsl(0_0%_45%)] dark:text-white/60">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function PresentationSolution({ Section }: { Section: SectionComponent }) {
  return (
    <Section className="bg-gradient-to-br from-[hsl(174_72%_46%)] to-[hsl(174_60%_28%)] text-white">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-24 text-center">
        <h2 className="text-3xl md:text-5xl font-bold mb-4"><InViewTypewriterText text="Единая платформа" speed={50} delay={200} /></h2>
        <p className="text-base md:text-xl text-white/80 mb-12 max-w-3xl mx-auto">Всё для образовательной организации — от создания курсов до выгрузки в ФИС ФРДО</p>
        <div className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
          <div className="flex gap-4 md:gap-6 animate-marquee hover:[animation-play-state:paused] w-max">
            {[...solutionMarquee, ...solutionMarquee].map((f, i) => (
              <div key={i} className="bg-white/15 backdrop-blur-sm rounded-2xl p-6 md:p-8 flex flex-col items-center gap-3 min-w-[160px] md:min-w-[200px] hover:scale-105 transition-transform">
                <f.icon className="w-8 h-8 md:w-10 md:h-10" />
                <span className="text-sm md:text-base font-medium whitespace-nowrap">{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

export function PresentationLMS({ Section }: { Section: SectionComponent }) {
  return (
    <Section className="bg-[hsl(40_20%_98%)] dark:bg-[hsl(0_0%_8%)]">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-24">
        <h2 className="text-3xl md:text-5xl font-bold text-[hsl(0_0%_8%)] dark:text-white mb-3"><InViewTypewriterText text="Управление курсами" speed={40} delay={200} /></h2>
        <p className="text-base md:text-xl text-[hsl(0_0%_45%)] dark:text-white/60 mb-10">Создавайте, импортируйте или генерируйте курсы с ИИ</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {lmsFeatures.map((t, i) => (
            <div key={i} className="bg-white dark:bg-white/5 rounded-2xl border border-[hsl(40_15%_90%)] dark:border-white/10 p-6 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-[hsl(174_72%_46%/0.1)] flex items-center justify-center flex-shrink-0">
                <t.icon className="w-5 h-5 text-[hsl(174_72%_46%)]" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[hsl(0_0%_8%)] dark:text-white mb-1">{t.title}</h3>
                <p className="text-sm text-[hsl(0_0%_45%)] dark:text-white/60">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function PresentationAI({ Section, aiBg }: { Section: SectionComponent; aiBg: string }) {
  return (
    <Section className="relative text-white overflow-hidden">
      <img src={aiBg} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" width={1920} height={1080} />
      <div className="absolute inset-0 bg-[hsl(262_80%_18%/0.7)]" />
      <div className="relative max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-24">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div>
            <Brain className="w-12 h-12 mb-6 text-[hsl(262_80%_70%)]" />
            <h2 className="text-3xl md:text-5xl font-bold mb-4"><InViewTypewriterText text="ИИ-ассистент" speed={50} delay={200} /></h2>
            <p className="text-base md:text-xl text-white/70 mb-8">Искусственный интеллект, встроенный в каждый этап работы</p>
            <div className="space-y-4">
              {aiFeatures.map((t, i) => (
                <div key={i} className="flex items-start gap-3">
                  <t.icon className="w-5 h-5 text-[hsl(174_72%_46%)] flex-shrink-0 mt-0.5" />
                  <span className="text-sm md:text-base">{t.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-2xl p-6 border border-white/20 shadow-[0_0_40px_hsl(262_80%_50%/0.2)]">
            <div className="space-y-4">
              <div className="flex justify-end"><div className="bg-[hsl(174_72%_46%)] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm max-w-[80%]">Сгенерируй курс «Охрана труда» на 10 уроков</div></div>
              <div className="flex justify-start"><div className="bg-white/10 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm max-w-[90%] text-white/90">Создаю курс «Охрана труда»: 10 уроков с тестами, контент по актуальным НПА 2026 года. Генерация займёт ~2 минуты...</div></div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

export function PresentationDocuments({ Section, docsBg }: { Section: SectionComponent; docsBg: string }) {
  return (
    <Section className="relative text-white overflow-hidden">
      <img src={docsBg} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" width={1920} height={1080} />
      <div className="absolute inset-0 bg-[hsl(0_0%_6%/0.8)]" />
      <div className="relative max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-24">
        <h2 className="text-3xl md:text-5xl font-bold mb-3"><InViewTypewriterText text="Документооборот" speed={50} delay={200} /></h2>
        <p className="text-base md:text-xl text-white/60 mb-10">Автоматическая генерация всех документов из шаблонов</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
          {documentTypes.map((d, i) => (
            <div key={i} className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4 flex items-center gap-3">
              <FileText className="w-5 h-5 text-[hsl(174_72%_46%)] flex-shrink-0" />
              <span className="text-sm font-medium">{d}</span>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-white/40 text-center">Шаблоны DOCX → автозаполнение данными ученика, организации и компании</p>
      </div>
    </Section>
  );
}

export function PresentationSafety({ Section, safetyBg }: { Section: SectionComponent; safetyBg: string }) {
  return (
    <Section className="relative text-white overflow-hidden">
      <img src={safetyBg} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" width={1920} height={1080} />
      <div className="absolute inset-0 bg-[hsl(0_0%_6%/0.75)]" />
      <div className="relative max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-24">
        <div className="flex items-center gap-3 mb-3">
          <HardHat className="w-8 h-8 text-[hsl(38_92%_50%)]" />
          <h2 className="text-3xl md:text-5xl font-bold"><InViewTypewriterText text="Охрана труда" speed={50} delay={200} /></h2>
        </div>
        <p className="text-base md:text-xl text-white/60 mb-10">Полный модуль для обучения по охране труда и проверке знаний</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {safetyFeatures.map((item, i) => (
            <div key={i} className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-[hsl(38_92%_50%/0.2)] flex items-center justify-center flex-shrink-0">
                <item.icon className="w-5 h-5 text-[hsl(38_92%_50%)]" />
              </div>
              <div>
                <h3 className="text-base font-semibold mb-1">{item.title}</h3>
                <p className="text-sm text-white/60">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function PresentationCabinets({ Section, screenshots }: { Section: SectionComponent; screenshots: { org: string; student: string; company: string; teacher: string } }) {
  return (
    <Section className="bg-[hsl(40_20%_98%)] dark:bg-[hsl(0_0%_8%)]">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-24">
        <h2 className="text-3xl md:text-5xl font-bold text-[hsl(0_0%_8%)] dark:text-white mb-3"><InViewTypewriterText text="Четыре кабинета" speed={50} delay={200} /></h2>
        <p className="text-base md:text-xl text-[hsl(0_0%_45%)] dark:text-white/60 mb-10">Отдельный интерфейс для каждой роли</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {[
            { icon: Building2, title: "Организация", color: "hsl(174 72% 46%)", screenshot: screenshots.org, items: ["Курсы и обучение", "Ученики и группы", "Документооборот", "ФИС ФРДО", "Аналитика"] },
            { icon: GraduationCap, title: "Ученик", color: "hsl(262 80% 55%)", screenshot: screenshots.student, items: ["Мои курсы", "Тесты и задания", "Достижения", "ИИ-помощник", "Документы"] },
            { icon: Building2, title: "Компания", color: "hsl(38 92% 50%)", screenshot: screenshots.company, items: ["Сотрудники", "Назначение курсов", "Заявки на обучение", "Документы", "Контроль прогресса"] },
            { icon: Users, title: "Преподаватель", color: "hsl(200 80% 50%)", screenshot: screenshots.teacher, items: ["Проверка заданий", "Оценка тестов", "Ведение вебинаров", "Обратная связь", "Журнал успеваемости"] },
          ].map((c, i) => (
            <div key={i} className="bg-white dark:bg-white/5 rounded-2xl border border-[hsl(40_15%_90%)] dark:border-white/10 overflow-hidden">
              <div className="relative h-48 md:h-56 overflow-hidden">
                <img src={c.screenshot} alt={`Кабинет ${c.title}`} loading="lazy" className="w-full h-full object-cover object-top" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
              </div>
              <div className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${c.color.replace(")", " / 0.1)")}` }}>
                    <c.icon className="w-5 h-5" style={{ color: c.color }} />
                  </div>
                  <h3 className="text-lg font-semibold text-[hsl(0_0%_8%)] dark:text-white">{c.title}</h3>
                </div>
                <ul className="space-y-2">
                  {c.items.map((item, j) => (
                    <li key={j} className="flex items-center gap-2 text-sm text-[hsl(0_0%_45%)] dark:text-white/60">
                      <CheckCircle2 className="w-4 h-4 text-[hsl(142_70%_45%)] flex-shrink-0" />{item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function PresentationMarketplace({ Section, screenshots }: { Section: SectionComponent; screenshots: { marketplace: string; catalog: string } }) {
  return (
    <Section className="bg-gradient-to-br from-[hsl(174_72%_46%)] to-[hsl(174_60%_28%)] text-white">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-24">
        <h2 className="text-3xl md:text-5xl font-bold mb-3"><InViewTypewriterText text="300+ готовых курсов" speed={40} delay={200} /></h2>
        <p className="text-base md:text-xl text-white/80 mb-10">Программы по Ростехнадзору с актуальными тестами 2026 года</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          <div className="rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl">
            <img src={screenshots.marketplace} alt="Магазин курсов Синтагма — 303 курса по 14 направлениям" loading="lazy" className="w-full h-auto" />
          </div>
          <div className="rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl">
            <img src={screenshots.catalog} alt="Каталог курсов — охрана труда, пожарная безопасность, строительство" loading="lazy" className="w-full h-auto" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 mb-8">
          {[
            { icon: Factory, name: "Промышленная безопасность", count: "80+" },
            { icon: Zap, name: "Электробезопасность", count: "120+" },
            { icon: Flame, name: "Энергетическая безопасность", count: "40+" },
            { icon: Waves, name: "Охрана труда и другие", count: "60+" },
          ].map((c, i) => (
            <div key={i} className="bg-white/15 backdrop-blur-sm rounded-2xl p-5 md:p-6 border border-white/20 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <c.icon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold mb-0.5">{c.name}</h3>
                <span className="text-2xl font-bold">{c.count}</span>
                <span className="text-sm text-white/70 ml-1">курсов</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 justify-center">
          {["Актуальные тесты 2026", "Доступ 24/7", "Автообновление по НПА", "Брендирование"].map(t => (
            <span key={t} className="px-4 py-2 rounded-full bg-white/20 text-sm font-medium">{t}</span>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function PresentationMobile({ Section, mobileBg }: { Section: SectionComponent; mobileBg: string }) {
  return (
    <Section className="relative overflow-hidden">
      <img src={mobileBg} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" width={1920} height={1080} />
      <div className="absolute inset-0 bg-[hsl(0_0%_6%/0.8)]" />
      <div className="relative max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-24">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div>
            <Smartphone className="w-12 h-12 mb-6 text-[hsl(174_72%_46%)]" />
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-4"><InViewTypewriterText text="Мобильное приложение" speed={40} delay={200} /></h2>
            <p className="text-base md:text-xl text-white/60 mb-8">Учитесь где угодно — с телефона или планшета</p>
            <div className="space-y-4">
              {mobileFeatures.map((t, i) => (
                <div key={i} className="flex items-center gap-3">
                  <t.icon className="w-5 h-5 text-[hsl(174_72%_46%)]" />
                  <span className="text-sm md:text-base text-white/80">{t.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-center">
            <div className="w-[200px] h-[400px] md:w-[240px] md:h-[480px] rounded-[36px] bg-[hsl(0_0%_12%)] border-4 border-[hsl(0_0%_20%)] p-2.5 shadow-[0_0_60px_hsl(174_72%_46%/0.2)]">
              <div className="w-full h-full rounded-[28px] bg-[hsl(40_20%_98%)] overflow-hidden">
                <div className="h-6 bg-[hsl(0_0%_8%)] flex items-center justify-center"><div className="w-12 h-1 rounded-full bg-white/20" /></div>
                <div className="p-3 space-y-2">
                  <div className="text-[10px] font-semibold text-[hsl(0_0%_8%)]">Мои курсы</div>
                  {[1,2,3].map(i => <div key={i} className="h-10 rounded-lg bg-[hsl(40_15%_92%)]" />)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

export function PresentationCTA({ Section, ctaBg }: { Section: SectionComponent; ctaBg: string }) {
  return (
    <Section className="relative text-white overflow-hidden">
      <img src={ctaBg} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" width={1920} height={1080} />
      <div className="absolute inset-0 bg-[hsl(0_0%_6%/0.7)]" />
      <div className="relative max-w-7xl mx-auto px-4 md:px-8 py-20 md:py-32 text-center">
        <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-[hsl(174_72%_46%)] to-[hsl(174_65%_30%)] flex items-center justify-center mx-auto mb-8 shadow-[0_0_60px_hsl(174_72%_46%/0.4)]">
          <GraduationCap className="w-8 h-8 md:w-12 md:h-12 text-white" />
        </div>
        <h2 className="text-3xl md:text-6xl font-bold mb-4"><InViewTypewriterText text="Начните уже сегодня" speed={40} delay={200} /></h2>
        <p className="text-base md:text-xl text-white/60 mb-10 max-w-xl mx-auto">Бесплатный тариф — навсегда. Все функции доступны.</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <Link to="/register-organization" className="px-8 py-3 md:px-10 md:py-4 rounded-2xl bg-[hsl(174_72%_46%)] text-base md:text-lg font-semibold hover:opacity-90 transition-opacity text-center">Начать бесплатно</Link>
          <Link to="/register-organization" className="px-8 py-3 md:px-10 md:py-4 rounded-2xl border border-white/30 text-base md:text-lg font-semibold hover:bg-white/10 transition-colors text-center">Запросить демо</Link>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 justify-center text-white/40 text-sm">
          <span>support@sintagma.com.ru</span>
          <span>sintagma.com.ru</span>
        </div>
      </div>
    </Section>
  );
}
