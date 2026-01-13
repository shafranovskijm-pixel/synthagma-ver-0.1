import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Check,
  ArrowRight,
  Calculator,
  Sparkles,
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
  Loader2,
  Percent,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ScrollReveal, ScrollRevealGroup, scrollRevealItem } from "@/components/ui/ScrollReveal";
import { supabase } from "@/integrations/supabase/client";

interface FeatureModule {
  id: string;
  title: string;
  icon: React.ElementType;
  color: string;
  basePrice: number;
  description: string;
  featuresCount: number;
  isEnabled: boolean;
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

const defaultModules: FeatureModule[] = [
  { id: "courses", title: "Управление курсами", icon: BookOpen, color: "#6366f1", basePrice: 3000, description: "Современный редактор вместе с ИИ поможет превратить даже скучную лекцию в удобный и интерактивный формат. Удобный импорт с других платформ", featuresCount: 8, isEnabled: true },
  { id: "students", title: "Слушатели", icon: Users, color: "#10b981", basePrice: 2500, description: "Импортируй большими файлами, автоматическая рассылка логинов и паролей. Получай документы: СНИЛС, документ об образовании, паспорт. Отправляй напоминания", featuresCount: 10, isEnabled: true },
  { id: "companies", title: "Компании", icon: Building2, color: "#f59e0b", basePrice: 1500, description: "Создавайте ссылки и привязывайте группы учеников к компании. Храните договоры, счета, акты в одном месте", featuresCount: 6, isEnabled: true },
  { id: "documents", title: "Документооборот", icon: FileCheck, color: "#ec4899", basePrice: 4000, description: "Автоматическое создание договоров, счетов, актов. Сбор согласий на обработку ПД, журналы выдачи документов, приказы о зачислении/отчислении", featuresCount: 10, isEnabled: true },
  { id: "journals", title: "Журналы", icon: ClipboardList, color: "#8b5cf6", basePrice: 2000, description: "Все ваши журналы в одном месте с возможностью выгрузки в Excel. Журналы посещаемости, оценок, выдачи документов", featuresCount: 13, isEnabled: true },
  { id: "frdo", title: "ФРДО", icon: Database, color: "#06b6d4", basePrice: 5000, description: "Устали вносить вручную? Система заполнит за вас. Готовы к интеграции с ЕР ЦРДО", featuresCount: 4, isEnabled: true },
  { id: "links", title: "Ссылки регистрации", icon: LinkIcon, color: "#14b8a6", basePrice: 1000, description: "Уникальные ссылки для быстрой регистрации учеников", featuresCount: 5, isEnabled: true },
  { id: "library", title: "Библиотека", icon: Library, color: "#f97316", basePrice: 1500, description: "Храните учебные материалы, программы и методички", featuresCount: 4, isEnabled: true },
  { id: "services", title: "Магазин курсов", icon: ShoppingBag, color: "#84cc16", basePrice: 500, description: "Продавайте свои курсы или закажите готовую программу", featuresCount: 3, isEnabled: true },
  { id: "settings", title: "Настройки", icon: Settings, color: "#64748b", basePrice: 0, description: "Настройки системы и брендирование", featuresCount: 5, isEnabled: true },
  { id: "student_cabinet", title: "Кабинет слушателя", icon: GraduationCap, color: "#0ea5e9", basePrice: 2000, description: "ИИ-помощник проконсультирует учеников, озвучивание лекций, удобное прохождение курсов", featuresCount: 8, isEnabled: true },
];

export function CostCalculator() {
  const [modules, setModules] = useState<FeatureModule[]>(defaultModules);
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set(defaultModules.map(m => m.id)));
  const [loading, setLoading] = useState(true);
  const [isYearly, setIsYearly] = useState(false);
  const [yearlyDiscount, setYearlyDiscount] = useState(0.20);

