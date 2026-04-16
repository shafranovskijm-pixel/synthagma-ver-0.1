import React, { useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import {
  GraduationCap, Building2, Users, BookOpen, Brain, FileText,
  Smartphone, CheckCircle2, Landmark, HardHat,
  Factory, Flame, Waves, Download, Copy, Check, ExternalLink,
  Zap
} from "lucide-react";
import {
  problemCards, solutionMarquee, lmsFeatures, aiFeatures,
  documentTypes, safetyFeatures, mobileFeatures, pricingPlans,
} from "./presentationSections";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Footer } from "@/components/landing/Footer";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { TypewriterText, InViewTypewriterText } from "@/components/ui/TypewriterText";
import { StarfieldCanvas } from "@/components/landing/StarfieldCanvas";
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
import screenshotMarketplace from "@/assets/presentation/screenshot-marketplace.png";
import screenshotCatalog from "@/assets/presentation/screenshot-catalog.png";
import screenshotStudent from "@/assets/presentation/screenshot-student.png";
import screenshotOrg from "@/assets/presentation/screenshot-org.png";
import screenshotCompany from "@/assets/presentation/screenshot-company.png";
import screenshotTeacher from "@/assets/presentation/screenshot-teacher.png";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

const PRESENTATION_VERSION = "v3";

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

import { compData, type Status, type CompRow } from "./presentationData";

type Competitor = "getcourse" | "ispring" | "moodle";
const competitorLabels: Record<Competitor, string> = { getcourse: "GetCourse", ispring: "iSpring", moodle: "Moodle" };

function StatusBadge({ value }: { value: Status }) {
  if (value === "yes") return <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600">✅</span>;
  if (value === "no") return <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-500/15 text-red-600">❌</span>;
  if (value === "partial") return <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600">⚠️</span>;
  return <span className="text-xs font-medium">{value}</span>;
}

/* ─── PDF Logic ─── */
async function getCachedPdfUrl(): Promise<string | null> {
  try {
    const { data } = await supabase.storage.from("presentation-files").list("", { search: `${PRESENTATION_VERSION}_` });
    if (data && data.length > 0) {
      const { data: urlData } = supabase.storage.from("presentation-files").getPublicUrl(data[0].name);
      return urlData?.publicUrl ?? null;
    }
    return null;
  } catch { return null; }
}

