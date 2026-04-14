import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Save,
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
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Percent,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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

export function SystemFeaturesManager() {
  const [features, setFeatures] = useState<FeatureCategory[]>(getDefaultFeatures);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const [yearlyDiscount, setYearlyDiscount] = useState(20);
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
    fetchYearlyDiscount();
  }, []);

  const fetchYearlyDiscount = async () => {
    try {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "yearly_discount")
        .single();
      
      if (data?.value && typeof data.value === 'object' && 'percentage' in data.value) {
        setYearlyDiscount((data.value as { percentage: number }).percentage);
      }
    } catch (error) {
      console.error("Error fetching yearly discount:", error);
    }
  };

  const fetchSettings = async () => {
    try {
      const [categoriesResult, featuresResult] = await Promise.all([
        supabase.from("system_feature_categories").select("*"),
        supabase.from("system_features").select("*"),
      ]);

      if (categoriesResult.error) throw categoriesResult.error;
      if (featuresResult.error) throw featuresResult.error;

      const defaultFeatures = getDefaultFeatures();
      
      // Merge database data with defaults
      const mergedFeatures = defaultFeatures.map(category => {
        const dbCategory = categoriesResult.data?.find(c => c.category_id === category.id);
        
        return {
          ...category,
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

      setFeatures(mergedFeatures);
    } catch (error) {
      console.error("Error fetching settings:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить настройки",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Upsert categories
      const categoriesToUpsert = features.map(cat => ({
        category_id: cat.id,
        base_price: cat.basePrice,
        is_enabled: cat.isEnabled,
      }));

      for (const cat of categoriesToUpsert) {
        const { error } = await supabase
          .from("system_feature_categories")
          .upsert(cat, { onConflict: "category_id" });
        if (error) throw error;
      }

      // Upsert features
      const featuresToUpsert = features.flatMap(cat =>
        cat.features.map(f => ({
          feature_id: f.id,
          category_id: cat.id,
          price: f.price,
          is_enabled: f.isEnabled,
        }))
      );

      for (const feature of featuresToUpsert) {
        const { error } = await supabase
          .from("system_features")
          .upsert(feature, { onConflict: "feature_id" });
        if (error) throw error;
      }

      // Save yearly discount
      const { error: discountError } = await supabase
        .from("system_settings")
        .upsert({
          key: "yearly_discount",
          value: { percentage: yearlyDiscount },
        }, { onConflict: "key" });
      
      if (discountError) throw discountError;

      toast({
        title: "Успешно",
        description: "Настройки сохранены",
      });
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить настройки",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleCategory = (categoryId: string) => {
    setFeatures(prev =>
      prev.map(cat =>
        cat.id === categoryId ? { ...cat, isEnabled: !cat.isEnabled } : cat
      )
    );
  };

  const toggleFeature = (categoryId: string, featureId: string) => {
    setFeatures(prev =>
      prev.map(cat =>
        cat.id === categoryId
          ? {
              ...cat,
              features: cat.features.map(f =>
                f.id === featureId ? { ...f, isEnabled: !f.isEnabled } : f
              ),
            }
          : cat
      )
    );
  };

  const updateCategoryPrice = (categoryId: string, price: number) => {
    setFeatures(prev =>
      prev.map(cat =>
        cat.id === categoryId ? { ...cat, basePrice: price } : cat
      )
    );
  };

  const updateFeaturePrice = (categoryId: string, featureId: string, price: number) => {
    setFeatures(prev =>
      prev.map(cat =>
        cat.id === categoryId
          ? {
              ...cat,
              features: cat.features.map(f =>
                f.id === featureId ? { ...f, price } : f
              ),
            }
          : cat
      )
    );
  };

  const toggleCategoryOpen = (categoryId: string) => {
    setOpenCategories(prev => ({ ...prev, [categoryId]: !prev[categoryId] }));
  };

  // Calculate totals
  const enabledModules = features.filter(c => c.isEnabled).length;
  const totalFeatures = features.reduce(
    (sum, cat) => sum + cat.features.filter(f => f.isEnabled).length,
    0
  );
  const totalBasePrice = features
    .filter(c => c.isEnabled)
    .reduce((sum, cat) => sum + cat.basePrice, 0);
  const totalAdditionalPrice = features
    .filter(c => c.isEnabled)
    .reduce(
      (sum, cat) =>
        sum +
        cat.features
          .filter(f => f.isEnabled && !f.included)
          .reduce((s, f) => s + f.price, 0),
      0
    );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-display font-bold">Функции системы</h2>
          <p className="text-muted-foreground">
            Управление доступными функциями и ценами
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchSettings} disabled={saving}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Обновить
          </Button>
          <Button onClick={handleSave} disabled={saving} className="btn-gradient">
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Сохранить
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Активных модулей</CardDescription>
            <CardTitle className="text-3xl">{enabledModules}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Активных функций</CardDescription>
            <CardTitle className="text-3xl">{totalFeatures}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Базовая стоимость</CardDescription>
            <CardTitle className="text-3xl">
              {totalBasePrice.toLocaleString()} ₽
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Доп. услуги</CardDescription>
            <CardTitle className="text-3xl">
              {totalAdditionalPrice.toLocaleString()} ₽
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Yearly Discount Setting */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Percent className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Скидка за годовую оплату</CardTitle>
          </div>
          <CardDescription>
            Устанавливает размер скидки для пользователей, выбирающих годовую оплату в калькуляторе на главной странице
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 flex-1 max-w-xs">
              <Input
                type="number"
                min={0}
                max={100}
                value={yearlyDiscount}
                onChange={(e) => setYearlyDiscount(Math.min(100, Math.max(0, Number(e.target.value))))}
                className="w-24"
              />
              <span className="text-muted-foreground font-medium">%</span>
            </div>
            <div className="text-sm text-muted-foreground">
              При годовой оплате пользователь получает скидку {yearlyDiscount}% на каждый месяц
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Features List */}
      <ScrollArea className="h-[calc(100vh-380px)]">
        <div className="space-y-3 pr-4">
          {features.map(category => {
            const Icon = category.icon;
            const isOpen = openCategories[category.id];
            const enabledFeaturesCount = category.features.filter(
              f => f.isEnabled
            ).length;
            const categoryTotal =
              category.basePrice +
              category.features
                .filter(f => f.isEnabled && !f.included)
                .reduce((s, f) => s + f.price, 0);

            return (
              <Card
                key={category.id}
                className={`transition-all ${
                  !category.isEnabled ? "opacity-50" : ""
                }`}
              >
                <Collapsible
                  open={isOpen}
                  onOpenChange={() => toggleCategoryOpen(category.id)}
                >
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <CollapsibleTrigger asChild>
                        <button className="flex items-center gap-3 flex-1 text-left hover:opacity-80 transition-opacity">
                          {isOpen ? (
                            <ChevronDown className="w-5 h-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-muted-foreground" />
                          )}
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center"
                            style={{ backgroundColor: `${category.color}20` }}
                          >
                            <Icon
                              className="w-5 h-5"
                              style={{ color: category.color }}
                            />
                          </div>
                          <div className="flex-1">
                            <div className="font-semibold">{category.title}</div>
                            <div className="text-sm text-muted-foreground">
                              {enabledFeaturesCount} из {category.features.length}{" "}
                              функций
                            </div>
                          </div>
                        </button>
                      </CollapsibleTrigger>

                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={category.basePrice}
                            onChange={e =>
                              updateCategoryPrice(
                                category.id,
                                parseInt(e.target.value) || 0
                              )
                            }
                            className="w-28 text-right"
                            disabled={!category.isEnabled}
                          />
                          <span className="text-muted-foreground text-sm">
                            ₽/мес
                          </span>
                        </div>
                        <Switch
                          checked={category.isEnabled}
                          onCheckedChange={() => toggleCategory(category.id)}
                        />
                      </div>
                    </div>

                    {category.isEnabled && (
                      <div className="mt-2 ml-14 flex items-center gap-2">
                        <Badge
                          variant="outline"
                          style={{
                            borderColor: category.color,
                            color: category.color,
                          }}
                        >
                          Итого: {categoryTotal.toLocaleString()} ₽/мес
                        </Badge>
                      </div>
                    )}
                  </div>

                  <CollapsibleContent>
                    <div className="border-t">
                      {category.features.map(feature => (
                        <div
                          key={feature.id}
                          className={`flex items-center justify-between gap-4 px-4 py-3 border-b last:border-b-0 ${
                            !feature.isEnabled ? "opacity-50 bg-muted/30" : ""
                          }`}
                        >
                          <div className="flex items-center gap-3 flex-1 ml-8">
                            <Switch
                              checked={feature.isEnabled}
                              onCheckedChange={() =>
                                toggleFeature(category.id, feature.id)
                              }
                              disabled={!category.isEnabled}
                            />
                            <span
                              className={
                                feature.isEnabled
                                  ? ""
                                  : "line-through text-muted-foreground"
                              }
                            >
                              {feature.name}
                            </span>
                            {feature.included ? (
                              <Badge variant="secondary" className="text-xs">
                                Включено
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-xs border-amber-500 text-amber-600"
                              >
                                Доп. опция
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              value={feature.price}
                              onChange={e =>
                                updateFeaturePrice(
                                  category.id,
                                  feature.id,
                                  parseInt(e.target.value) || 0
                                )
                              }
                              className="w-24 text-right"
                              disabled={!category.isEnabled || !feature.isEnabled}
                            />
                            <span className="text-muted-foreground text-sm w-10">
                              ₽
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
