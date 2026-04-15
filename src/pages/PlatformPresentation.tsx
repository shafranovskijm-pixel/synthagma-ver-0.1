import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Maximize, Minimize, X,
  GraduationCap, Building2, Users, BookOpen, Brain, FileText,
  Video, Shield, ShoppingBag, Palette, Smartphone, Zap,
  CheckCircle2, BarChart3, Clock, Globe, Award, Lock,
  Settings, MessageSquare, ClipboardList, AlertTriangle,
  Layers, Database, RefreshCw, ChevronDown, Play, Star,
  Target, TrendingUp, Landmark, HardHat, Factory, Flame, Waves,
  Download, Loader2
} from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";

const TOTAL_SLIDES = 19;
const CACHED_PDF_PATH = "sintagma-presentation.pdf";
const PRESENTATION_VERSION = "v2"; // bump this when slides change

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 400 : -400, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -400 : 400, opacity: 0 }),
};

/* ─── Individual Slide Components ─── */

function SlideTitlePage() {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-[hsl(0_0%_8%)] to-[hsl(0_0%_18%)] text-white px-6 md:px-20">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.8 }}>
        <div className="w-16 h-16 md:w-28 md:h-28 rounded-2xl md:rounded-3xl bg-gradient-to-br from-[hsl(174_72%_46%)] to-[hsl(174_65%_35%)] flex items-center justify-center mb-6 md:mb-10 mx-auto">
          <GraduationCap className="w-8 h-8 md:w-16 md:h-16 text-white" />
        </div>
      </motion.div>
      <h1 className="text-4xl md:text-[96px] font-bold tracking-tight mb-3 md:mb-6 bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">СИНТАГМА</h1>
      <p className="text-lg md:text-[32px] text-white/60 font-light text-center">Платформа для образовательных организаций</p>
      <div className="mt-8 md:mt-16 flex flex-wrap justify-center gap-3 md:gap-8">
        {["LMS", "Документооборот", "ИИ-ассистент", "ФИС ФРДО"].map(t => (
          <span key={t} className="px-4 py-2 md:px-6 md:py-3 rounded-full border border-white/20 text-sm md:text-[20px] text-white/70">{t}</span>
        ))}
      </div>
    </div>
  );
}

