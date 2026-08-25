import React, { useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import { Landmark, Zap } from "lucide-react";
import { Footer } from "@/components/landing/Footer";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { InViewTypewriterText } from "@/components/ui/TypewriterText";
import {
  PresentationHero,
  PresentationProblem,
  PresentationSolution,
  PresentationLMS,
  PresentationAI,
  PresentationDocuments,
  
  PresentationSafety,
  PresentationCabinets,
  PresentationMarketplace,
  PresentationMobile,
  PresentationCTA,
} from "./presentationBlocks";

import heroBg from "@/assets/presentation/hero-bg.jpg";
import aiBg from "@/assets/presentation/ai-assistant-bg.jpg";
import docsBg from "@/assets/presentation/documents-bg.jpg";
import safetyBg from "@/assets/presentation/safety-bg.jpg";
import mobileBg from "@/assets/presentation/mobile-bg.jpg";
import ctaBg from "@/assets/presentation/cta-bg.jpg";
import screenshotStudent from "@/assets/presentation/screenshot-student.png";
import screenshotOrg from "@/assets/presentation/screenshot-org.png";

/* ─── Animated Section Wrapper ─── */
function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

/* ─── Main Component ─── */
export default function PlatformPresentation() {
  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />

      <PresentationHero Section={Section} heroBg={heroBg} />




      <PresentationProblem Section={Section} />
      <PresentationSolution Section={Section} />
      <PresentationLMS Section={Section} />
      <PresentationAI Section={Section} aiBg={aiBg} />
      <PresentationDocuments Section={Section} docsBg={docsBg} />

      {/* ═══ ФИС ФРДО ═══ */}
      <Section className="bg-[hsl(40_20%_98%)] dark:bg-[hsl(0_0%_10%)]">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-24 text-center">
          <Landmark className="w-12 h-12 text-[hsl(174_72%_46%)] mx-auto mb-6" />
          <h2 className="text-3xl md:text-5xl font-bold text-[hsl(0_0%_8%)] dark:text-white mb-3"><InViewTypewriterText text="ФИС ФРДО" speed={60} delay={200} /></h2>
          <p className="text-base md:text-xl text-[hsl(0_0%_45%)] dark:text-white/60 mb-12 max-w-2xl mx-auto">Проверка и подготовка данных и файла для передачи сведений в федеральный реестр</p>
          <div className="flex flex-col md:flex-row gap-6 md:gap-8 justify-center max-w-4xl mx-auto">
            {[
              { step: "1", label: "Заполнение данных", desc: "Из карточки ученика и данных группы" },
              { step: "2", label: "Проверка и подготовка файла", desc: "Показываем ошибки и несоответствия до отправки" },
              { step: "3", label: "Передача сведений", desc: "Ответственный сотрудник загружает файл. ФРДО+ предоставляется по отдельному согласованию" },
            ].map((s, i) => (

              <div key={i} className="flex flex-col items-center flex-1">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-[hsl(174_72%_46%)] text-white flex items-center justify-center text-xl md:text-2xl font-bold mb-4 shadow-[0_0_30px_hsl(174_72%_46%/0.3)]">{s.step}</div>
                <h3 className="text-base md:text-lg font-semibold text-[hsl(0_0%_8%)] dark:text-white mb-1">{s.label}</h3>
                <p className="text-sm text-[hsl(0_0%_45%)] dark:text-white/60">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <PresentationSafety Section={Section} safetyBg={safetyBg} />
      <PresentationCabinets Section={Section} screenshots={{ org: screenshotOrg, student: screenshotStudent }} />
      <PresentationMarketplace Section={Section} />

      {/* ═══ EMAIL-РАССЫЛКИ ═══ */}
      <Section className="bg-white dark:bg-[hsl(0_0%_10%)]">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-24">
          <h2 className="text-3xl md:text-5xl font-bold text-[hsl(0_0%_8%)] dark:text-white mb-3">
            <InViewTypewriterText text="Email-рассылки" speed={45} delay={200} />
          </h2>
          <p className="text-base md:text-xl text-[hsl(0_0%_45%)] dark:text-white/60 mb-10 max-w-3xl">
            Пишете клиентам и ученикам со своего почтового ящика: подключение по SMTP/IMAP, импорт контактов,
            переменные в письме, тестовая отправка и отчёт по кампании с публичной ссылкой.
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { title: "Свой ящик по SMTP/IMAP", desc: "Подключаете корпоративную почту, отправка идёт от вашего домена" },
              { title: "Импорт контактов", desc: "Загрузка списка из файла, дедупликация и отписки" },
              { title: "Переменные в письме", desc: "Имя, организация, курс и другие поля подставляются автоматически" },
              { title: "Тестовая отправка", desc: "Проверяете письмо на себе до запуска кампании" },
              { title: "Отчёт по кампании", desc: "Отправлено, ошибки, статусы по каждому адресу" },
              { title: "Публичная ссылка на отчёт", desc: "Делитесь результатом с коллегами без доступа в кабинет" },
            ].map((f) => (
              <li key={f.title} className="rounded-2xl border border-[hsl(40_15%_90%)] dark:border-white/10 p-5 bg-[hsl(40_20%_98%)] dark:bg-white/5">
                <div className="flex items-start gap-2">
                  <Zap className="w-4 h-4 mt-1 flex-shrink-0 text-[hsl(174_72%_46%)]" aria-hidden="true" />
                  <div>
                    <h3 className="text-base font-semibold text-[hsl(0_0%_8%)] dark:text-white mb-1">{f.title}</h3>
                    <p className="text-sm text-[hsl(0_0%_45%)] dark:text-white/60">{f.desc}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-[hsl(0_0%_55%)] dark:text-white/40 mt-6 max-w-3xl">
            Доставка зависит от настроек вашего домена и политики принимающей почты — гарантировать доставку каждого письма невозможно.
          </p>
        </div>
      </Section>

      {/* ═══ ТАРИФЫ ═══ */}
      <Section className="bg-[hsl(0_0%_6%)] text-white">
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-16 md:py-24 text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-3"><InViewTypewriterText text="Тарифы и лимиты" speed={60} delay={200} /></h2>
          <p className="text-base md:text-xl text-white/60 mb-8">
            Актуальные цены, лимиты и состав функций опубликованы на главной странице.
          </p>
          <Link
            to="/features#pricing"
            className="inline-flex px-6 py-3 rounded-2xl bg-[hsl(174_72%_46%)] text-sm font-semibold text-white hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Посмотреть актуальные тарифы
          </Link>
        </div>
      </Section>



      <PresentationMobile Section={Section} mobileBg={mobileBg} />
      <PresentationCTA Section={Section} ctaBg={ctaBg} />
      <Footer />
    </div>
  );
}