/* ─── Main Component ─── */
export default function PlatformPresentation() {
  const navigate = useNavigate();
  const [isExporting, setIsExporting] = React.useState(false);
  const [competitor, setCompetitor] = React.useState<Competitor>("getcourse");
  const [linkCopied, setLinkCopied] = React.useState(false);

  const handleDownloadPDF = useCallback(async () => {
    setIsExporting(true);
    toast.info("Проверяем кеш...");
    const cachedUrl = await getCachedPdfUrl();
    if (cachedUrl) {
      toast.success("PDF готов!");
      window.open(cachedUrl, "_blank");
      setIsExporting(false);
      return;
    }
    toast.error("PDF ещё не сгенерирован. Обратитесь к администратору.");
    setIsExporting(false);
  }, []);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    toast.success("Ссылка скопирована!");
    setTimeout(() => setLinkCopied(false), 2000);
  }, []);

  const categories = [...new Set(compData.map(r => r.category))];

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
          <p className="text-base md:text-xl text-[hsl(0_0%_45%)] dark:text-white/60 mb-12 max-w-2xl mx-auto">Автоматическая выгрузка данных о выданных документах в федеральный реестр</p>
          <div className="flex flex-col md:flex-row gap-6 md:gap-8 justify-center max-w-4xl mx-auto">
            {[
              { step: "1", label: "Заполнение данных", desc: "Автоматически из карточки ученика" },
              { step: "2", label: "Формирование XML", desc: "По стандарту Рособрнадзора (ДПО/ПО)" },
              { step: "3", label: "Выгрузка в реестр", desc: "Один клик — данные в ФИС ФРДО" },
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
      <PresentationCabinets Section={Section} screenshots={{ org: screenshotOrg, student: screenshotStudent, company: screenshotCompany, teacher: screenshotTeacher }} />
      <PresentationMarketplace Section={Section} screenshots={{ marketplace: screenshotMarketplace, catalog: screenshotCatalog }} />

      {/* ═══ СРАВНЕНИЕ С КОНКУРЕНТАМИ ═══ */}
      <Section className="bg-[hsl(40_20%_98%)] dark:bg-[hsl(0_0%_8%)]">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-24">
          <h2 className="text-3xl md:text-5xl font-bold text-[hsl(0_0%_8%)] dark:text-white mb-3"><InViewTypewriterText text="Сравнение с конкурентами" speed={35} delay={200} /></h2>
          <p className="text-base md:text-xl text-[hsl(0_0%_45%)] dark:text-white/60 mb-8">Почему организации выбирают Синтагму</p>

          <div className="flex items-center gap-2 mb-6">
            {(["getcourse", "ispring", "moodle"] as Competitor[]).map(c => (
              <button key={c} onClick={() => setCompetitor(c)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${competitor === c
                  ? "bg-[hsl(174_72%_46%)] text-white"
                  : "bg-[hsl(0_0%_90%)] dark:bg-white/10 text-[hsl(0_0%_45%)] dark:text-white/60 hover:bg-[hsl(0_0%_85%)] dark:hover:bg-white/15"
                }`}>
                vs {competitorLabels[c]}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto -mx-4 md:mx-0">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-[hsl(40_15%_90%)] dark:border-white/10">
                  <th className="text-left py-3 px-4 font-semibold text-[hsl(0_0%_45%)] dark:text-white/60 w-[200px]">Критерий</th>
                  <th className="text-center py-3 px-4 font-semibold text-[hsl(174_72%_46%)] bg-[hsl(174_72%_46%/0.05)] w-[150px]">Синтагма</th>
                  <th className="text-center py-3 px-4 font-semibold text-[hsl(0_0%_45%)] dark:text-white/60 w-[150px]">{competitorLabels[competitor]}</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(cat => {
                  const rows = compData.filter(r => r.category === cat);
                  return (
                    <React.Fragment key={`cat-${cat}`}>
                      <tr>
                        <td colSpan={3} className="py-2 px-4 font-bold text-xs uppercase tracking-wider text-[hsl(0_0%_60%)] dark:text-white/40 bg-[hsl(0_0%_95%)] dark:bg-white/5">{cat}</td>
                      </tr>
                      {rows.map(row => (
                        <tr key={row.feature} className="border-b border-[hsl(40_15%_94%)] dark:border-white/5">
                          <td className="py-2.5 px-4 text-[hsl(0_0%_20%)] dark:text-white/80">{row.feature}</td>
                          <td className="py-2.5 px-4 text-center bg-[hsl(174_72%_46%/0.03)]"><StatusBadge value={row.sintagma} /></td>
                          <td className="py-2.5 px-4 text-center"><StatusBadge value={row[competitor]} /></td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* ═══ ТАРИФЫ ═══ */}
      <Section className="bg-[hsl(0_0%_6%)] text-white">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-24">
          <h2 className="text-3xl md:text-5xl font-bold mb-3 text-center"><InViewTypewriterText text="Тарифы" speed={60} delay={200} /></h2>
          <p className="text-base md:text-xl text-white/60 mb-10 text-center">Все функции доступны на каждом тарифе. Разница только в лимитах.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
            {pricingPlans.map((p, i) => (
              <div key={i} className={`rounded-2xl p-4 md:p-5 border flex flex-col relative ${p.popular ? "bg-[hsl(174_72%_46%/0.1)] border-[hsl(174_72%_46%)] ring-1 ring-[hsl(174_72%_46%/0.3)]" : "bg-white/5 border-white/10"}`}>
                {p.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-[hsl(174_72%_46%)] text-xs font-medium text-white whitespace-nowrap">Рекомендуем</span>}
                <h3 className="text-sm md:text-base font-bold mb-0.5">{p.name}</h3>
                <p className="text-[10px] text-white/40 mb-2">{p.desc}</p>
                <div className="mb-3">
                  <span className="text-xl md:text-2xl font-bold">{p.price}</span>
                  <span className="text-xs text-white/60">{p.price === "0" ? " ₽" : " ₽/мес"}</span>
                </div>
                <div className="space-y-1.5 text-xs text-white/70 mb-3">
                  <div className="font-semibold text-white/90">📚 {p.courses} Курсов</div>
                  <div className="font-semibold text-white/90">👥 {p.students} Учеников</div>
                </div>
                <div className="space-y-1 text-[11px] text-white/60 flex-1">
                  {p.features.map((f, j) => (
                    <div key={j} className="flex items-center gap-1.5">
                      <CheckCircle2 className={`w-3 h-3 flex-shrink-0 ${f.includes("ФРДО+") || f === "Видеосервис+" || f === "3D-тренажёры" ? "text-[hsl(38_92%_50%)]" : "text-[hsl(174_72%_46%/0.7)]"}`} />
                      <span className={f.includes("ФРДО+") || f === "Видеосервис+" || f === "3D-тренажёры" ? "text-[hsl(38_92%_50%)] font-semibold" : ""}>{f}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-white/10 text-center">
                  <span className="text-[10px] text-white/40">{p.price === "0" ? "Начать бесплатно" : "Подключить"}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-white/30 text-center mt-6">ФИС ФРДО+ — выгрузка данных в реестр выполняется нами за вас</p>
        </div>
      </Section>

      <PresentationMobile Section={Section} mobileBg={mobileBg} />
      <PresentationCTA Section={Section} ctaBg={ctaBg} />
      <Footer />
    </div>
  );
}
