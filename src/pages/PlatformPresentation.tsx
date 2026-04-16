import { useState, useCallback, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import {
  ArrowLeft, GraduationCap, Building2, Users, BookOpen, Brain, FileText,
  Video, Shield, ShoppingBag, Smartphone, Zap, CheckCircle2, BarChart3,
  Clock, Globe, Award, Lock, MessageSquare, ClipboardList, AlertTriangle,
  Layers, Database, RefreshCw, Play, Star, Target, Landmark, HardHat,
  Factory, Flame, Waves, Download, Copy, Check, ExternalLink,
  Settings, Headphones, Image, Sparkles
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Footer } from "@/components/landing/Footer";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { TypewriterText, InViewTypewriterText } from "@/components/ui/TypewriterText";
import { StarfieldCanvas } from "@/components/landing/StarfieldCanvas";

// AI-generated illustrations
import heroBg from "@/assets/presentation/hero-bg.jpg";
import aiBg from "@/assets/presentation/ai-assistant-bg.jpg";
import docsBg from "@/assets/presentation/documents-bg.jpg";
import safetyBg from "@/assets/presentation/safety-bg.jpg";
import mobileBg from "@/assets/presentation/mobile-bg.jpg";
import ctaBg from "@/assets/presentation/cta-bg.jpg";

// Platform screenshots
import screenshotMarketplace from "@/assets/presentation/screenshot-marketplace.png";
import screenshotCatalog from "@/assets/presentation/screenshot-catalog.png";

// Cabinet screenshots
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
  const [isExporting, setIsExporting] = useState(false);
  const [competitor, setCompetitor] = useState<Competitor>("getcourse");
  const [linkCopied, setLinkCopied] = useState(false);

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

      {/* ═══ HERO ═══ */}
      <Section className="relative text-white overflow-hidden bg-[#0a0e1a]">
        <img src={heroBg} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" width={1920} height={1080} />
        <StarfieldCanvas />
        <div className="relative max-w-7xl mx-auto px-4 md:px-8 py-20 md:py-32 text-center">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.7 }}>
            <div className="w-20 h-20 md:w-28 md:h-28 rounded-3xl bg-gradient-to-br from-[hsl(174_72%_46%)] to-[hsl(174_65%_30%)] flex items-center justify-center mx-auto mb-8 shadow-[0_0_60px_hsl(174_72%_46%/0.4)]">
              <GraduationCap className="w-10 h-10 md:w-16 md:h-16 text-white" />
            </div>
          </motion.div>
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
              { icon: Landmark, label: "ФИС ФРДО" },
            ].map(t => (
              <span key={t.label} className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/20 text-sm md:text-base text-white/70 backdrop-blur-sm bg-white/5">
                <t.icon className="w-4 h-4" />{t.label}
              </span>
            ))}
          </div>
        </div>
      </Section>

      {/* ═══ ПРОБЛЕМА ═══ */}
      <Section className="bg-[hsl(40_20%_98%)] dark:bg-[hsl(0_0%_8%)]">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-24">
          <h2 className="text-3xl md:text-5xl font-bold text-[hsl(0_0%_8%)] dark:text-white mb-3"><InViewTypewriterText text="Проблема" speed={60} delay={200} /></h2>
          <p className="text-base md:text-xl text-[hsl(0_0%_45%)] dark:text-white/60 mb-10">С чем сталкиваются образовательные организации каждый день</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
            {[
              { icon: FileText, title: "Бумажная работа", desc: "Договоры, протоколы, приказы — всё вручную", color: "hsl(0 72% 51%)" },
              { icon: Layers, title: "Разрозненные системы", desc: "Excel, мессенджеры, почта, диски — хаос", color: "hsl(38 92% 50%)" },
              { icon: AlertTriangle, title: "Нет контроля", desc: "Кто учится, кто завершил, кто просрочил — неизвестно", color: "hsl(262 80% 55%)" },
              { icon: Clock, title: "Потеря времени", desc: "До 70% рабочего времени — на администрирование", color: "hsl(210 80% 50%)" },
            ].map((p, i) => (
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

      {/* ═══ РЕШЕНИЕ ═══ */}
      <Section className="bg-gradient-to-br from-[hsl(174_72%_46%)] to-[hsl(174_60%_28%)] text-white">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-24 text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-4"><InViewTypewriterText text="Единая платформа" speed={50} delay={200} /></h2>
          <p className="text-base md:text-xl text-white/80 mb-12 max-w-3xl mx-auto">Всё для образовательной организации — от создания курсов до выгрузки в ФИС ФРДО</p>
          <div className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
            <div className="flex gap-4 md:gap-6 animate-marquee hover:[animation-play-state:paused] w-max">
              {[
                { icon: BookOpen, label: "Курсы и обучение" },
                { icon: FileText, label: "Документооборот" },
                { icon: Brain, label: "ИИ-ассистент" },
                { icon: Video, label: "Видеоидентификация" },
                { icon: Database, label: "ФИС ФРДО" },
                { icon: Shield, label: "Охрана труда" },
                { icon: BookOpen, label: "Курсы и обучение" },
                { icon: FileText, label: "Документооборот" },
                { icon: Brain, label: "ИИ-ассистент" },
                { icon: Video, label: "Видеоидентификация" },
                { icon: Database, label: "ФИС ФРДО" },
                { icon: Shield, label: "Охрана труда" },
              ].map((f, i) => (
                <div key={i} className="bg-white/15 backdrop-blur-sm rounded-2xl p-6 md:p-8 flex flex-col items-center gap-3 min-w-[160px] md:min-w-[200px] hover:scale-105 transition-transform">
                  <f.icon className="w-8 h-8 md:w-10 md:h-10" />
                  <span className="text-sm md:text-base font-medium whitespace-nowrap">{f.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ═══ LMS ═══ */}
      <Section className="bg-[hsl(40_20%_98%)] dark:bg-[hsl(0_0%_8%)]">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-24">
          <h2 className="text-3xl md:text-5xl font-bold text-[hsl(0_0%_8%)] dark:text-white mb-3"><InViewTypewriterText text="Управление курсами" speed={40} delay={200} /></h2>
          <p className="text-base md:text-xl text-[hsl(0_0%_45%)] dark:text-white/60 mb-10">Создавайте, импортируйте или генерируйте курсы с ИИ</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {[
              { icon: Play, title: "Видеолекции", desc: "Kinescope, загрузка видео, запрет перемотки" },
              { icon: ClipboardList, title: "Тесты", desc: "Банк вопросов, рандомизация, автопроверка" },
              { icon: Brain, title: "ИИ-генерация", desc: "Курс из темы за 5 минут — до 35 уроков" },
              { icon: FileText, title: "Материалы", desc: "Текст, HTML, файлы, вложения к урокам" },
              { icon: Award, title: "Сертификаты", desc: "Удостоверения, дипломы, свидетельства — авто" },
              { icon: Lock, title: "Гибкие настройки", desc: "Последовательность, проходной балл, доступ" },
            ].map((t, i) => (
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

      {/* ═══ ИИ-АССИСТЕНТ ═══ */}
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
                {[
                  { icon: Sparkles, text: "Генерация курсов из темы — до 35 уроков с контентом от 700 слов" },
                  { icon: ClipboardList, text: "Генерация тестов — 15 вопросов с вариантами ответов" },
                  { icon: Headphones, text: "Озвучка лекций (SaluteSpeech) — русский язык" },
                  { icon: Image, text: "Генерация обложек для курсов" },
                  { icon: MessageSquare, text: "ИИ-чат для учеников — отвечает по материалу курса" },
                ].map((t, i) => (
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

      {/* ═══ ДОКУМЕНТООБОРОТ ═══ */}
      <Section className="relative text-white overflow-hidden">
        <img src={docsBg} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" width={1920} height={1080} />
        <div className="absolute inset-0 bg-[hsl(0_0%_6%/0.8)]" />
        <div className="relative max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-24">
          <h2 className="text-3xl md:text-5xl font-bold mb-3"><InViewTypewriterText text="Документооборот" speed={50} delay={200} /></h2>
          <p className="text-base md:text-xl text-white/60 mb-10">Автоматическая генерация всех документов из шаблонов</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
            {[
              "Договор на обучение", "Приказ о зачислении", "Протокол проверки знаний",
              "Акт выполненных работ", "Удостоверение", "Согласие на обработку ПД",
              "Счёт на оплату", "Диплом о переподготовке", "Свидетельство о профессии",
            ].map((d, i) => (
              <div key={i} className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4 flex items-center gap-3">
                <FileText className="w-5 h-5 text-[hsl(174_72%_46%)] flex-shrink-0" />
                <span className="text-sm font-medium">{d}</span>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-white/40 text-center">Шаблоны DOCX → автозаполнение данными ученика, организации и компании</p>
        </div>
      </Section>

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

      {/* ═══ ОХРАНА ТРУДА ═══ */}
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
            {[
              { icon: Users, title: "Группы обучения", desc: "Формирование групп, назначение программ" },
              { icon: ClipboardList, title: "Протоколы", desc: "Автоформирование протоколов проверки знаний" },
              { icon: FileText, title: "Журналы", desc: "Электронные журналы всех видов инструктажей" },
              { icon: Award, title: "Удостоверения", desc: "Автоматическая генерация и печать" },
            ].map((item, i) => (
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

      {/* ═══ КАБИНЕТЫ ═══ */}
      <Section className="bg-[hsl(40_20%_98%)] dark:bg-[hsl(0_0%_8%)]">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-24">
          <h2 className="text-3xl md:text-5xl font-bold text-[hsl(0_0%_8%)] dark:text-white mb-3"><InViewTypewriterText text="Четыре кабинета" speed={50} delay={200} /></h2>
          <p className="text-base md:text-xl text-[hsl(0_0%_45%)] dark:text-white/60 mb-10">Отдельный интерфейс для каждой роли</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {[
              { icon: Building2, title: "Организация", color: "hsl(174 72% 46%)", screenshot: screenshotOrg, items: ["Курсы и обучение", "Ученики и группы", "Документооборот", "ФИС ФРДО", "Аналитика"] },
              { icon: GraduationCap, title: "Ученик", color: "hsl(262 80% 55%)", screenshot: screenshotStudent, items: ["Мои курсы", "Тесты и задания", "Достижения", "ИИ-помощник", "Документы"] },
              { icon: Building2, title: "Компания", color: "hsl(38 92% 50%)", screenshot: screenshotCompany, items: ["Сотрудники", "Назначение курсов", "Заявки на обучение", "Документы", "Контроль прогресса"] },
              { icon: Users, title: "Преподаватель", color: "hsl(200 80% 50%)", screenshot: screenshotTeacher, items: ["Проверка заданий", "Оценка тестов", "Ведение вебинаров", "Обратная связь", "Журнал успеваемости"] },
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

      {/* ═══ МАГАЗИН КУРСОВ ═══ */}
      <Section className="bg-gradient-to-br from-[hsl(174_72%_46%)] to-[hsl(174_60%_28%)] text-white">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-24">
          <h2 className="text-3xl md:text-5xl font-bold mb-3"><InViewTypewriterText text="300+ готовых курсов" speed={40} delay={200} /></h2>
          <p className="text-base md:text-xl text-white/80 mb-10">Программы по Ростехнадзору с актуальными тестами 2026 года</p>
          
          {/* Screenshots from the platform */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
            <div className="rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl">
              <img src={screenshotMarketplace} alt="Магазин курсов Синтагма — 303 курса по 14 направлениям" loading="lazy" className="w-full h-auto" />
            </div>
            <div className="rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl">
              <img src={screenshotCatalog} alt="Каталог курсов — охрана труда, пожарная безопасность, строительство" loading="lazy" className="w-full h-auto" />
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
                    <>
                      <tr key={`cat-${cat}`}>
                        <td colSpan={3} className="py-2 px-4 font-bold text-xs uppercase tracking-wider text-[hsl(0_0%_60%)] dark:text-white/40 bg-[hsl(0_0%_95%)] dark:bg-white/5">{cat}</td>
                      </tr>
                      {rows.map(row => (
                        <tr key={row.feature} className="border-b border-[hsl(40_15%_94%)] dark:border-white/5">
                          <td className="py-2.5 px-4 text-[hsl(0_0%_20%)] dark:text-white/80">{row.feature}</td>
                          <td className="py-2.5 px-4 text-center bg-[hsl(174_72%_46%/0.03)]"><StatusBadge value={row.sintagma} /></td>
                          <td className="py-2.5 px-4 text-center"><StatusBadge value={row[competitor]} /></td>
                        </tr>
                      ))}
                    </>
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
            {[
              { name: "Бесплатный", desc: "Для знакомства с платформой", price: "0", students: "10", courses: "3", storage: "100 МБ", features: ["Настройки курсов", "Магазин курсов", "Чек-лист документов", "Видеоидентификация", "Брендирование", "Документы для ЛОО", "Охрана труда", "ФИС ФРДО", "ИИ-генерация", "ИИ-озвучка"] },
              { name: "Старт", desc: "Для начинающих организаций", price: "4 490", students: "100", courses: "15", storage: "3 ГБ", features: ["Настройки курсов", "Магазин курсов", "Чек-лист документов", "Видеоидентификация", "Брендирование", "Документы для ЛОО", "Охрана труда", "ФИС ФРДО", "ИИ-генерация", "ИИ-озвучка"] },
              { name: "Стандарт", desc: "Для активных организаций", price: "6 990", students: "200", courses: "30", storage: "10 ГБ", popular: true, features: ["Настройки курсов", "Магазин курсов", "Чек-лист документов", "Видеоидентификация", "Брендирование", "Документы для ЛОО", "Охрана труда", "ФИС ФРДО", "ИИ-генерация", "ИИ-озвучка"] },
              { name: "Профессиональный", desc: "Для крупных организаций", price: "16 990", students: "1 000", courses: "50", storage: "50 ГБ", features: ["Настройки курсов", "Магазин курсов", "Чек-лист документов", "Видеоидентификация", "Брендирование", "Документы для ЛОО", "Охрана труда", "ФИС ФРДО+", "Вебинары", "Видеосервис+", "ИИ-генерация", "ИИ-озвучка"] },
              { name: "Максимальный", desc: "Полный доступ ко всем функциям", price: "24 990", students: "∞", courses: "∞", storage: "100 ГБ", features: ["Настройки курсов", "Магазин курсов", "Чек-лист документов", "Видеоидентификация", "Брендирование", "Документы для ЛОО", "Охрана труда", "ФИС ФРДО+", "Вебинары", "Видеосервис+", "3D-тренажёры", "ИИ-генерация", "ИИ-озвучка"] },
            ].map((p, i) => (
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

      {/* ═══ МОБИЛЬНОЕ ПРИЛОЖЕНИЕ ═══ */}
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
                {[
                  { icon: Globe, text: "PWA — работает как нативное приложение" },
                  { icon: Zap, text: "Оффлайн-режим — учёба без интернета" },
                  { icon: MessageSquare, text: "Push-уведомления" },
                  { icon: Smartphone, text: "Android и iOS" },
                ].map((t, i) => (
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

      {/* ═══ CTA ═══ */}
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
      <Footer />
    </div>
  );
}
