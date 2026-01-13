import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
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
  Copy,
  RotateCcw,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface OrgFeaturesTabProps {
  organizationId: string;
  organizationName: string;
}

interface FeatureItem {
  id: string;
  name: string;
  isEnabled: boolean;
  isGloballyEnabled: boolean;
}

interface FeatureCategory {
  id: string;
  title: string;
  icon: React.ElementType;
  color: string;
  isEnabled: boolean;
  isGloballyEnabled: boolean;
  features: FeatureItem[];
}

const getDefaultFeatures = (): FeatureCategory[] => [
  {
    id: "courses",
    title: "Управление курсами",
    icon: BookOpen,
    color: "#6366f1",
    isEnabled: true,
    isGloballyEnabled: true,
    features: [
      { id: "courses_create", name: "Создание и редактирование курсов", isEnabled: true, isGloballyEnabled: true },
      { id: "courses_publish", name: "Публикация и снятие с публикации", isEnabled: true, isGloballyEnabled: true },
      { id: "courses_categories", name: "Категории курсов с цветовой маркировкой", isEnabled: true, isGloballyEnabled: true },
      { id: "courses_lessons", name: "Конструктор уроков (лекции, тесты, видео)", isEnabled: true, isGloballyEnabled: true },
      { id: "courses_import", name: "Импорт курсов из внешних источников", isEnabled: true, isGloballyEnabled: true },
      { id: "courses_ai", name: "ИИ-генерация контента курсов", isEnabled: true, isGloballyEnabled: true },
      { id: "courses_preview", name: "Предпросмотр курса перед публикацией", isEnabled: true, isGloballyEnabled: true },
      { id: "courses_duration", name: "Управление продолжительностью обучения", isEnabled: true, isGloballyEnabled: true },
    ],
  },
  {
    id: "students",
    title: "Управление слушателями",
    icon: Users,
    color: "#10b981",
    isEnabled: true,
    isGloballyEnabled: true,
    features: [
      { id: "students_add", name: "Добавление слушателей вручную", isEnabled: true, isGloballyEnabled: true },
      { id: "students_import", name: "Массовый импорт из Excel", isEnabled: true, isGloballyEnabled: true },
      { id: "students_enroll", name: "Зачисление на курсы", isEnabled: true, isGloballyEnabled: true },
      { id: "students_progress", name: "Отслеживание прогресса обучения", isEnabled: true, isGloballyEnabled: true },
      { id: "students_card", name: "Карточка слушателя", isEnabled: true, isGloballyEnabled: true },
      { id: "students_credentials", name: "Генерация логинов и паролей", isEnabled: true, isGloballyEnabled: true },
      { id: "students_email", name: "Отправка учётных данных по Email", isEnabled: true, isGloballyEnabled: true },
      { id: "students_companies", name: "Привязка к компаниям", isEnabled: true, isGloballyEnabled: true },
      { id: "students_bulk", name: "Массовые операции", isEnabled: true, isGloballyEnabled: true },
      { id: "students_filter", name: "Фильтрация по статусу", isEnabled: true, isGloballyEnabled: true },
    ],
  },
  {
    id: "companies",
    title: "Компании (юридические лица)",
    icon: Building2,
    color: "#f59e0b",
    isEnabled: true,
    isGloballyEnabled: true,
    features: [
      { id: "companies_list", name: "Справочник компаний-заказчиков", isEnabled: true, isGloballyEnabled: true },
      { id: "companies_requisites", name: "Полные реквизиты", isEnabled: true, isGloballyEnabled: true },
      { id: "companies_bank", name: "Банковские реквизиты", isEnabled: true, isGloballyEnabled: true },
      { id: "companies_stamp", name: "Загрузка печати и подписи", isEnabled: true, isGloballyEnabled: true },
      { id: "companies_docs", name: "Документы компаний", isEnabled: true, isGloballyEnabled: true },
      { id: "companies_students", name: "Привязка слушателей", isEnabled: true, isGloballyEnabled: true },
    ],
  },
  {
    id: "documents",
    title: "Документооборот",
    icon: FileCheck,
    color: "#ec4899",
    isEnabled: true,
    isGloballyEnabled: true,
    features: [
      { id: "docs_contracts", name: "Генератор договоров", isEnabled: true, isGloballyEnabled: true },
      { id: "docs_templates", name: "Редактор шаблонов", isEnabled: true, isGloballyEnabled: true },
      { id: "docs_consent", name: "Генератор согласий ПДн", isEnabled: true, isGloballyEnabled: true },
      { id: "docs_acts", name: "Генератор актов", isEnabled: true, isGloballyEnabled: true },
      { id: "docs_invoices", name: "Генератор счетов", isEnabled: true, isGloballyEnabled: true },
      { id: "docs_issuance", name: "Журнал выдачи документов", isEnabled: true, isGloballyEnabled: true },
      { id: "docs_orders", name: "Архив приказов", isEnabled: true, isGloballyEnabled: true },
      { id: "docs_bulk", name: "Массовая загрузка", isEnabled: true, isGloballyEnabled: true },
      { id: "docs_student", name: "Документы слушателей", isEnabled: true, isGloballyEnabled: true },
      { id: "docs_journal", name: "Экспорт классного журнала", isEnabled: true, isGloballyEnabled: true },
    ],
  },
  {
    id: "journals",
    title: "Журналы учёта",
    icon: ClipboardList,
    color: "#8b5cf6",
    isEnabled: true,
    isGloballyEnabled: true,
    features: [
      { id: "journal_attendance_auto", name: "Журнал посещаемости (авто)", isEnabled: true, isGloballyEnabled: true },
      { id: "journal_attendance_manual", name: "Журнал посещаемости (ручной)", isEnabled: true, isGloballyEnabled: true },
      { id: "journal_grades", name: "Журнал текущего контроля", isEnabled: true, isGloballyEnabled: true },
      { id: "journal_attestation", name: "Журнал итоговой аттестации", isEnabled: true, isGloballyEnabled: true },
      { id: "journal_docs", name: "Журнал регистрации документов", isEnabled: true, isGloballyEnabled: true },
      { id: "journal_blanks", name: "Журнал бланков", isEnabled: true, isGloballyEnabled: true },
      { id: "journal_copies", name: "Журнал копий/дубликатов", isEnabled: true, isGloballyEnabled: true },
      { id: "journal_custom", name: "Пользовательские журналы", isEnabled: true, isGloballyEnabled: true },
      { id: "journal_export", name: "Экспорт журналов", isEnabled: true, isGloballyEnabled: true },
    ],
  },
  {
    id: "frdo",
    title: "ФРДО (Федеральный реестр)",
    icon: Database,
    color: "#06b6d4",
    isEnabled: true,
    isGloballyEnabled: true,
    features: [
      { id: "frdo_manage", name: "Управление данными ФРДО", isEnabled: true, isGloballyEnabled: true },
      { id: "frdo_check", name: "Проверка полноты данных", isEnabled: true, isGloballyEnabled: true },
      { id: "frdo_bulk", name: "Массовый экспорт ФРДО", isEnabled: true, isGloballyEnabled: true },
      { id: "frdo_single", name: "Индивидуальный экспорт", isEnabled: true, isGloballyEnabled: true },
    ],
  },
  {
    id: "links",
    title: "Ссылки регистрации",
    icon: LinkIcon,
    color: "#14b8a6",
    isEnabled: true,
    isGloballyEnabled: true,
    features: [
      { id: "links_generate", name: "Генерация ссылок", isEnabled: true, isGloballyEnabled: true },
      { id: "links_courses", name: "Привязка к курсам", isEnabled: true, isGloballyEnabled: true },
      { id: "links_companies", name: "Привязка к компаниям", isEnabled: true, isGloballyEnabled: true },
      { id: "links_stats", name: "Отслеживание использования", isEnabled: true, isGloballyEnabled: true },
      { id: "links_expire", name: "Срок действия", isEnabled: true, isGloballyEnabled: true },
    ],
  },
  {
    id: "library",
    title: "Библиотека",
    icon: Library,
    color: "#f97316",
    isEnabled: true,
    isGloballyEnabled: true,
    features: [
      { id: "library_files", name: "Хранение материалов", isEnabled: true, isGloballyEnabled: true },
      { id: "library_folders", name: "Организация по папкам", isEnabled: true, isGloballyEnabled: true },
      { id: "library_formats", name: "Различные форматы", isEnabled: true, isGloballyEnabled: true },
      { id: "library_access", name: "Доступ для слушателей", isEnabled: true, isGloballyEnabled: true },
    ],
  },
  {
    id: "services",
    title: "Услуги",
    icon: ShoppingBag,
    color: "#84cc16",
    isEnabled: true,
    isGloballyEnabled: true,
    features: [
      { id: "services_catalog", name: "Каталог услуг", isEnabled: true, isGloballyEnabled: true },
      { id: "services_orders", name: "Заказ услуг", isEnabled: true, isGloballyEnabled: true },
      { id: "services_status", name: "Отслеживание статусов", isEnabled: true, isGloballyEnabled: true },
    ],
  },
  {
    id: "settings",
    title: "Настройки системы",
    icon: Settings,
    color: "#64748b",
    isEnabled: true,
    isGloballyEnabled: true,
    features: [
      { id: "settings_requisites", name: "Реквизиты организации", isEnabled: true, isGloballyEnabled: true },
      { id: "settings_theme", name: "Темы оформления", isEnabled: true, isGloballyEnabled: true },
      { id: "settings_menu", name: "Настройки меню", isEnabled: true, isGloballyEnabled: true },
      { id: "settings_student", name: "Настройки кабинета", isEnabled: true, isGloballyEnabled: true },
      { id: "settings_notifications", name: "Уведомления", isEnabled: true, isGloballyEnabled: true },
    ],
  },
  {
    id: "student_cabinet",
    title: "Кабинет слушателя",
    icon: GraduationCap,
    color: "#0ea5e9",
    isEnabled: true,
    isGloballyEnabled: true,
    features: [
      { id: "cabinet_courses", name: "Прохождение курсов", isEnabled: true, isGloballyEnabled: true },
      { id: "cabinet_tests", name: "Тестирование", isEnabled: true, isGloballyEnabled: true },
      { id: "cabinet_docs", name: "Загрузка документов", isEnabled: true, isGloballyEnabled: true },
      { id: "cabinet_consent", name: "Подписание согласий", isEnabled: true, isGloballyEnabled: true },
      { id: "cabinet_video", name: "Видеоидентификация", isEnabled: true, isGloballyEnabled: true },
      { id: "cabinet_achievements", name: "Достижения", isEnabled: true, isGloballyEnabled: true },
      { id: "cabinet_ai", name: "ИИ-помощник", isEnabled: true, isGloballyEnabled: true },
      { id: "cabinet_progress", name: "Просмотр прогресса", isEnabled: true, isGloballyEnabled: true },
    ],
  },
];

