import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  BookOpen,
  Users,
  Building2,
  FileCheck,
  ClipboardList,
  Database,
  Link as LinkIcon,
  Library,
  ShoppingBag,
  Settings,
  GraduationCap,
  Download,
  CheckCircle2,
  Calculator,
  Sparkles,
  Loader2,
} from "lucide-react";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { supabase } from "@/integrations/supabase/client";

interface FeatureItem {
  id: string;
  name: string;
  price: number;
  included: boolean;
  isEnabled: boolean;
}

interface FeatureCategory {
  id: string;
  title: string;
  icon: React.ElementType;
  color: string;
  basePrice: number;
  isEnabled: boolean;
  features: FeatureItem[];
}

const iconMap: Record<string, React.ElementType> = {
  courses: BookOpen,
  students: Users,
  companies: Building2,
  documents: FileCheck,
  journals: ClipboardList,
  frdo: Database,
  links: LinkIcon,
  library: Library,
  services: ShoppingBag,
  settings: Settings,
  student_cabinet: GraduationCap,
};

const colorMap: Record<string, string> = {
  courses: "#6366f1",
  students: "#10b981",
  companies: "#f59e0b",
  documents: "#ec4899",
  journals: "#8b5cf6",
  frdo: "#06b6d4",
  links: "#14b8a6",
  library: "#f97316",
  services: "#84cc16",
  settings: "#64748b",
  student_cabinet: "#0ea5e9",
};