  useEffect(() => {
    fetchModulesFromDB();
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
        setYearlyDiscount((data.value as { percentage: number }).percentage / 100);
      }
    } catch (error) {
      console.error("Error fetching yearly discount:", error);
    }
  };

  const fetchModulesFromDB = async () => {
    try {
      const { data: categories } = await supabase
        .from("system_feature_categories")
        .select("*");

      if (categories && categories.length > 0) {
        const updatedModules = defaultModules.map(module => {
          const dbCategory = categories.find(c => c.category_id === module.id);
          return {
            ...module,
            basePrice: dbCategory?.base_price ?? module.basePrice,
            isEnabled: dbCategory?.is_enabled ?? true,
          };
        }).filter(m => m.isEnabled);

        setModules(updatedModules);
        setSelectedModules(new Set(updatedModules.map(m => m.id)));
      }
    } catch (error) {
      console.error("Error fetching modules:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleModule = (moduleId: string) => {
    const newSelected = new Set(selectedModules);
    if (newSelected.has(moduleId)) {
      newSelected.delete(moduleId);
    } else {
      newSelected.add(moduleId);
    }
    setSelectedModules(newSelected);
  };

  const monthlyPrice = modules
    .filter(m => selectedModules.has(m.id))
    .reduce((sum, m) => sum + m.basePrice, 0);

  const yearlyMonthlyPrice = Math.round(monthlyPrice * (1 - yearlyDiscount));
  const yearlySavings = (monthlyPrice - yearlyMonthlyPrice) * 12;
  const totalPrice = isYearly ? yearlyMonthlyPrice : monthlyPrice;

  const selectedCount = selectedModules.size;
  const totalFeaturesCount = modules
    .filter(m => selectedModules.has(m.id))
    .reduce((sum, m) => sum + m.featuresCount, 0);

  if (loading) {
    return (
      <section id="calculator" className="py-32 relative overflow-hidden bg-gradient-to-b from-secondary/20 via-background to-secondary/20">
        <div className="container mx-auto px-6 flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  return (
    <section id="calculator" className="py-32 relative overflow-hidden bg-gradient-to-b from-secondary/20 via-background to-secondary/20">
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <span className="hieroglyphic absolute top-20 left-16 text-5xl text-accent/20 animate-pulse-soft">𓊀</span>
        <span className="hieroglyphic absolute top-1/3 right-10 text-4xl text-primary/15 animate-pulse-soft delay-200">𓉀</span>
        <span className="hieroglyphic absolute bottom-32 left-1/3 text-6xl text-accent/15 animate-pulse-soft delay-300">𓇀</span>
        <span className="greek-text absolute top-1/2 right-8 text-sm text-primary/20 rotate-90">ΑΞΙΑ</span>
      </div>
      
      {/* Gradient orbs */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-gradient-to-br from-accent/10 to-transparent rounded-full blur-3xl" />

      <div className="container mx-auto px-6 relative z-10">
        {/* Section header */}
        <ScrollReveal className="text-center mb-16">
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-gradient-to-r from-accent/15 to-primary/10 border border-accent/30 mb-8 backdrop-blur-sm">
            <Calculator className="w-5 h-5 text-accent" />
            <span className="text-sm font-semibold text-foreground">Калькулятор стоимости</span>
            <span className="hieroglyphic text-accent text-lg">𓇀</span>
          </div>
          <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">
            Соберите <span className="gradient-text-gold">свой тариф</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Выберите только нужные модули и платите за то, что используете
          </p>
          
          {/* Billing toggle */}
          <div className="inline-flex items-center gap-4 p-2 rounded-2xl bg-card/80 border border-border backdrop-blur-sm">
            <button
              onClick={() => setIsYearly(false)}
              className={`px-6 py-2.5 rounded-xl font-medium transition-all ${
                !isYearly 
                  ? "bg-primary text-primary-foreground shadow-md" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Помесячно
            </button>
            <button
              onClick={() => setIsYearly(true)}
              className={`px-6 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 ${
                isYearly 
                  ? "bg-primary text-primary-foreground shadow-md" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Calendar className="w-4 h-4" />
              За год
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                isYearly 
                  ? "bg-primary-foreground/20 text-primary-foreground" 
                  : "bg-green-500/20 text-green-500"
              }`}>
                -{Math.round(yearlyDiscount * 100)}%
              </span>
            </button>
          </div>
          
          <div className="egyptian-border w-32 mx-auto mt-8 rounded-full" />
        </ScrollReveal>

        <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* Modules selection */}
          <ScrollRevealGroup className="lg:col-span-2 space-y-3" staggerDelay={0.05}>
            {modules.map((module) => {
              const Icon = module.icon;
              const isSelected = selectedModules.has(module.id);
              
              return (
                <motion.div
                  key={module.id}
                  variants={scrollRevealItem}
                  className={`relative rounded-2xl p-4 transition-all duration-300 cursor-pointer border ${
                    isSelected
                      ? "bg-card/90 border-primary/40 shadow-lg"
                      : "bg-card/50 border-border/50 hover:border-primary/20"
                  }`}
                  onClick={() => toggleModule(module.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div 
                        className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                          isSelected ? "shadow-md" : "opacity-60"
                        }`}
                        style={{ backgroundColor: isSelected ? `${module.color}20` : 'hsl(var(--secondary))' }}
                      >
                        <Icon 
                          className="w-6 h-6" 
                          style={{ color: isSelected ? module.color : 'hsl(var(--muted-foreground))' }} 
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className={`font-semibold ${isSelected ? '' : 'text-muted-foreground'}`}>
                          {module.title}
                        </h3>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {module.description}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className={`font-semibold ${isSelected ? '' : 'text-muted-foreground'}`}>
                          {module.basePrice > 0 ? `${module.basePrice.toLocaleString()} ₽` : 'Бесплатно'}
                        </div>
                        {module.basePrice > 0 && (
                          <div className="text-xs text-muted-foreground">/ месяц</div>
                        )}
                      </div>
                      <Switch 
                        checked={isSelected} 
                        onCheckedChange={() => toggleModule(module.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </ScrollRevealGroup>

          {/* Price summary */}
          <ScrollReveal delay={0.3} className="lg:sticky lg:top-24 h-fit">
            <div className="bg-gradient-to-b from-primary/15 via-[hsl(185_100%_45%/0.1)] to-accent/10 border-2 border-primary/40 rounded-3xl p-6 shadow-xl">
              {/* Hieroglyph watermark */}
              <span className="hieroglyphic absolute top-4 right-4 text-4xl text-accent/20">𓃀</span>
              
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary via-[hsl(185_100%_45%)] to-accent flex items-center justify-center sigma-glow">
                  <Sparkles className="w-6 h-6 text-foreground" />
                </div>
                <div>
                  <h3 className="font-display text-xl font-bold">Ваш тариф</h3>
                  <p className="text-sm text-muted-foreground">Индивидуальный</p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex justify-between items-center py-2 border-b border-primary/20">
                  <span className="text-muted-foreground">Модулей:</span>
                  <span className="font-semibold">{selectedCount} из {modules.length}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-primary/20">
                  <span className="text-muted-foreground">Функций:</span>
                  <span className="font-semibold">{totalFeaturesCount}</span>
                </div>
              </div>

              <div className="bg-background/50 rounded-2xl p-4 mb-6">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-1">
                    {isYearly ? "Итого в месяц (при оплате за год):" : "Итого в месяц:"}
                  </div>
                  <div className="flex items-baseline justify-center gap-2">
                    {isYearly && (
                      <span className="text-lg text-muted-foreground line-through">
                        {monthlyPrice.toLocaleString()} ₽
                      </span>
                    )}
                    <span className="font-display text-4xl font-bold gradient-text">
                      {totalPrice.toLocaleString()}
                    </span>
                    <span className="text-xl text-muted-foreground">₽</span>
                  </div>
                  {isYearly && yearlySavings > 0 && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 text-green-500 text-sm font-medium">
                      <Percent className="w-3.5 h-3.5" />
                      Экономия {yearlySavings.toLocaleString()} ₽ в год
                    </div>
                  )}
                </div>
                
                {isYearly && (
                  <div className="mt-4 pt-4 border-t border-primary/10 text-center">
                    <div className="text-sm text-muted-foreground">Стоимость за год:</div>
                    <div className="font-semibold text-lg">
                      {(totalPrice * 12).toLocaleString()} ₽
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <Link to="/register-organization" className="block">
                  <Button
                    size="lg"
                    className="w-full rounded-xl h-12 font-semibold gap-2 group btn-gradient shadow-lg sigma-glow"
                  >
                    <span>Начать работу</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                
                <Link to="/features" className="block">
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full rounded-xl h-12 font-semibold gap-2 border-primary/30 hover:bg-primary/10"
                  >
                    Все функции подробно
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>

              {/* Features included */}
              <div className="mt-6 pt-6 border-t border-primary/20">
                <p className="text-sm text-muted-foreground mb-3">Всегда включено:</p>
                <div className="space-y-2">
                  {["Техподдержка 24/7", "Обновления системы", "Резервное копирование"].map((item) => (
                    <div key={item} className="flex items-center gap-2 text-sm">
                      <div className="w-4 h-4 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-foreground" />
                      </div>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>

        {/* Trust indicators */}
        <ScrollReveal delay={0.4} className="mt-20 text-center">
          <p className="text-muted-foreground mb-6">Нам доверяют образовательные организации по всей России</p>
          <div className="flex flex-wrap justify-center gap-8">
            {["Соответствие 273-ФЗ", "Защита данных", "Техподдержка 24/7", "99.9% SLA"].map((item, index) => (
              <div key={item} className="flex items-center gap-2 opacity-80">
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <Check className="w-3 h-3 text-foreground" />
                </div>
                <span className="font-medium">{item}</span>
                {index < 3 && <span className="hieroglyphic text-accent/30 ml-4">𓆀</span>}
              </div>
            ))}
          </div>
          
          <div className="greek-text text-center mt-8 text-primary/15 text-xs tracking-[0.5em]">
            ΠΙΣΤΙΣ • ΑΞΙΟΠΙΣΤΙΑ • ΠΟΙΟΤΗΤΑ
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
