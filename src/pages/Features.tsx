import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, CheckCircle2, Calculator, Sparkles } from "lucide-react";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { supabase } from "@/integrations/supabase/client";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import {
  type FeatureCategory, iconMap, colorMap, getDefaultFeatures, generateFeaturesPdfHtml,
} from "./featuresData";

export default function Features() {
  const [features, setFeatures] = useState<FeatureCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchFeaturesFromDB(); }, []);

  const fetchFeaturesFromDB = async () => {
    try {
      const [categoriesResult, featuresResult] = await Promise.all([
        supabase.from("system_feature_categories").select("*"),
        supabase.from("system_features").select("*"),
      ]);
      const defaultFeatures = getDefaultFeatures();
      const mergedFeatures = defaultFeatures.map(category => {
        const dbCategory = categoriesResult.data?.find(c => c.category_id === category.id);
        return {
          ...category,
          icon: iconMap[category.id] || category.icon,
          color: colorMap[category.id] || category.color,
          basePrice: dbCategory?.base_price ?? category.basePrice,
          isEnabled: dbCategory?.is_enabled ?? true,
          features: category.features.map(feature => {
            const dbFeature = featuresResult.data?.find(f => f.feature_id === feature.id);
            return { ...feature, price: dbFeature?.price ?? feature.price, isEnabled: dbFeature?.is_enabled ?? true };
          }),
        };
      });
      const enabledFeatures = mergedFeatures
        .filter(cat => cat.isEnabled)
        .map(cat => ({ ...cat, features: cat.features.filter(f => f.isEnabled) }));
      setFeatures(enabledFeatures);
    } catch (error) {
      console.error("Error fetching features:", error);
      setFeatures(getDefaultFeatures());
    } finally { setLoading(false); }
  };

  const totalModules = features.length;
  const totalFeatures = features.reduce((sum, cat) => sum + cat.features.length, 0);
  const baseMonthlyPrice = features.reduce((sum, cat) => sum + cat.basePrice, 0);
  const additionalPrice = features.reduce((sum, cat) =>
    sum + cat.features.filter(f => !f.included).reduce((s, f) => s + f.price, 0), 0);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><SigmaSpinner size="lg" /></div>;
  }

  const generatePDF = () => {
    const html = generateFeaturesPdfHtml(features, { totalModules, totalFeatures, baseMonthlyPrice });
    const printWindow = window.open('', '_blank');
    if (printWindow) { printWindow.document.write(html); printWindow.document.close(); printWindow.onload = () => printWindow.print(); }
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

      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 lg:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link to="/" className="flex items-center gap-2"><SigmaLogo size="sm" /><span className="font-display font-bold text-lg hidden sm:block">Синтагма</span></Link>
              <span className="text-muted-foreground">/</span>
              <span className="font-medium">Функции и тарифы</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={generatePDF} className="rounded-xl"><Download className="w-4 h-4 mr-2" />PDF</Button>
              <Link to="/"><Button variant="ghost" size="sm" className="rounded-xl"><ArrowLeft className="w-4 h-4 mr-2" />На главную</Button></Link>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 lg:px-6 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { value: totalModules, label: "модулей", color: "text-primary" },
            { value: totalFeatures, label: "функций", color: "text-primary" },
            { value: `${baseMonthlyPrice.toLocaleString()} ₽`, label: "базовая / мес", color: "text-green-500" },
            { value: `+${additionalPrice.toLocaleString()} ₽`, label: "доп. опции", color: "text-amber-500" },
          ].map((s, i) => (
            <div key={i} className="bg-card rounded-2xl border border-border p-4 text-center">
              <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-sm text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Calculator Preview */}
        <div className="bg-gradient-to-r from-primary/10 via-accent/5 to-primary/10 rounded-2xl border border-primary/20 p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center"><Calculator className="w-5 h-5 text-primary" /></div>
            <div><h2 className="font-semibold">Калькулятор стоимости</h2><p className="text-sm text-muted-foreground">Выберите нужные модули для расчёта</p></div>
          </div>
          <div className="flex items-center justify-between">
            <div><span className="text-2xl font-bold">{(baseMonthlyPrice + additionalPrice).toLocaleString()} ₽</span><span className="text-muted-foreground ml-2">/ месяц</span></div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="w-4 h-4" /><span>Все функции включены</span></div>
          </div>
        </div>

        {/* Features List */}
        <div className="space-y-6">
          {features.map((category) => {
            const Icon = category.icon;
            const categoryTotal = category.basePrice + category.features.filter(f => !f.included).reduce((s, f) => s + f.price, 0);
            return (
              <div key={category.id} className="bg-card rounded-2xl border border-border overflow-hidden">
                <div className="flex items-center justify-between p-4 bg-secondary/30" style={{ borderLeft: `4px solid ${category.color}` }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${category.color}20` }}>
                      <Icon className="w-5 h-5" style={{ color: category.color }} />
                    </div>
                    <div><h3 className="font-semibold">{category.title}</h3><p className="text-sm text-muted-foreground">{category.features.length} функций</p></div>
                  </div>
                  <div className="text-right"><div className="font-semibold text-lg">{category.basePrice.toLocaleString()} ₽<span className="text-sm font-normal text-muted-foreground">/мес</span></div></div>
                </div>
                <div className="divide-y divide-border">
                  {category.features.map((feature) => (
                    <div key={feature.id} className="flex items-center justify-between p-3 px-4 hover:bg-secondary/20 transition-colors">
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
                <div className="flex items-center justify-between p-3 px-4 bg-secondary/50" style={{ borderTop: `2px solid ${category.color}30` }}>
                  <span className="text-sm font-medium text-muted-foreground">Итого по модулю:</span>
                  <span className="font-semibold" style={{ color: category.color }}>{categoryTotal.toLocaleString()} ₽/мес</span>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