const getDefaultFeatures = (): FeatureCategory[] => [
  {
    id: "courses",
    title: "Управление курсами",
    icon: BookOpen,
    color: "#6366f1",
    basePrice: 3000,
    isEnabled: true,
    features: [
      { id: "courses_create", name: "Создание и редактирование курсов", price: 0, included: true, isEnabled: true },
      { id: "courses_publish", name: "Публикация и снятие с публикации", price: 0, included: true, isEnabled: true },
      { id: "courses_categories", name: "Категории курсов с цветовой маркировкой", price: 0, included: true, isEnabled: true },
      { id: "courses_lessons", name: "Конструктор уроков (лекции, тесты, видео)", price: 0, included: true, isEnabled: true },
      { id: "courses_import", name: "Импорт курсов из внешних источников", price: 500, included: false, isEnabled: true },
      { id: "courses_ai", name: "ИИ-генерация контента курсов", price: 2000, included: false, isEnabled: true },
      { id: "courses_preview", name: "Предпросмотр курса перед публикацией", price: 0, included: true, isEnabled: true },
      { id: "courses_duration", name: "Управление продолжительностью обучения", price: 0, included: true, isEnabled: true },
    ],
  },
  {
    id: "students",
    title: "Управление слушателями",
    icon: Users,
    color: "#10b981",
    basePrice: 2500,
    isEnabled: true,
    features: [
      { id: "students_add", name: "Добавление слушателей вручную", price: 0, included: true, isEnabled: true },
      { id: "students_import", name: "Массовый импорт из Excel", price: 0, included: true, isEnabled: true },
      { id: "students_enroll", name: "Зачисление на курсы (индивидуально и массово)", price: 0, included: true, isEnabled: true },
      { id: "students_progress", name: "Отслеживание прогресса обучения", price: 0, included: true, isEnabled: true },
      { id: "students_card", name: "Карточка слушателя с полной информацией", price: 0, included: true, isEnabled: true },
      { id: "students_credentials", name: "Генерация логинов и паролей", price: 0, included: true, isEnabled: true },
      { id: "students_email", name: "Отправка учётных данных по Email", price: 500, included: false, isEnabled: true },
      { id: "students_companies", name: "Привязка к компаниям-заказчикам", price: 0, included: true, isEnabled: true },
      { id: "students_bulk", name: "Массовые операции (отчисление, рассылка)", price: 500, included: false, isEnabled: true },
      { id: "students_filter", name: "Фильтрация по статусу, курсу, документам", price: 0, included: true, isEnabled: true },
    ],
  },
  {
    id: "companies",
    title: "Компании (юридические лица)",
    icon: Building2,
    color: "#f59e0b",
    basePrice: 1500,
    isEnabled: true,
    features: [
      { id: "companies_list", name: "Справочник компаний-заказчиков", price: 0, included: true, isEnabled: true },
      { id: "companies_requisites", name: "Полные реквизиты (ИНН, КПП, ОГРН)", price: 0, included: true, isEnabled: true },
      { id: "companies_bank", name: "Банковские реквизиты", price: 0, included: true, isEnabled: true },
      { id: "companies_stamp", name: "Загрузка печати и подписи", price: 500, included: false, isEnabled: true },
      { id: "companies_docs", name: "Документы компаний (договоры, счета)", price: 0, included: true, isEnabled: true },
      { id: "companies_students", name: "Привязка слушателей к компаниям", price: 0, included: true, isEnabled: true },
    ],
  },
  {
    id: "documents",
    title: "Документооборот",
    icon: FileCheck,
    color: "#ec4899",
    basePrice: 4000,
    isEnabled: true,
    features: [
      { id: "docs_contracts", name: "Генератор договоров с шаблонами", price: 0, included: true, isEnabled: true },
      { id: "docs_templates", name: "Редактор шаблонов с переменными", price: 0, included: true, isEnabled: true },
      { id: "docs_consent", name: "Генератор согласий на обработку ПДн", price: 0, included: true, isEnabled: true },
      { id: "docs_acts", name: "Генератор актов выполненных работ", price: 500, included: false, isEnabled: true },
      { id: "docs_invoices", name: "Генератор счетов на оплату", price: 500, included: false, isEnabled: true },
      { id: "docs_issuance", name: "Журнал выдачи документов", price: 0, included: true, isEnabled: true },
      { id: "docs_orders", name: "Архив приказов (зачисление, отчисление)", price: 0, included: true, isEnabled: true },
      { id: "docs_bulk", name: "Массовая загрузка документов", price: 500, included: false, isEnabled: true },
      { id: "docs_student", name: "Управление документами слушателей", price: 0, included: true, isEnabled: true },
      { id: "docs_journal", name: "Экспорт классного журнала", price: 500, included: false, isEnabled: true },
    ],
  },
  {
    id: "journals",
    title: "Журналы учёта",
    icon: ClipboardList,
    color: "#8b5cf6",
    basePrice: 2000,
    isEnabled: true,
    features: [
      { id: "journal_attendance_auto", name: "Журнал посещаемости (автоматический)", price: 0, included: true, isEnabled: true },
      { id: "journal_attendance_manual", name: "Журнал посещаемости (ручной)", price: 0, included: true, isEnabled: true },
      { id: "journal_grades", name: "Журнал текущего контроля успеваемости", price: 0, included: true, isEnabled: true },
      { id: "journal_attestation", name: "Журнал итоговой аттестации", price: 0, included: true, isEnabled: true },
      { id: "journal_docs", name: "Журнал регистрации документов", price: 0, included: true, isEnabled: true },
      { id: "journal_blanks", name: "Журнал учёта бланков строгой отчётности", price: 0, included: true, isEnabled: true },
      { id: "journal_copies", name: "Журнал выдачи копий/дубликатов", price: 0, included: true, isEnabled: true },
      { id: "journal_entry", name: "Журнал входного контроля", price: 0, included: true, isEnabled: true },
      { id: "journal_plans", name: "Журнал индивидуальных планов", price: 0, included: true, isEnabled: true },
      { id: "journal_internship", name: "Журнал стажировки/практики", price: 0, included: true, isEnabled: true },
      { id: "journal_safety", name: "Журнал инструктажей по ТБ", price: 0, included: true, isEnabled: true },
      { id: "journal_custom", name: "Создание пользовательских журналов", price: 500, included: false, isEnabled: true },
      { id: "journal_export", name: "Экспорт журналов в Excel", price: 0, included: true, isEnabled: true },
    ],
  },
  {
    id: "frdo",
    title: "ФРДО (Федеральный реестр)",
    icon: Database,
    color: "#06b6d4",
    basePrice: 5000,
    isEnabled: true,
    features: [
      { id: "frdo_manage", name: "Управление данными для ФРДО", price: 0, included: true, isEnabled: true },
      { id: "frdo_check", name: "Проверка полноты данных", price: 0, included: true, isEnabled: true },
      { id: "frdo_bulk", name: "Массовый экспорт в формате ФРДО", price: 0, included: true, isEnabled: true },
      { id: "frdo_single", name: "Индивидуальный экспорт данных", price: 0, included: true, isEnabled: true },
    ],
  },
  {
    id: "links",
    title: "Ссылки регистрации",
    icon: LinkIcon,
    color: "#14b8a6",
    basePrice: 1000,
    isEnabled: true,
    features: [
      { id: "links_generate", name: "Генерация уникальных ссылок", price: 0, included: true, isEnabled: true },
      { id: "links_courses", name: "Привязка к курсам", price: 0, included: true, isEnabled: true },
      { id: "links_companies", name: "Привязка к компаниям", price: 0, included: true, isEnabled: true },
      { id: "links_stats", name: "Отслеживание использования", price: 0, included: true, isEnabled: true },
      { id: "links_expire", name: "Срок действия ссылок", price: 0, included: true, isEnabled: true },
    ],
  },
  {
    id: "library",
    title: "Библиотека",
    icon: Library,
    color: "#f97316",
    basePrice: 1500,
    isEnabled: true,
    features: [
      { id: "library_files", name: "Хранение учебных материалов", price: 0, included: true, isEnabled: true },
      { id: "library_folders", name: "Организация по папкам", price: 0, included: true, isEnabled: true },
      { id: "library_formats", name: "Загрузка файлов различных форматов", price: 0, included: true, isEnabled: true },
      { id: "library_access", name: "Доступ для слушателей", price: 0, included: true, isEnabled: true },
    ],
  },
  {
    id: "services",
    title: "Услуги",
    icon: ShoppingBag,
    color: "#84cc16",
    basePrice: 500,
    isEnabled: true,
    features: [
      { id: "services_catalog", name: "Каталог дополнительных услуг", price: 0, included: true, isEnabled: true },
      { id: "services_orders", name: "Заказ услуг организациями", price: 0, included: true, isEnabled: true },
      { id: "services_status", name: "Отслеживание статусов заказов", price: 0, included: true, isEnabled: true },
    ],
  },
  {
    id: "settings",
    title: "Настройки системы",
    icon: Settings,
    color: "#64748b",
    basePrice: 0,
    isEnabled: true,
    features: [
      { id: "settings_requisites", name: "Реквизиты организации", price: 0, included: true, isEnabled: true },
      { id: "settings_theme", name: "Тёмная и светлая тема", price: 0, included: true, isEnabled: true },
      { id: "settings_menu", name: "Настройки видимости меню", price: 0, included: true, isEnabled: true },
      { id: "settings_student", name: "Настройки кабинета слушателя", price: 0, included: true, isEnabled: true },
      { id: "settings_notifications", name: "Управление уведомлениями", price: 0, included: true, isEnabled: true },
    ],
  },
  {
    id: "student_cabinet",
    title: "Кабинет слушателя",
    icon: GraduationCap,
    color: "#0ea5e9",
    basePrice: 2000,
    isEnabled: true,
    features: [
      { id: "cabinet_courses", name: "Прохождение курсов онлайн", price: 0, included: true, isEnabled: true },
      { id: "cabinet_tests", name: "Интерактивное тестирование", price: 0, included: true, isEnabled: true },
      { id: "cabinet_docs", name: "Загрузка документов", price: 0, included: true, isEnabled: true },
      { id: "cabinet_consent", name: "Подписание согласий на ПДн", price: 0, included: true, isEnabled: true },
      { id: "cabinet_video", name: "Видеоидентификация", price: 1000, included: false, isEnabled: true },
      { id: "cabinet_achievements", name: "Система достижений и бейджей", price: 500, included: false, isEnabled: true },
      { id: "cabinet_ai", name: "ИИ-помощник (чат-бот)", price: 2000, included: false, isEnabled: true },
      { id: "cabinet_progress", name: "Просмотр прогресса обучения", price: 0, included: true, isEnabled: true },
    ],
  },
];