export function OrgFeaturesTab({ organizationId, organizationName }: OrgFeaturesTabProps) {
  const [features, setFeatures] = useState<FeatureCategory[]>(getDefaultFeatures);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const [showResetDialog, setShowResetDialog] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, [organizationId]);

  const fetchSettings = async () => {
    try {
      // Fetch global settings and organization-specific settings
      const [
        globalCategoriesResult,
        globalFeaturesResult,
        orgCategoriesResult,
        orgFeaturesResult,
      ] = await Promise.all([
        supabase.from("system_feature_categories").select("*"),
        supabase.from("system_features").select("*"),
        supabase.from("organization_feature_categories").select("*").eq("organization_id", organizationId),
        supabase.from("organization_features").select("*").eq("organization_id", organizationId),
      ]);

      const defaultFeatures = getDefaultFeatures();

      // Merge with global and org settings
      const mergedFeatures = defaultFeatures.map(category => {
        const globalCat = globalCategoriesResult.data?.find(c => c.category_id === category.id);
        const orgCat = orgCategoriesResult.data?.find(c => c.category_id === category.id);
        const isGloballyEnabled = globalCat?.is_enabled ?? true;
        
        return {
          ...category,
          isGloballyEnabled,
          isEnabled: orgCat?.is_enabled ?? isGloballyEnabled,
          features: category.features.map(feature => {
            const globalFeature = globalFeaturesResult.data?.find(f => f.feature_id === feature.id);
            const orgFeature = orgFeaturesResult.data?.find(f => f.feature_id === feature.id);
            const featureGloballyEnabled = globalFeature?.is_enabled ?? true;
            
            return {
              ...feature,
              isGloballyEnabled: featureGloballyEnabled,
              isEnabled: orgFeature?.is_enabled ?? featureGloballyEnabled,
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
      for (const cat of features) {
        const { error } = await supabase
          .from("organization_feature_categories")
          .upsert(
            {
              organization_id: organizationId,
              category_id: cat.id,
              is_enabled: cat.isEnabled,
            },
            { onConflict: "organization_id,category_id" }
          );
        if (error) throw error;
      }

      // Upsert features
      for (const cat of features) {
        for (const feature of cat.features) {
          const { error } = await supabase
            .from("organization_features")
            .upsert(
              {
                organization_id: organizationId,
                category_id: cat.id,
                feature_id: feature.id,
                is_enabled: feature.isEnabled,
              },
              { onConflict: "organization_id,feature_id" }
            );
          if (error) throw error;
        }
      }

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

  const handleReset = async () => {
    setSaving(true);
    try {
      // Delete all org-specific settings
      await Promise.all([
        supabase.from("organization_feature_categories").delete().eq("organization_id", organizationId),
        supabase.from("organization_features").delete().eq("organization_id", organizationId),
      ]);

      toast({
        title: "Успешно",
        description: "Настройки сброшены до глобальных",
      });
      
      setShowResetDialog(false);
      fetchSettings();
    } catch (error) {
      console.error("Error resetting settings:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось сбросить настройки",
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

  const toggleCategoryOpen = (categoryId: string) => {
    setOpenCategories(prev => ({ ...prev, [categoryId]: !prev[categoryId] }));
  };

  const enabledModules = features.filter(c => c.isEnabled).length;
  const totalFeatures = features.reduce(
    (sum, cat) => sum + cat.features.filter(f => f.isEnabled).length,
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
          <h3 className="text-lg font-semibold">Функции для {organizationName}</h3>
          <p className="text-sm text-muted-foreground">
            {enabledModules} модулей, {totalFeatures} функций активно
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowResetDialog(true)} disabled={saving}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Сбросить
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Сохранить
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[500px]">
        <div className="space-y-2 pr-4">
          {features.map(category => {
            const Icon = category.icon;
            const isOpen = openCategories[category.id];
            const enabledFeaturesCount = category.features.filter(f => f.isEnabled).length;

            return (
              <Card
                key={category.id}
                className={`transition-all ${
                  !category.isEnabled ? "opacity-50" : ""
                } ${!category.isGloballyEnabled ? "border-dashed border-destructive/50" : ""}`}
              >
                <Collapsible open={isOpen} onOpenChange={() => toggleCategoryOpen(category.id)}>
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <CollapsibleTrigger asChild>
                        <button className="flex items-center gap-2 flex-1 text-left hover:opacity-80 transition-opacity">
                          {isOpen ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ backgroundColor: `${category.color}20` }}
                          >
                            <Icon className="w-4 h-4" style={{ color: category.color }} />
                          </div>
                          <div className="flex-1">
                            <div className="font-medium text-sm flex items-center gap-2">
                              {category.title}
                              {!category.isGloballyEnabled && (
                                <Badge variant="outline" className="text-xs border-destructive text-destructive">
                                  Отключено глобально
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {enabledFeaturesCount} из {category.features.length} функций
                            </div>
                          </div>
                        </button>
                      </CollapsibleTrigger>

                      <Switch
                        checked={category.isEnabled}
                        onCheckedChange={() => toggleCategory(category.id)}
                        disabled={!category.isGloballyEnabled}
                      />
                    </div>
                  </div>

                  <CollapsibleContent>
                    <div className="border-t">
                      {category.features.map(feature => (
                        <div
                          key={feature.id}
                          className={`flex items-center justify-between gap-3 px-3 py-2 border-b last:border-b-0 ${
                            !feature.isEnabled ? "opacity-50 bg-muted/30" : ""
                          }`}
                        >
                          <div className="flex items-center gap-2 flex-1 ml-10">
                            <span className={`text-sm ${!feature.isEnabled ? "line-through text-muted-foreground" : ""}`}>
                              {feature.name}
                            </span>
                            {!feature.isGloballyEnabled && (
                              <Badge variant="outline" className="text-xs border-destructive text-destructive">
                                Откл.
                              </Badge>
                            )}
                          </div>

                          <Switch
                            checked={feature.isEnabled}
                            onCheckedChange={() => toggleFeature(category.id, feature.id)}
                            disabled={!category.isEnabled || !feature.isGloballyEnabled}
                          />
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

      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Сбросить настройки?</AlertDialogTitle>
            <AlertDialogDescription>
              Все индивидуальные настройки функций для этой организации будут удалены. 
              Будут применены глобальные настройки системы.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>Сбросить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
