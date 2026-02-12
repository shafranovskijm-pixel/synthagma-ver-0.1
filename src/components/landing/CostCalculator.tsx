import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Check,
  ArrowRight,
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
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";


interface FeatureModule {
  id: string;
  title: string;
  icon: React.ElementType;
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
  { 
    id: "courses", 
    title: "Управление курсами", 
    icon: BookOpen, 
    basePrice: 3000, 
    description: "Редактор с ИИ, импорт курсов", 
    featuresCount: 8, 
    isEnabled: true 
  },
  { 
    id: "students", 
    title: "Слушатели", 
    icon: Users, 
    basePrice: 2500, 
    description: "Импорт, рассылка, сбор документов", 
    featuresCount: 10, 
    isEnabled: true 
  },
  { 
    id: "companies", 
    title: "Компании", 
    icon: Building2, 
    basePrice: 1500, 
    description: "Группы, ссылки, договоры", 
    featuresCount: 6, 
    isEnabled: true 
  },
  { 
    id: "documents", 
    title: "Документооборот", 
    icon: FileCheck, 
    basePrice: 4000, 
    description: "Договоры, счета, акты", 
    featuresCount: 10, 
    isEnabled: true 
  },
  { 
    id: "journals", 
    title: "Журналы", 
    icon: ClipboardList, 
    basePrice: 2000, 
    description: "Посещаемость, оценки, экспорт", 
    featuresCount: 13, 
    isEnabled: true 
  },
  { 
    id: "frdo", 
    title: "ФРДО", 
    icon: Database, 
    basePrice: 5000, 
    description: "Автоматическая выгрузка", 
    featuresCount: 4, 
    isEnabled: true 
  },
  { 
    id: "links", 
    title: "Ссылки регистрации", 
    icon: LinkIcon, 
    basePrice: 1000, 
    description: "Уникальные ссылки", 
    featuresCount: 5, 
    isEnabled: true 
  },
  { 
    id: "library", 
    title: "Библиотека", 
    icon: Library, 
    basePrice: 1500, 
    description: "Хранилище материалов", 
    featuresCount: 4, 
    isEnabled: true 
  },
  { 
    id: "services", 
    title: "Магазин курсов", 
    icon: ShoppingBag, 
    basePrice: 500, 
    description: "Продажа и покупка курсов", 
    featuresCount: 3, 
    isEnabled: true 
  },
  { 
    id: "settings", 
    title: "Настройки", 
    icon: Settings, 
    basePrice: 0, 
    description: "Брендирование, права", 
    featuresCount: 5, 
    isEnabled: true 
  },
  { 
    id: "student_cabinet", 
    title: "Кабинет слушателя", 
    icon: GraduationCap, 
    basePrice: 2000, 
    description: "ИИ-консультант, озвучка", 
    featuresCount: 8, 
    isEnabled: true 
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" as const },
  },
};

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
      <section id="calculator" className="section-padding relative overflow-hidden">
        <div className="container mx-auto px-6 flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  return (
    <section id="calculator" className="section-padding relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-secondary/30 via-background to-secondary/30" />
      
      {/* Decorative pattern */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
        backgroundSize: '44px 44px'
      }} />
      
      {/* Decorative lines */}
      <motion.div 
        className="absolute top-28 right-[18%] w-px h-44 bg-gradient-to-b from-transparent via-accent/25 to-transparent"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5 }}
      />
      <motion.div 
        className="absolute top-40 right-[16%] w-px h-28 bg-gradient-to-b from-transparent via-accent/15 to-transparent"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, delay: 0.2 }}
      />
      <motion.div 
        className="absolute bottom-28 left-[12%] w-px h-36 bg-gradient-to-b from-transparent via-border to-transparent"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, delay: 0.4 }}
      />
      <motion.div 
        className="absolute top-1/3 left-[6%] w-20 h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, delay: 0.6 }}
      />
      <motion.div 
        className="absolute bottom-1/4 right-[10%] w-24 h-px bg-gradient-to-r from-transparent via-accent/15 to-transparent"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, delay: 0.8 }}
      />
      
      {/* Corner decorations */}
      <motion.div
        className="absolute top-16 left-10 w-20 h-20 border-l border-t border-accent/15 rounded-tl-3xl"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1 }}
      />
      <motion.div
        className="absolute bottom-16 right-10 w-20 h-20 border-r border-b border-accent/15 rounded-br-3xl"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.2 }}
      />
      <motion.div
        className="absolute top-1/2 left-8 w-12 h-12 border-l border-b border-accent/10 rounded-bl-2xl"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.4 }}
      />
      
      {/* Floating circles */}
      <motion.div
        className="absolute top-1/4 left-[22%] w-2.5 h-2.5 rounded-full bg-accent/20"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.5 }}
      />
      <motion.div
        className="absolute top-1/2 right-[28%] w-3 h-3 rounded-full border border-accent/20"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.7 }}
      />
      <motion.div
        className="absolute bottom-1/3 left-[28%] w-2 h-2 rounded-full bg-accent/25"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.9 }}
      />
      <motion.div
        className="absolute top-2/3 right-[35%] w-1.5 h-1.5 rounded-full bg-accent/30"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 1.1 }}
      />
      
      {/* Diamond shapes */}
      <motion.div
        className="absolute top-1/3 right-[32%] w-4 h-4 rotate-45 border border-accent/15"
        initial={{ opacity: 0, rotate: 0 }}
        whileInView={{ opacity: 1, rotate: 45 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 1 }}
      />
      <motion.div
        className="absolute bottom-1/4 left-[35%] w-3 h-3 rotate-45 border border-accent/10"
        initial={{ opacity: 0, rotate: 0 }}
        whileInView={{ opacity: 1, rotate: 45 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 1.2 }}
      />

      <div className="container mx-auto px-6 relative z-10">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <span className="text-sm text-accent font-medium tracking-widest uppercase mb-4 block">
            Стоимость
          </span>
          <h2 className="font-display text-4xl md:text-5xl font-medium mb-6 tracking-tight">Соберите свой тариф</h2>
          <div className="divider mb-6" />
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">Выберите только нужные модули</p>
          
          {/* Billing toggle */}
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-secondary border border-border">
            <button
              type="button"
              onClick={() => setIsYearly(false)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                !isYearly 
                  ? "bg-foreground text-background shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Помесячно
            </button>
            <button
              type="button"
              onClick={() => setIsYearly(true)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                isYearly 
                  ? "bg-foreground text-background shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              За год
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent/20 text-accent">
                -{Math.round(yearlyDiscount * 100)}%
              </span>
            </button>
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* Modules selection */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            className="lg:col-span-2 space-y-2"
          >
            {modules.map((module) => {
              const Icon = module.icon;
              const isSelected = selectedModules.has(module.id);
              
              return (
                <motion.div
                  key={module.id}
                  variants={itemVariants}
                  className={`relative rounded-xl p-4 transition-all duration-300 cursor-pointer border ${
                    isSelected
                      ? "bg-card border-accent/30"
                      : "bg-card/50 border-border/30 hover:border-border"
                  }`}
                  onClick={() => toggleModule(module.id)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                        isSelected ? "bg-accent/10" : "bg-secondary"
                      }`}>
                        <Icon className={`w-5 h-5 ${isSelected ? "text-accent" : "text-muted-foreground"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className={`font-medium text-sm ${isSelected ? '' : 'text-muted-foreground'}`}>
                          {module.title}
                        </h3>
                        <p className="text-xs text-muted-foreground truncate">
                          {module.description}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className={`font-medium text-sm ${isSelected ? '' : 'text-muted-foreground'}`}>
                          {module.basePrice > 0 ? `${module.basePrice.toLocaleString()} ₽` : 'Бесплатно'}
                        </div>
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
          </motion.div>

          {/* Price summary */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="lg:sticky lg:top-24 h-fit"
          >
            <div className="bg-foreground text-background rounded-2xl p-6 shadow-xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-background/10 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-background" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-medium">Ваш тариф</h3>
                  <p className="text-xs text-background/60">{selectedCount} модулей</p>
                </div>
              </div>

              <div className="space-y-3 mb-6 text-sm">
                <div className="flex justify-between items-center py-2 border-b border-background/10">
                  <span className="text-background/60">Функций:</span>
                  <span className="font-medium">{totalFeaturesCount}</span>
                </div>
              </div>

              <div className="bg-background/10 rounded-xl p-4 mb-6">
                <div className="text-center">
                  <div className="text-xs text-background/60 mb-1">
                    {isYearly ? "В месяц при оплате за год" : "Итого в месяц"}
                  </div>
                  <div className="flex items-baseline justify-center gap-2">
                    {isYearly && (
                      <span className="text-sm text-background/40 line-through">
                        {monthlyPrice.toLocaleString()}
                      </span>
                    )}
                    <span className="font-display text-3xl font-medium">
                      {totalPrice.toLocaleString()}
                    </span>
                    <span className="text-background/60">₽</span>
                  </div>
                  {isYearly && yearlySavings > 0 && (
                    <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded bg-accent/20 text-accent text-xs font-medium">
                      <Percent className="w-3 h-3" />
                      Экономия {yearlySavings.toLocaleString()} ₽/год
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Link to="/register-organization" className="block">
                  <Button
                    size="lg"
                    className="w-full rounded-lg h-12 font-medium gap-2 group bg-background text-foreground hover:bg-background/90"
                  >
                    Начать работу
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
              </div>

              {/* Features included */}
              <div className="mt-6 pt-6 border-t border-background/10">
                <p className="text-xs text-background/50 mb-3">Всегда включено:</p>
                <div className="space-y-2">
                  {["Техподдержка 24/7", "Обновления", "Бэкапы"].map((item) => (
                    <div key={item} className="flex items-center gap-2 text-xs text-background/70">
                      <Check className="w-3 h-3 text-accent" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Storage info */}
            <div className="mt-4 p-4 bg-card/50 rounded-xl border border-border/30">
              <div className="flex items-start gap-3">
                <Database className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <p>
                    <span className="text-foreground font-medium">Хранилище: 1 ГБ</span> в стандартном тарифе
                  </p>
                  <p>
                    Далее: <span className="text-foreground">250 ₽</span> за 1 ГБ
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Trust indicators */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-20 text-center"
        >
          <div className="flex flex-wrap justify-center gap-8 text-sm text-muted-foreground">
            {["Соответствие 273-ФЗ", "Защита данных", "99.9% SLA"].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <Check className="w-4 h-4 text-accent" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