export default function Features() {
  const [features, setFeatures] = useState<FeatureCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFeaturesFromDB();
  }, []);

  const fetchFeaturesFromDB = async () => {
    try {
      const [categoriesResult, featuresResult] = await Promise.all([
        supabase.from("system_feature_categories").select("*"),
        supabase.from("system_features").select("*"),
      ]);

      const defaultFeatures = getDefaultFeatures();
      
      // Merge database data with defaults
      const mergedFeatures = defaultFeatures.map(category => {
        const dbCategory = categoriesResult.data?.find(c => c.category_id === category.id);
        
        return {
          ...category,
          icon: iconMap[category.id] || BookOpen,
          color: colorMap[category.id] || "#6366f1",
          basePrice: dbCategory?.base_price ?? category.basePrice,
          isEnabled: dbCategory?.is_enabled ?? true,
          features: category.features.map(feature => {
            const dbFeature = featuresResult.data?.find(f => f.feature_id === feature.id);
            return {
              ...feature,
              price: dbFeature?.price ?? feature.price,
              isEnabled: dbFeature?.is_enabled ?? true,
            };
          }),
        };
      });

      // Filter only enabled categories and features
      const enabledFeatures = mergedFeatures
        .filter(cat => cat.isEnabled)
        .map(cat => ({
          ...cat,
          features: cat.features.filter(f => f.isEnabled),
        }));

      setFeatures(enabledFeatures);
    } catch (error) {
      console.error("Error fetching features:", error);
      // Fallback to defaults if DB fetch fails
      setFeatures(getDefaultFeatures());
    } finally {
      setLoading(false);
    }
  };

  // Calculate totals
  const totalModules = features.length;
  const totalFeatures = features.reduce((sum, cat) => sum + cat.features.length, 0);
  const baseMonthlyPrice = features.reduce((sum, cat) => sum + cat.basePrice, 0);
  const additionalPrice = features.reduce((sum, cat) => 
    sum + cat.features.filter(f => !f.included).reduce((s, f) => s + f.price, 0), 0
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }



  // Generate PDF
  const generatePDF = () => {
    const printContent = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Синтагма — Функциональные возможности и тарифы</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #1f2937;
      line-height: 1.6;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid #e5e7eb;
    }
    .logo { font-size: 32px; font-weight: bold; color: #6366f1; margin-bottom: 8px; }
    .subtitle { color: #6b7280; font-size: 14px; }
    .date { color: #9ca3af; font-size: 12px; margin-top: 8px; }
    .category { margin-bottom: 24px; page-break-inside: avoid; }
    .category-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 12px; padding: 12px 16px; border-radius: 8px;
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border-left: 4px solid var(--color);
    }
    .category-title { font-size: 16px; font-weight: 600; }
    .category-price { font-size: 14px; color: #6366f1; font-weight: 600; }
    .features-list { list-style: none; padding-left: 20px; }
    .feature-item {
      padding: 6px 0; padding-left: 20px; position: relative;
      font-size: 14px; color: #374151; display: flex; justify-content: space-between;
    }
    .feature-item::before { content: "✓"; position: absolute; left: 0; color: #10b981; font-weight: bold; }
    .feature-price { color: #6b7280; font-size: 12px; }
    .feature-price.paid { color: #f59e0b; font-weight: 500; }
    .summary {
      margin-top: 40px; padding: 20px; background: #f8fafc;
      border-radius: 12px; text-align: center;
    }
    .summary-title { font-size: 18px; font-weight: 600; margin-bottom: 16px; }
    .summary-stats { display: flex; justify-content: center; gap: 40px; }
    .stat { text-align: center; }
    .stat-value { font-size: 28px; font-weight: bold; color: #6366f1; }
    .stat-label { font-size: 12px; color: #6b7280; }
    .footer {
      margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb;
      text-align: center; font-size: 11px; color: #9ca3af;
    }
    @media print { body { padding: 20px; } .category { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">Σ Синтагма</div>
    <div class="subtitle">Платформа дополнительного профессионального образования</div>
    <div class="date">Сформировано: ${new Date().toLocaleDateString('ru-RU', { 
      year: 'numeric', month: 'long', day: 'numeric'
    })}</div>
  </div>

  <h1 style="font-size: 22px; margin-bottom: 24px; text-align: center;">Функциональные возможности и тарифы</h1>

  ${features.map(category => {
    const catTotal = category.basePrice + category.features.filter(f => !f.included).reduce((s, f) => s + f.price, 0);
    return `
    <div class="category">
      <div class="category-header" style="--color: ${category.color}">
        <span class="category-title">${category.title}</span>
        <span class="category-price">${category.basePrice.toLocaleString()} ₽/мес</span>
      </div>
      <ul class="features-list">
        ${category.features.map(feature => `
          <li class="feature-item">
            <span>${feature.name}</span>
            <span class="feature-price ${!feature.included ? 'paid' : ''}">
              ${feature.included ? 'Включено' : `+${feature.price.toLocaleString()} ₽`}
            </span>
          </li>
        `).join('')}
      </ul>
      <div class="category-subtotal" style="background: ${category.color}10; border-top: 2px solid ${category.color}30; padding: 8px 16px; display: flex; justify-content: space-between; font-size: 14px;">
        <span style="color: #6b7280;">Итого по модулю:</span>
        <span style="font-weight: 600; color: ${category.color};">${catTotal.toLocaleString()} ₽/мес</span>
      </div>
    </div>
  `}).join('')}

  <div class="summary">
    <div class="summary-title">Итого</div>
    <div class="summary-stats">
      <div class="stat">
        <div class="stat-value">${totalModules}</div>
        <div class="stat-label">модулей</div>
      </div>
      <div class="stat">
        <div class="stat-value">${totalFeatures}</div>
        <div class="stat-label">функций</div>
      </div>
      <div class="stat">
        <div class="stat-value">${baseMonthlyPrice.toLocaleString()} ₽</div>
        <div class="stat-label">базовая стоимость</div>
      </div>
    </div>
  </div>

  <div class="footer">
    © ${new Date().getFullYear()} Синтагма — Система управления образовательным процессом
  </div>
</body>
</html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.onload = () => printWindow.print();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Возможности СИНТАГМА — Полный набор инструментов для ДПО</title>
        <meta name="description" content="AI-генерация курсов, автоматический документооборот, интеграция с ФРДО, журналы и протоколы. Всё для работы образовательной организации." />
        <meta name="keywords" content="возможности СДО, AI курсы, документооборот, ФРДО интеграция, автоматизация обучения" />
        <link rel="canonical" href="https://sintagma.com.ru/features" />
        <meta property="og:title" content="Возможности СИНТАГМА — Полный набор инструментов для ДПО" />
        <meta property="og:description" content="AI-генерация курсов, автоматический документооборот, интеграция с ФРДО, журналы и протоколы. Всё для работы образовательной организации." />
        <meta property="og:url" content="https://sintagma.com.ru/features" />
        <meta property="og:image" content="https://sintagma.com.ru/og-image.png" />
      </Helmet>
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 lg:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link to="/" className="flex items-center gap-2">
                <SigmaLogo size="sm" />
                <span className="font-display font-bold text-lg hidden sm:block">Синтагма</span>
              </Link>
              <span className="text-muted-foreground">/</span>
              <span className="font-medium">Функции и тарифы</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={generatePDF} className="rounded-xl">
                <Download className="w-4 h-4 mr-2" />
                PDF
              </Button>
              <Link to="/">
                <Button variant="ghost" size="sm" className="rounded-xl">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  На главную
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 lg:px-6 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-card rounded-2xl border border-border p-4 text-center">
            <div className="text-3xl font-bold text-primary">{totalModules}</div>
            <div className="text-sm text-muted-foreground">модулей</div>
          </div>
          <div className="bg-card rounded-2xl border border-border p-4 text-center">
            <div className="text-3xl font-bold text-primary">{totalFeatures}</div>
            <div className="text-sm text-muted-foreground">функций</div>
          </div>
          <div className="bg-card rounded-2xl border border-border p-4 text-center">
            <div className="text-3xl font-bold text-green-500">{baseMonthlyPrice.toLocaleString()} ₽</div>
            <div className="text-sm text-muted-foreground">базовая / мес</div>
          </div>
          <div className="bg-card rounded-2xl border border-border p-4 text-center">
            <div className="text-3xl font-bold text-amber-500">+{additionalPrice.toLocaleString()} ₽</div>
            <div className="text-sm text-muted-foreground">доп. опции</div>
          </div>
        </div>

        {/* Calculator Preview */}
        <div className="bg-gradient-to-r from-primary/10 via-accent/5 to-primary/10 rounded-2xl border border-primary/20 p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Calculator className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">Калькулятор стоимости</h2>
              <p className="text-sm text-muted-foreground">Выберите нужные модули для расчёта</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-2xl font-bold">{(baseMonthlyPrice + additionalPrice).toLocaleString()} ₽</span>
              <span className="text-muted-foreground ml-2">/ месяц</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="w-4 h-4" />
              <span>Все функции включены</span>
            </div>
          </div>
        </div>

        {/* Features List */}
        <div className="space-y-6">
          {features.map((category) => {
            const Icon = category.icon;
            const categoryTotal = category.basePrice + category.features.filter(f => !f.included).reduce((s, f) => s + f.price, 0);
            
            return (
              <div key={category.id} className="bg-card rounded-2xl border border-border overflow-hidden">
                {/* Category Header */}
                <div 
                  className="flex items-center justify-between p-4 bg-secondary/30"
                  style={{ borderLeft: `4px solid ${category.color}` }}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${category.color}20` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: category.color }} />
                    </div>
                    <div>
                      <h3 className="font-semibold">{category.title}</h3>
                      <p className="text-sm text-muted-foreground">{category.features.length} функций</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-lg">
                      {category.basePrice.toLocaleString()} ₽
                      <span className="text-sm font-normal text-muted-foreground">/мес</span>
                    </div>
                  </div>
                </div>

                {/* Features */}
                <div className="divide-y divide-border">
                  {category.features.map((feature) => (
                    <div 
                      key={feature.id} 
                      className="flex items-center justify-between p-3 px-4 hover:bg-secondary/20 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${feature.included ? 'text-green-500' : 'text-amber-500'}`} />
                        <span className="text-sm">{feature.name}</span>
                      </div>
                      <span className={`text-xs ${feature.included ? 'text-green-500' : 'text-amber-500'}`}>
                        {feature.included ? 'Включено' : `+${feature.price.toLocaleString()} ₽`}
                      </span>
                    </div>
                  ))}
                </div>
                
                {/* Category Subtotal */}
                <div 
                  className="flex items-center justify-between p-3 px-4 bg-secondary/50"
                  style={{ borderTop: `2px solid ${category.color}30` }}
                >
                  <span className="text-sm font-medium text-muted-foreground">Итого по модулю:</span>
                  <span className="font-semibold" style={{ color: category.color }}>
                    {categoryTotal.toLocaleString()} ₽/мес
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