function SlideProblem() {
  const problems = [
    { icon: FileText, title: "Бумажная работа", desc: "Договоры, протоколы, приказы — вручную" },
    { icon: Layers, title: "Разрозненные системы", desc: "Excel, мессенджеры, почта, диски" },
    { icon: AlertTriangle, title: "Нет контроля", desc: "Кто учится, кто завершил, кто просрочил" },
    { icon: Clock, title: "Потеря времени", desc: "До 70% времени — на администрирование" },
  ];
  return (
    <div className="flex flex-col h-full bg-[hsl(40_20%_98%)] px-6 md:px-24 py-8 md:py-20">
      <h2 className="text-3xl md:text-[56px] font-bold text-[hsl(0_0%_8%)] mb-2 md:mb-4">Проблема</h2>
      <p className="text-base md:text-[28px] text-[hsl(0_0%_45%)] mb-6 md:mb-16">С чем сталкиваются образовательные организации каждый день</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-10 flex-1">
        {problems.map((p, i) => (
          <motion.div key={i} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.15 }}
            className="bg-white rounded-2xl p-5 md:p-10 border border-[hsl(40_15%_90%)] shadow-lg flex items-start gap-4 md:gap-6">
            <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-[hsl(0_72%_51%/0.1)] flex items-center justify-center flex-shrink-0">
              <p.icon className="w-6 h-6 md:w-8 md:h-8 text-[hsl(0_72%_51%)]" />
            </div>
            <div>
              <h3 className="text-lg md:text-[28px] font-semibold text-[hsl(0_0%_8%)] mb-1 md:mb-2">{p.title}</h3>
              <p className="text-sm md:text-[22px] text-[hsl(0_0%_45%)]">{p.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function SlideSolution() {
  const features = [
    { icon: BookOpen, label: "Курсы и обучение" },
    { icon: FileText, label: "Документооборот" },
    { icon: Brain, label: "ИИ-ассистент" },
    { icon: Video, label: "Видеоидентификация" },
    { icon: Database, label: "ФИС ФРДО" },
    { icon: Shield, label: "Охрана труда" },
  ];
  return (
    <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-[hsl(174_72%_46%)] to-[hsl(174_65%_30%)] text-white px-6 md:px-24 py-8 md:py-20">
      <h2 className="text-3xl md:text-[56px] font-bold mb-3 md:mb-6">Единая платформа</h2>
      <p className="text-base md:text-[28px] text-white/80 mb-8 md:mb-16 text-center max-w-[1200px]">Всё для образовательной организации — от создания курсов до выгрузки в ФИС ФРДО</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-8">
        {features.map((f, i) => (
          <motion.div key={i} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.1 }}
            className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 md:p-8 flex flex-col items-center gap-2 md:gap-4 md:w-[340px]">
            <f.icon className="w-8 h-8 md:w-12 md:h-12" />
            <span className="text-sm md:text-[24px] font-medium text-center">{f.label}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function SlideOrgInterface() {
  const sections = [
    { icon: BookOpen, label: "Курсы", value: "24", color: "hsl(174 72% 46%)" },
    { icon: Users, label: "Ученики", value: "1 247", color: "hsl(38 92% 50%)" },
    { icon: FileText, label: "Документы", value: "856", color: "hsl(262 80% 55%)" },
    { icon: BarChart3, label: "Завершено", value: "89%", color: "hsl(142 70% 45%)" },
  ];
  return (
    <div className="flex flex-col h-full bg-[hsl(40_20%_98%)] px-6 md:px-24 py-8 md:py-20">
      <div className="flex items-center gap-3 md:gap-4 mb-2 md:mb-4">
        <Building2 className="w-7 h-7 md:w-10 md:h-10 text-[hsl(174_72%_46%)]" />
        <h2 className="text-2xl md:text-[48px] font-bold text-[hsl(0_0%_8%)]">Интерфейс организации</h2>
      </div>
      <p className="text-sm md:text-[24px] text-[hsl(0_0%_45%)] mb-6 md:mb-12">Полный контроль над обучением и документооборотом</p>
      <div className="flex-1 bg-white rounded-2xl md:rounded-3xl border border-[hsl(40_15%_90%)] shadow-xl overflow-hidden">
        <div className="h-10 md:h-14 bg-[hsl(0_0%_8%)] flex items-center px-4 md:px-6 gap-2 md:gap-3">
          <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-red-400" /><div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-yellow-400" /><div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-green-400" />
          <span className="text-white/60 ml-3 text-xs md:text-[16px]">СИНТАГМА — Панель управления</span>
        </div>
        <div className="p-4 md:p-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 mb-4 md:mb-8">
            {sections.map((s, i) => (
              <div key={i} className="rounded-2xl border border-[hsl(40_15%_90%)] p-3 md:p-6">
                <div className="flex items-center gap-2 md:gap-3 mb-1 md:mb-3">
                  <s.icon className="w-4 h-4 md:w-6 md:h-6" style={{ color: s.color }} />
                  <span className="text-xs md:text-[18px] text-[hsl(0_0%_45%)]">{s.label}</span>
                </div>
                <span className="text-xl md:text-[36px] font-bold text-[hsl(0_0%_8%)]">{s.value}</span>
              </div>
            ))}
          </div>
          <div className="hidden md:grid grid-cols-3 gap-6">
            {["Управление курсами", "Список учеников", "Генерация документов"].map((t, i) => (
              <div key={i} className="h-[200px] rounded-2xl bg-[hsl(40_15%_96%)] border border-[hsl(40_15%_90%)] p-6 flex flex-col">
                <span className="text-[20px] font-semibold text-[hsl(0_0%_8%)] mb-3">{t}</span>
                <div className="flex-1 space-y-2">
                  {[1,2,3].map(j => <div key={j} className="h-6 rounded bg-[hsl(40_15%_92%)]" style={{ width: `${90 - j * 15}%` }} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SlideCourseManagement() {
  const types = [
    { icon: Play, label: "Видеолекции", desc: "Загрузка видео, запрет перемотки" },
    { icon: FileText, label: "Текст и HTML", desc: "Полный редактор контента" },
    { icon: ClipboardList, label: "Тесты", desc: "Автопроверка, рандомизация" },
    { icon: Brain, label: "ИИ-генерация", desc: "Курс за 5 минут из темы" },
  ];
  return (
    <div className="flex flex-col h-full bg-[hsl(40_20%_98%)] px-6 md:px-24 py-8 md:py-20">
      <h2 className="text-2xl md:text-[48px] font-bold text-[hsl(0_0%_8%)] mb-2 md:mb-4">Управление курсами</h2>
      <p className="text-sm md:text-[24px] text-[hsl(0_0%_45%)] mb-6 md:mb-12">Создавайте, импортируйте или генерируйте курсы с ИИ</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 flex-1">
        {types.map((t, i) => (
          <motion.div key={i} initial={{ x: i % 2 === 0 ? -30 : 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.12 }}
            className="bg-white rounded-2xl border border-[hsl(40_15%_90%)] p-5 md:p-10 shadow-md flex items-start gap-4 md:gap-6">
            <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-[hsl(174_72%_46%/0.1)] flex items-center justify-center flex-shrink-0">
              <t.icon className="w-6 h-6 md:w-8 md:h-8 text-[hsl(174_72%_46%)]" />
            </div>
            <div>
              <h3 className="text-lg md:text-[28px] font-semibold text-[hsl(0_0%_8%)] mb-1 md:mb-2">{t.label}</h3>
              <p className="text-sm md:text-[22px] text-[hsl(0_0%_45%)]">{t.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
      <div className="mt-4 md:mt-8 flex flex-wrap gap-3 md:gap-6">
        {["Импорт из файлов", "Копирование курсов", "Шаблоны"].map(t => (
          <span key={t} className="px-4 py-1.5 md:px-5 md:py-2 rounded-full bg-[hsl(174_72%_46%/0.1)] text-[hsl(174_72%_46%)] text-sm md:text-[18px] font-medium">{t}</span>
        ))}
      </div>
    </div>
  );
}

function SlideCourseSettings() {
  const settings = [
    { icon: Lock, label: "Запрет перемотки видео", desc: "Ученик не может перемотать — смотрит до конца" },
    { icon: Layers, label: "Последовательные уроки", desc: "Доступ к следующему только после прохождения" },
    { icon: Video, label: "Видеоидентификация", desc: "Проверка личности по 273-ФЗ" },
    { icon: Settings, label: "Проходной балл тестов", desc: "Настройка % для успешного прохождения" },
    { icon: RefreshCw, label: "Рандомизация вопросов", desc: "Случайная выборка из банка вопросов" },
    { icon: FileText, label: "Сбор документов", desc: "Чек-лист: паспорт, СНИЛС, диплом" },
  ];
  return (
    <div className="flex flex-col h-full bg-[hsl(0_0%_8%)] text-white px-6 md:px-24 py-8 md:py-20">
      <h2 className="text-2xl md:text-[48px] font-bold mb-2 md:mb-4">Настройки курсов</h2>
      <p className="text-sm md:text-[24px] text-white/60 mb-6 md:mb-12">Гибкая настройка для любых требований</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6 flex-1">
        {settings.map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.1 }}
            className="flex items-start gap-4 md:gap-5 bg-white/5 rounded-xl p-4 md:p-6 border border-white/10">
            <s.icon className="w-6 h-6 md:w-7 md:h-7 text-[hsl(174_72%_46%)] flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-base md:text-[22px] font-semibold mb-0.5 md:mb-1">{s.label}</h3>
              <p className="text-xs md:text-[18px] text-white/50">{s.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function SlideStudentInterface() {
  return (
    <div className="flex flex-col h-full bg-[hsl(40_20%_98%)] px-6 md:px-24 py-8 md:py-20">
      <div className="flex items-center gap-3 md:gap-4 mb-2 md:mb-4">
        <GraduationCap className="w-7 h-7 md:w-10 md:h-10 text-[hsl(174_72%_46%)]" />
        <h2 className="text-2xl md:text-[48px] font-bold text-[hsl(0_0%_8%)]">Интерфейс ученика</h2>
      </div>
      <p className="text-sm md:text-[24px] text-[hsl(0_0%_45%)] mb-6 md:mb-12">Простой и понятный — ничего лишнего</p>
      <div className="flex-1 bg-white rounded-2xl md:rounded-3xl border border-[hsl(40_15%_90%)] shadow-xl overflow-hidden">
        <div className="h-10 md:h-14 bg-[hsl(0_0%_8%)] flex items-center px-4 md:px-6 gap-2 md:gap-3">
          <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-red-400" /><div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-yellow-400" /><div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-green-400" />
          <span className="text-white/60 ml-3 text-xs md:text-[16px]">Мои курсы</span>
        </div>
        <div className="p-4 md:p-8 flex flex-col md:flex-row gap-4 md:gap-8">
          <div className="flex-1 space-y-3 md:space-y-4">
            <h3 className="text-base md:text-[22px] font-semibold text-[hsl(0_0%_8%)]">Назначенные курсы</h3>
            {[
              { name: "Охрана труда", progress: 85 },
              { name: "Электробезопасность", progress: 40 },
              { name: "Пожарная безопасность", progress: 0 },
            ].map((c, i) => (
              <div key={i} className="rounded-xl border border-[hsl(40_15%_90%)] p-3 md:p-5">
                <div className="flex justify-between mb-1 md:mb-2">
                  <span className="text-sm md:text-[18px] font-medium text-[hsl(0_0%_8%)]">{c.name}</span>
                  <span className="text-xs md:text-[16px] text-[hsl(0_0%_45%)]">{c.progress}%</span>
                </div>
                <div className="h-1.5 md:h-2 bg-[hsl(40_15%_92%)] rounded-full">
                  <div className="h-1.5 md:h-2 bg-[hsl(174_72%_46%)] rounded-full" style={{ width: `${c.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block w-[380px] space-y-4">
            <h3 className="text-[22px] font-semibold text-[hsl(0_0%_8%)]">Достижения</h3>
            <div className="grid grid-cols-3 gap-3">
              {["🏆", "⭐", "🎯", "📚", "🔥", "💎"].map((e, i) => (
                <div key={i} className="h-20 rounded-xl bg-[hsl(40_15%_96%)] flex items-center justify-center text-[32px]">{e}</div>
              ))}
            </div>
            <div className="rounded-xl border border-[hsl(40_15%_90%)] p-4 bg-[hsl(174_72%_46%/0.05)]">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-5 h-5 text-[hsl(174_72%_46%)]" />
                <span className="text-[16px] font-medium text-[hsl(0_0%_8%)]">ИИ-помощник</span>
              </div>
              <p className="text-[14px] text-[hsl(0_0%_45%)]">Задайте вопрос по материалу курса...</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlideAIAssistant() {
  return (
    <div className="flex flex-col md:flex-row h-full bg-gradient-to-br from-[hsl(262_80%_20%)] to-[hsl(262_60%_35%)] text-white px-6 md:px-24 py-8 md:py-20">
      <div className="flex-1 flex flex-col justify-center md:pr-16 mb-6 md:mb-0">
        <Brain className="w-10 h-10 md:w-16 md:h-16 mb-4 md:mb-8 text-[hsl(262_80%_70%)]" />
        <h2 className="text-3xl md:text-[56px] font-bold mb-3 md:mb-6">ИИ-ассистент</h2>
        <p className="text-base md:text-[26px] text-white/70 mb-6 md:mb-10">Персональный консультант для каждого ученика</p>
        <div className="space-y-3 md:space-y-5">
          {[
            "Отвечает на вопросы по материалу курса",
            "Генерирует курсы из темы за 5 минут",
            "Озвучивает текстовые лекции",
            "Помогает с тестами и заданиями",
          ].map((t, i) => (
            <motion.div key={i} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.15 }}
              className="flex items-center gap-3 md:gap-4">
              <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-[hsl(174_72%_46%)] flex-shrink-0" />
              <span className="text-sm md:text-[22px]">{t}</span>
            </motion.div>
          ))}
        </div>
      </div>
      <div className="hidden md:flex w-[500px] items-center">
        <div className="w-full bg-white/10 backdrop-blur rounded-2xl p-6 border border-white/20">
          <div className="space-y-4">
            <div className="flex justify-end"><div className="bg-[hsl(174_72%_46%)] rounded-2xl rounded-tr-sm px-5 py-3 text-[16px] max-w-[80%]">Объясни правила электробезопасности для группы III</div></div>
            <div className="flex justify-start"><div className="bg-white/10 rounded-2xl rounded-tl-sm px-5 py-3 text-[16px] max-w-[90%] text-white/90">Для получения III группы по электробезопасности необходимо знать: устройство электроустановок, порядок обслуживания, правила оказания первой помощи...</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlideCompanyInterface() {
  return (
    <div className="flex flex-col h-full bg-[hsl(40_20%_98%)] px-6 md:px-24 py-8 md:py-20">
      <div className="flex items-center gap-3 md:gap-4 mb-2 md:mb-4">
        <Building2 className="w-7 h-7 md:w-10 md:h-10 text-[hsl(38_92%_50%)]" />
        <h2 className="text-2xl md:text-[48px] font-bold text-[hsl(0_0%_8%)]">Интерфейс компании</h2>
      </div>
      <p className="text-sm md:text-[24px] text-[hsl(0_0%_45%)] mb-6 md:mb-12">Для заказчиков обучения — контроль сотрудников</p>
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8">
        {[
          { icon: Users, title: "Сотрудники", items: ["Список сотрудников", "Назначение курсов", "Контроль прогресса"] },
          { icon: ClipboardList, title: "Заявки", items: ["Заявки на обучение", "Планы по датам", "История обучения"] },
          { icon: FileText, title: "Документы", items: ["Договоры", "Акты", "Счета и оплаты"] },
        ].map((s, i) => (
          <motion.div key={i} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.15 }}
            className="bg-white rounded-2xl border border-[hsl(40_15%_90%)] p-5 md:p-8 shadow-md">
            <div className="w-10 h-10 md:w-14 md:h-14 rounded-2xl bg-[hsl(38_92%_50%/0.1)] flex items-center justify-center mb-4 md:mb-6">
              <s.icon className="w-5 h-5 md:w-7 md:h-7 text-[hsl(38_92%_50%)]" />
            </div>
            <h3 className="text-lg md:text-[26px] font-semibold text-[hsl(0_0%_8%)] mb-3 md:mb-4">{s.title}</h3>
            <ul className="space-y-2 md:space-y-3">
              {s.items.map((item, j) => (
                <li key={j} className="flex items-center gap-2 md:gap-3 text-sm md:text-[20px] text-[hsl(0_0%_45%)]">
                  <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 text-[hsl(142_70%_45%)]" />
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function SlideDocuments() {
  const docs = [
    { icon: FileText, name: "Договор на обучение", auto: true },
    { icon: FileText, name: "Приказ о зачислении", auto: true },
    { icon: FileText, name: "Протокол проверки знаний", auto: true },
    { icon: FileText, name: "Акт выполненных работ", auto: true },
    { icon: Award, name: "Удостоверение", auto: true },
    { icon: FileText, name: "Согласие на обработку ПД", auto: true },
  ];
  return (
    <div className="flex flex-col h-full bg-[hsl(0_0%_8%)] text-white px-6 md:px-24 py-8 md:py-20">
      <h2 className="text-2xl md:text-[48px] font-bold mb-2 md:mb-4">Документооборот</h2>
      <p className="text-sm md:text-[24px] text-white/60 mb-6 md:mb-12">Автоматическая генерация всех документов</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6 flex-1">
        {docs.map((d, i) => (
          <motion.div key={i} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.1 }}
            className="bg-white/5 rounded-xl border border-white/10 p-4 md:p-6 flex items-start gap-3 md:gap-4">
            <d.icon className="w-6 h-6 md:w-8 md:h-8 text-[hsl(174_72%_46%)] flex-shrink-0" />
            <div>
              <h3 className="text-sm md:text-[20px] font-medium mb-1 md:mb-2">{d.name}</h3>
              {d.auto && <span className="text-[11px] md:text-[14px] px-2 md:px-3 py-0.5 md:py-1 rounded-full bg-[hsl(174_72%_46%/0.2)] text-[hsl(174_72%_46%)]">Авто</span>}
            </div>
          </motion.div>
        ))}
      </div>
      <p className="mt-4 md:mt-8 text-sm md:text-[22px] text-white/50 text-center">Шаблоны DOCX → автозаполнение данными ученика и организации</p>
    </div>
  );
}

function SlideDocChecklist() {
  const items = ["Паспорт (главная + прописка)", "СНИЛС", "Диплом об образовании", "Фото 3×4", "Заявление", "Согласие на обработку ПД"];
  return (
    <div className="flex flex-col md:flex-row h-full bg-[hsl(40_20%_98%)] px-6 md:px-24 py-8 md:py-20">
      <div className="flex-1 flex flex-col justify-center md:pr-16 mb-6 md:mb-0">
        <ClipboardList className="w-10 h-10 md:w-14 md:h-14 mb-4 md:mb-6 text-[hsl(174_72%_46%)]" />
        <h2 className="text-2xl md:text-[48px] font-bold text-[hsl(0_0%_8%)] mb-2 md:mb-4">Чек-лист документов</h2>
        <p className="text-sm md:text-[24px] text-[hsl(0_0%_45%)] mb-6 md:mb-10">Автоматический сбор документов от учеников</p>
        <div className="space-y-3 md:space-y-4">
          {items.map((item, i) => (
            <motion.div key={i} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.1 }}
              className="flex items-center gap-3 md:gap-4">
              <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-[hsl(142_70%_45%)]" />
              <span className="text-sm md:text-[22px] text-[hsl(0_0%_8%)]">{item}</span>
            </motion.div>
          ))}
        </div>
      </div>
      <div className="hidden md:flex w-[500px] items-center">
        <div className="bg-white rounded-2xl border border-[hsl(40_15%_90%)] shadow-xl p-8 w-full">
          <h3 className="text-[22px] font-semibold text-[hsl(0_0%_8%)] mb-6">Статус сбора</h3>
          {[
            { name: "Иванов И.И.", done: 6, total: 6 },
            { name: "Петров П.П.", done: 4, total: 6 },
            { name: "Сидорова А.В.", done: 1, total: 6 },
          ].map((s, i) => (
            <div key={i} className="mb-4">
              <div className="flex justify-between text-[16px] mb-1">
                <span className="text-[hsl(0_0%_8%)]">{s.name}</span>
                <span className="text-[hsl(0_0%_45%)]">{s.done}/{s.total}</span>
              </div>
              <div className="h-2 bg-[hsl(40_15%_92%)] rounded-full">
                <div className="h-2 rounded-full" style={{ width: `${(s.done / s.total) * 100}%`, background: s.done === s.total ? "hsl(142 70% 45%)" : "hsl(38 92% 50%)" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SlideVideoId() {
  return (
    <div className="flex flex-col md:flex-row h-full bg-gradient-to-br from-[hsl(0_0%_8%)] to-[hsl(0_0%_15%)] text-white px-6 md:px-24 py-8 md:py-20">
      <div className="flex-1 flex flex-col justify-center md:pr-16 mb-6 md:mb-0">
        <Video className="w-10 h-10 md:w-14 md:h-14 mb-4 md:mb-6 text-[hsl(174_72%_46%)]" />
        <h2 className="text-2xl md:text-[48px] font-bold mb-2 md:mb-4">Видеоидентификация</h2>
        <p className="text-sm md:text-[24px] text-white/60 mb-6 md:mb-10">Верификация личности ученика по 273-ФЗ</p>
        <div className="space-y-3 md:space-y-5">
          {[
            "Запись видео с веб-камеры",
            "Автоматическое сравнение с фото",
            "Журнал верификаций",
            "Соответствие требованиям законодательства",
          ].map((t, i) => (
            <div key={i} className="flex items-center gap-3 md:gap-4">
              <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-[hsl(174_72%_46%)]" />
              <span className="text-sm md:text-[22px]">{t}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden md:flex w-[480px] items-center justify-center">
        <div className="w-[360px] h-[360px] rounded-full border-4 border-[hsl(174_72%_46%/0.3)] flex items-center justify-center relative">
          <div className="w-[300px] h-[300px] rounded-full bg-[hsl(174_72%_46%/0.1)] flex items-center justify-center">
            <Video className="w-24 h-24 text-[hsl(174_72%_46%/0.5)]" />
          </div>
          <motion.div className="absolute inset-0 rounded-full border-2 border-[hsl(174_72%_46%)]" 
            animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0, 0.5] }} transition={{ repeat: Infinity, duration: 2 }}
          />
        </div>
      </div>
    </div>
  );
}

function SlideFRDO() {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-[hsl(40_20%_98%)] px-6 md:px-24 py-8 md:py-20">
      <Landmark className="w-10 h-10 md:w-16 md:h-16 text-[hsl(174_72%_46%)] mb-4 md:mb-8" />
      <h2 className="text-3xl md:text-[56px] font-bold text-[hsl(0_0%_8%)] mb-2 md:mb-4">ФИС ФРДО</h2>
      <p className="text-base md:text-[26px] text-[hsl(0_0%_45%)] mb-8 md:mb-16 text-center max-w-[900px]">Автоматическая выгрузка данных о выданных документах в федеральный реестр</p>
      <div className="flex flex-col md:flex-row gap-6 md:gap-8">
        {[
          { step: "1", label: "Заполнение данных", desc: "Автоматически из карточки ученика" },
          { step: "2", label: "Формирование XML", desc: "По стандарту Рособрнадзора" },
          { step: "3", label: "Выгрузка", desc: "Один клик — все данные в реестре" },
        ].map((s, i) => (
          <motion.div key={i} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.2 }}
            className="flex flex-col items-center md:w-[320px]">
            <div className="w-14 h-14 md:w-20 md:h-20 rounded-full bg-[hsl(174_72%_46%)] text-white flex items-center justify-center text-2xl md:text-[36px] font-bold mb-3 md:mb-6">{s.step}</div>
            <h3 className="text-lg md:text-[24px] font-semibold text-[hsl(0_0%_8%)] mb-1 md:mb-2">{s.label}</h3>
            <p className="text-sm md:text-[20px] text-[hsl(0_0%_45%)] text-center">{s.desc}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function SlideLaborSafety() {
  return (
    <div className="flex flex-col h-full bg-[hsl(0_0%_8%)] px-6 md:px-24 py-8 md:py-20">
      <div className="flex items-center gap-3 md:gap-4 mb-2 md:mb-4">
        <HardHat className="w-7 h-7 md:w-10 md:h-10 text-[hsl(38_92%_50%)]" />
        <h2 className="text-2xl md:text-[48px] font-bold text-white">Охрана труда</h2>
      </div>
      <p className="text-sm md:text-[24px] text-white/60 mb-6 md:mb-12">Полный модуль для обучения по охране труда</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 flex-1">
        {[
          { icon: Users, title: "Группы обучения", desc: "Формирование групп, назначение программ" },
          { icon: ClipboardList, title: "Протоколы", desc: "Автоформирование протоколов проверки знаний" },
          { icon: FileText, title: "Журналы", desc: "Электронные журналы всех видов инструктажей" },
          { icon: Award, title: "Удостоверения", desc: "Автоматическая генерация удостоверений" },
        ].map((item, i) => (
          <div key={i} className="bg-white/10 rounded-2xl border border-white/10 p-5 md:p-8 flex items-start gap-4 md:gap-6">
            <div className="w-10 h-10 md:w-14 md:h-14 rounded-2xl bg-[hsl(38_92%_50%/0.2)] flex items-center justify-center flex-shrink-0">
              <item.icon className="w-5 h-5 md:w-7 md:h-7 text-[hsl(38_92%_50%)]" />
            </div>
            <div>
              <h3 className="text-lg md:text-[24px] font-semibold text-white mb-1 md:mb-2">{item.title}</h3>
              <p className="text-sm md:text-[20px] text-white/60">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlideMarketplace() {
  return (
    <div className="flex flex-col md:flex-row h-full bg-[hsl(0_0%_8%)] text-white px-6 md:px-24 py-8 md:py-20">
      <div className="flex-1 flex flex-col justify-center md:pr-16 mb-6 md:mb-0">
        <ShoppingBag className="w-10 h-10 md:w-14 md:h-14 mb-4 md:mb-6 text-[hsl(174_72%_46%)]" />
        <h2 className="text-2xl md:text-[48px] font-bold mb-2 md:mb-4">Магазин курсов</h2>
        <p className="text-sm md:text-[24px] text-white/60 mb-4 md:mb-8">Продавайте свои курсы другим организациям</p>
        <div className="space-y-3 md:space-y-4">
          {[
            "Публикация курсов в каталог",
            "Цены для студентов и организаций",
            "Автокопирование при покупке",
            "Комментарии и рейтинги",
          ].map((t, i) => (
            <div key={i} className="flex items-center gap-3 md:gap-4">
              <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-[hsl(174_72%_46%)]" />
              <span className="text-sm md:text-[20px]">{t}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden md:flex w-[520px] flex-col justify-center">
        <div className="flex items-center gap-3 mb-4">
          <Palette className="w-8 h-8 text-[hsl(262_80%_55%)]" />
          <h3 className="text-[28px] font-bold">Брендирование</h3>
        </div>
        <p className="text-[20px] text-white/60 mb-6">Свой логотип, цвета, домен для входа</p>
        <div className="space-y-3">
          {["Собственный логотип и цвета", "Брендированная страница входа", "Персонализация по /login/your-name"].map((t, i) => (
            <div key={i} className="flex items-center gap-3">
              <Star className="w-5 h-5 text-[hsl(262_80%_55%)]" />
              <span className="text-[18px] text-white/80">{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SlideReadyCourses() {
  const categories = [
    { icon: Factory, name: "Промышленная безопасность", count: "80+", color: "hsl(0 72% 51%)" },
    { icon: Zap, name: "Электробезопасность", count: "50+", color: "hsl(38 92% 50%)" },
    { icon: Flame, name: "Энергетическая безопасность", count: "40+", color: "hsl(25 95% 53%)" },
    { icon: Waves, name: "Гидротехнические сооружения", count: "30+", color: "hsl(210 80% 50%)" },
  ];
  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-[hsl(174_72%_46%)] to-[hsl(174_60%_30%)] text-white px-6 md:px-24 py-8 md:py-20">
      <h2 className="text-3xl md:text-[56px] font-bold mb-2 md:mb-4">200+ готовых курсов</h2>
      <p className="text-base md:text-[26px] text-white/80 mb-6 md:mb-14">Программы по Ростехнадзору с актуальными тестами 2026 года</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 flex-1">
        {categories.map((c, i) => (
          <motion.div key={i} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.12 }}
            className="bg-white/15 backdrop-blur-sm rounded-2xl p-5 md:p-8 border border-white/20 flex items-start gap-4 md:gap-6">
            <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <c.icon className="w-6 h-6 md:w-8 md:h-8" />
            </div>
            <div>
              <h3 className="text-lg md:text-[26px] font-semibold mb-0.5 md:mb-1">{c.name}</h3>
              <span className="text-2xl md:text-[36px] font-bold">{c.count}</span>
              <span className="text-sm md:text-[20px] text-white/70 ml-1 md:ml-2">курсов</span>
            </div>
          </motion.div>
        ))}
      </div>
      <div className="mt-4 md:mt-8 flex flex-wrap gap-3 md:gap-6 justify-center">
        {["Актуальные тесты 2026", "Доступ 24/7", "Автообновление по НПА"].map(t => (
          <span key={t} className="px-4 py-2 md:px-6 md:py-3 rounded-full bg-white/20 text-sm md:text-[18px] font-medium">{t}</span>
        ))}
      </div>
    </div>
  );
}

function SlidePricing() {
  const plans = [
    { name: "Бесплатный", price: "0", students: "10", courses: "3", storage: "100 МБ" },
    { name: "Старт", price: "3 490", students: "100", courses: "15", storage: "3 ГБ" },
    { name: "Стандарт", price: "6 990", students: "200", courses: "30", storage: "10 ГБ", popular: true },
    { name: "Профессиональный", price: "16 990", students: "1 000", courses: "50", storage: "50 ГБ" },
    { name: "Максимальный", price: "24 990", students: "∞", courses: "∞", storage: "100 ГБ" },
  ];
  return (
    <div className="flex flex-col h-full bg-[hsl(40_20%_98%)] px-4 md:px-16 py-6 md:py-14">
      <h2 className="text-2xl md:text-[48px] font-bold text-[hsl(0_0%_8%)] mb-1 md:mb-2 text-center">Тарифы</h2>
      <p className="text-xs md:text-[22px] text-[hsl(0_0%_45%)] mb-4 md:mb-10 text-center">Все функции доступны на каждом тарифе. Разница только в лимитах.</p>
      <div className="flex flex-col md:flex-row gap-3 md:gap-5 justify-center flex-1 items-center overflow-y-auto">
        {plans.map((p, i) => (
          <motion.div key={i} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.1 }}
            className={`w-full md:w-[320px] rounded-2xl p-4 md:p-6 border flex flex-col ${p.popular ? "bg-[hsl(0_0%_8%)] text-white border-[hsl(174_72%_46%)] shadow-2xl md:scale-105 relative" : "bg-white border-[hsl(40_15%_90%)] shadow-md"}`}>
            {p.popular && <span className="absolute -top-3 md:-top-4 left-1/2 -translate-x-1/2 px-3 md:px-4 py-0.5 md:py-1 rounded-full bg-[hsl(174_72%_46%)] text-xs md:text-[14px] font-medium text-white">Популярный</span>}
            <h3 className="text-base md:text-[22px] font-bold mb-1 md:mb-2">{p.name}</h3>
            <div className="mb-2 md:mb-4">
              <span className="text-2xl md:text-[36px] font-bold">{p.price}</span>
              <span className={`text-xs md:text-[16px] ${p.popular ? "text-white/60" : "text-[hsl(0_0%_45%)]"}`}>{p.price === "0" ? " ₽" : " ₽/мес"}</span>
            </div>
            <div className="space-y-1 md:space-y-2 flex-1">
              <div className={`text-xs md:text-[16px] ${p.popular ? "text-white/80" : "text-[hsl(0_0%_45%)]"}`}>👥 до {p.students} учеников</div>
              <div className={`text-xs md:text-[16px] ${p.popular ? "text-white/80" : "text-[hsl(0_0%_45%)]"}`}>📚 {p.courses} курсов</div>
              <div className={`text-xs md:text-[16px] ${p.popular ? "text-white/80" : "text-[hsl(0_0%_45%)]"}`}>💾 {p.storage}</div>
            </div>
            <div className="flex items-center gap-2 mt-2 md:mt-4 pt-2 md:pt-4 border-t border-white/10">
              <CheckCircle2 className={`w-4 h-4 md:w-5 md:h-5 ${p.popular ? "text-[hsl(174_72%_46%)]" : "text-[hsl(142_70%_45%)]"}`} />
              <span className="text-xs md:text-[14px]">Все функции включены</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function SlideMobile() {
  return (
    <div className="flex flex-col md:flex-row h-full bg-[hsl(0_0%_8%)] text-white px-6 md:px-24 py-8 md:py-20">
      <div className="flex-1 flex flex-col justify-center md:pr-16 mb-6 md:mb-0">
        <Smartphone className="w-10 h-10 md:w-14 md:h-14 mb-4 md:mb-6 text-[hsl(174_72%_46%)]" />
        <h2 className="text-2xl md:text-[48px] font-bold mb-3 md:mb-6">Мобильное приложение</h2>
        <p className="text-sm md:text-[24px] text-white/60 mb-6 md:mb-10">Учитесь где угодно — с телефона или планшета</p>
        <div className="space-y-3 md:space-y-5">
          {[
            { icon: Globe, text: "PWA — работает как приложение" },
            { icon: Zap, text: "Оффлайн-режим" },
            { icon: MessageSquare, text: "Push-уведомления" },
            { icon: Smartphone, text: "Android и iOS" },
          ].map((t, i) => (
            <div key={i} className="flex items-center gap-3 md:gap-4">
              <t.icon className="w-5 h-5 md:w-6 md:h-6 text-[hsl(174_72%_46%)]" />
              <span className="text-sm md:text-[22px]">{t.text}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden md:flex w-[400px] items-center justify-center">
        <div className="w-[250px] h-[500px] rounded-[40px] bg-[hsl(0_0%_15%)] border-4 border-[hsl(0_0%_25%)] p-3 shadow-2xl">
          <div className="w-full h-full rounded-[32px] bg-[hsl(40_20%_98%)] overflow-hidden">
            <div className="h-8 bg-[hsl(0_0%_8%)] flex items-center justify-center">
              <div className="w-16 h-1.5 rounded-full bg-white/20" />
            </div>
            <div className="p-4 space-y-3">
              <div className="text-[12px] font-semibold text-[hsl(0_0%_8%)]">Мои курсы</div>
              {[1,2,3].map(i => (
                <div key={i} className="h-12 rounded-lg bg-[hsl(40_15%_92%)]" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlideCTA() {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-[hsl(0_0%_8%)] to-[hsl(0_0%_18%)] text-white px-6 md:px-24 py-8 md:py-20">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6 }}>
        <div className="w-16 h-16 md:w-24 md:h-24 rounded-2xl md:rounded-3xl bg-gradient-to-br from-[hsl(174_72%_46%)] to-[hsl(174_65%_35%)] flex items-center justify-center mb-6 md:mb-10 mx-auto">
          <GraduationCap className="w-8 h-8 md:w-14 md:h-14 text-white" />
        </div>
      </motion.div>
      <h2 className="text-3xl md:text-[64px] font-bold mb-3 md:mb-6 text-center">Начните уже сегодня</h2>
      <p className="text-base md:text-[28px] text-white/60 mb-8 md:mb-12 text-center max-w-[800px]">Бесплатный тариф — навсегда. Все функции доступны.</p>
      <div className="flex flex-col md:flex-row gap-4 md:gap-6 mb-8 md:mb-16">
        <Link to="/register-organization" className="px-8 py-3 md:px-10 md:py-5 rounded-2xl bg-[hsl(174_72%_46%)] text-lg md:text-[24px] font-semibold cursor-pointer hover:opacity-90 transition-opacity text-center">Начать бесплатно</Link>
        <Link to="/register-organization" className="px-8 py-3 md:px-10 md:py-5 rounded-2xl border border-white/30 text-lg md:text-[24px] font-semibold cursor-pointer hover:bg-white/10 transition-colors text-center">Запросить демо</Link>
      </div>
      <div className="flex flex-col md:flex-row gap-3 md:gap-12 text-white/40 text-sm md:text-[20px]">
        <span>support@sintagma.com.ru</span>
        <span>sintagma.com.ru</span>
      </div>
    </div>
  );
}

/* ─── Slides Array ─── */
const slides = [
  SlideTitlePage, SlideProblem, SlideSolution, SlideOrgInterface,
  SlideCourseManagement, SlideCourseSettings, SlideStudentInterface,
  SlideAIAssistant, SlideCompanyInterface, SlideDocuments,
  SlideDocChecklist, SlideVideoId, SlideFRDO, SlideLaborSafety,
  SlideMarketplace, SlideReadyCourses, SlidePricing, SlideMobile, SlideCTA,
];

/* ─── PDF Caching Logic ─── */
async function getCachedPdfUrl(): Promise<string | null> {
  try {
    const { data } = await supabase.storage
      .from("presentation-files")
      .list("", { search: `${PRESENTATION_VERSION}_` });
    if (data && data.length > 0) {
      const file = data[0];
      const { data: urlData } = supabase.storage
        .from("presentation-files")
        .getPublicUrl(file.name);
      return urlData?.publicUrl ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

async function uploadPdfToStorage(pdfBlob: Blob): Promise<string | null> {
  const fileName = `${PRESENTATION_VERSION}_sintagma-presentation.pdf`;
  try {
    await supabase.storage.from("presentation-files").remove([fileName]);
    const { error } = await supabase.storage
      .from("presentation-files")
      .upload(fileName, pdfBlob, { contentType: "application/pdf", upsert: true });
    if (error) {
      console.error("Upload error:", error);
      return null;
    }
    const { data: urlData } = supabase.storage
      .from("presentation-files")
      .getPublicUrl(fileName);
    return urlData?.publicUrl ?? null;
  } catch (e) {
    console.error("Upload exception:", e);
    return null;
  }
}

/* ─── Main Presentation Component ─── */
export default function PlatformPresentation() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [mobileScrollMode, setMobileScrollMode] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const handleDownloadPDF = useCallback(async () => {
    setIsExporting(true);
    toast.info("Проверяем кеш...");
    
    // Check for cached PDF first
    const cachedUrl = await getCachedPdfUrl();
    if (cachedUrl) {
      toast.success("PDF готов!");
      window.open(cachedUrl, "_blank");
      setIsExporting(false);
      return;
    }

    // Generate PDF
    toast.info("Генерация PDF... Это может занять несколько секунд");
    const originalSlide = current;
    try {
      const [html2canvasModule, jsPDFModule] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const html2canvas = html2canvasModule.default;
      const jsPDF = jsPDFModule.jsPDF;

      // Temporarily switch to slide mode for capture
      if (isMobile && mobileScrollMode) setMobileScrollMode(false);
      await new Promise(r => setTimeout(r, 300));

      const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1920, 1080] });

      for (let i = 0; i < slides.length; i++) {
        if (i > 0) pdf.addPage([1920, 1080], "landscape");
        setDirection(i > (i === 0 ? 0 : i - 1) ? 1 : -1);
        setCurrent(i);
        toast.info(`Слайд ${i + 1} из ${slides.length}...`, { id: 'pdf-progress' });
        await new Promise(r => setTimeout(r, 2000));

        const slideEl = document.getElementById("slide-capture-target");
        if (!slideEl) continue;

        const canvas = await html2canvas(slideEl, {
          width: 1920, height: 1080, scale: 1, useCORS: true, backgroundColor: "#000",
        });
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 1920, 1080);
      }

      // Convert to blob and upload to storage
      const pdfBlob = pdf.output("blob");
      const uploadedUrl = await uploadPdfToStorage(pdfBlob);
      
      if (uploadedUrl) {
        toast.success("PDF создан и сохранён!");
        window.open(uploadedUrl, "_blank");
      } else {
        // Fallback: direct download
        pdf.save("СИНТАГМА_Презентация.pdf");
        toast.success("PDF скачан!");
      }
    } catch (err) {
      console.error("PDF export error:", err);
      toast.error("Ошибка при создании PDF");
    } finally {
      setCurrent(originalSlide);
      setIsExporting(false);
      if (isMobile) setMobileScrollMode(true);
    }
  }, [current, isMobile, mobileScrollMode]);

  const go = useCallback((next: number) => {
    if (next < 0 || next >= TOTAL_SLIDES) return;
    setDirection(next > current ? 1 : -1);
    setCurrent(next);
  }, [current]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); go(current + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(current - 1); }
      else if (e.key === "Escape" && isFullscreen) document.exitFullscreen?.();
      else if (e.key === "f" || e.key === "F5") { e.preventDefault(); toggleFullscreen(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, isFullscreen, go]);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    const resize = () => {
      if (!containerRef.current) return;
      const { clientWidth: w, clientHeight: h } = containerRef.current;
      if (isMobile && mobileScrollMode) {
        // On mobile scroll mode, scale by width only
        setScale(w / 1920);
      } else {
        setScale(Math.min(w / 1920, h / 1080));
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [isMobile, mobileScrollMode]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  // Touch support (only for slide mode)
  const touchStart = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { 
    if (isMobile && mobileScrollMode) return;
    touchStart.current = e.touches[0].clientX; 
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (isMobile && mobileScrollMode) return;
    if (touchStart.current === null) return;
    const diff = touchStart.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) go(current + (diff > 0 ? 1 : -1));
    touchStart.current = null;
  };

  // Mobile scroll mode: show all slides vertically
  if (isMobile && mobileScrollMode) {
    return (
      <div className="min-h-screen bg-black">
        {/* Top bar */}
        <div className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-md border-b border-white/10">
          <button onClick={() => navigate("/")} className="p-2 rounded-full hover:bg-white/10 text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-white/60 text-sm font-medium">СИНТАГМА • Презентация</span>
          <button onClick={handleDownloadPDF} disabled={isExporting} className="p-2 rounded-full hover:bg-white/10 text-white disabled:opacity-50">
            {isExporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
          </button>
        </div>
        {/* All slides stacked vertically */}
        <div className="space-y-1">
          {slides.map((SlideComponent, i) => (
            <div key={i} className="relative">
              <div className="absolute top-2 right-2 z-10 bg-black/50 text-white/60 text-[10px] px-2 py-0.5 rounded-full">
                {i + 1}/{TOTAL_SLIDES}
              </div>
              <div style={{ width: "100vw", minHeight: "56.25vw" }}>
                <SlideComponent />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const SlideComponent = slides[current];

  return (
    <div ref={containerRef} className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none"
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <button onClick={() => navigate("/")} className="fixed top-4 md:top-6 left-4 md:left-6 z-50 p-2.5 md:p-3 rounded-full bg-black/60 backdrop-blur-md hover:bg-white/10 transition-colors text-white" title="Назад">
        <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
      </button>
      {/* Scaled slide */}
      <div id="slide-capture-target" className="relative" style={{ width: 1920, height: 1080, transform: `scale(${scale})`, transformOrigin: "center center" }}>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div key={current} custom={direction} variants={slideVariants}
            initial="enter" animate="center" exit="exit"
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="absolute inset-0 overflow-hidden rounded-lg">
            <SlideComponent />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-4 md:bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 md:gap-4 bg-black/60 backdrop-blur-md rounded-full px-4 md:px-6 py-2.5 md:py-3 z-50">
        <button onClick={() => go(current - 1)} disabled={current === 0}
          className="p-1.5 md:p-2 rounded-full hover:bg-white/10 disabled:opacity-30 transition-colors text-white">
          <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
        </button>
        <span className="text-white/80 text-xs md:text-sm font-medium min-w-[50px] md:min-w-[60px] text-center">{current + 1} / {TOTAL_SLIDES}</span>
        <button onClick={() => go(current + 1)} disabled={current === TOTAL_SLIDES - 1}
          className="p-1.5 md:p-2 rounded-full hover:bg-white/10 disabled:opacity-30 transition-colors text-white">
          <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
        </button>
        <div className="w-px h-4 md:h-5 bg-white/20" />
        <button onClick={handleDownloadPDF} disabled={isExporting}
          className="p-1.5 md:p-2 rounded-full hover:bg-white/10 disabled:opacity-50 transition-colors text-white" title="Скачать PDF">
          {isExporting ? <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> : <Download className="w-4 h-4 md:w-5 md:h-5" />}
        </button>
        {!isMobile && (
          <>
            <div className="w-px h-5 bg-white/20" />
            <button onClick={toggleFullscreen} className="p-2 rounded-full hover:bg-white/10 transition-colors text-white">
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </>
        )}
      </div>

      {/* Slide indicator dots - only on desktop */}
      {!isMobile && (
        <div className="fixed bottom-16 md:bottom-20 left-1/2 -translate-x-1/2 flex gap-1.5 z-50">
          {slides.map((_, i) => (
            <button key={i} onClick={() => go(i)}
              className={`w-2 h-2 rounded-full transition-all ${i === current ? "bg-white w-6" : "bg-white/30 hover:bg-white/50"}`} />
          ))}
        </div>
      )}
    </div>
  );
}
