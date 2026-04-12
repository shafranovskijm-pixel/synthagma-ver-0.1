import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { SUBSCRIPTION_PLANS, type SubscriptionPlan, type PlanInfo, formatStorageSize, YEARLY_DISCOUNT } from "@/constants/subscriptionPlans";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Crown, BookOpen, Users, HardDrive, Sparkles, Check, X,
  Palette, Video, FileCheck, Brain, FileSpreadsheet, ClipboardList,
  HardHat, Infinity, ArrowRight, Calendar, AlertTriangle,
  ExternalLink, Building2, ShoppingCart
} from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { ru } from "date-fns/locale";

const PLAN_ORDER: SubscriptionPlan[] = ['free', 'start', 'standard', 'professional', 'maximum'];

const planGradients: Record<SubscriptionPlan, string> = {
  free: "from-muted to-muted/50",
  start: "from-blue-500/10 to-blue-600/5",
  standard: "from-emerald-500/10 to-emerald-600/5",
  professional: "from-amber-500/10 to-amber-600/5",
  maximum: "from-purple-500/10 to-purple-600/5",
};

const planAccents: Record<SubscriptionPlan, string> = {
  free: "text-muted-foreground",
  start: "text-blue-500",
  standard: "text-emerald-500",
  professional: "text-amber-500",
  maximum: "text-purple-500",
};

const planBorders: Record<SubscriptionPlan, string> = {
  free: "border-border",
  start: "border-blue-500/30",
  standard: "border-emerald-500/30",
  professional: "border-amber-500/30",
  maximum: "border-purple-500/30",
};

interface FeatureHighlight {
  icon: React.ReactNode;
  title: string;
  description: string;
  minPlan: SubscriptionPlan;
  link?: string;
}

const FEATURE_HIGHLIGHTS: FeatureHighlight[] = [
  { icon: <Palette className="w-5 h-5" />, title: "Брендирование", description: "Ваш логотип и цвета в портале ученика", minPlan: "standard", link: "/feature/branding" },
  { icon: <Video className="w-5 h-5" />, title: "Видео-идентификация", description: "Автоматическая проверка личности ученика", minPlan: "standard", link: "/feature/video-id" },
  { icon: <FileCheck className="w-5 h-5" />, title: "Чек-лист документов", description: "100% контроль документов при зачислении", minPlan: "standard", link: "/feature/document-checklist" },
  { icon: <ClipboardList className="w-5 h-5" />, title: "Журналы", description: "Автогенерация журналов посещаемости и оценок", minPlan: "professional" },
  { icon: <FileSpreadsheet className="w-5 h-5" />, title: "Документооборот", description: "Полный цикл документов организации", minPlan: "professional", link: "/feature/documents" },
  { icon: <HardHat className="w-5 h-5" />, title: "Охрана труда", description: "Полное управление обучением ОТ", minPlan: "professional", link: "/feature/labor-safety" },
  { icon: <ShoppingCart className="w-5 h-5" />, title: "Магазин курсов", description: "Продавайте и покупайте курсы на маркетплейсе", minPlan: "professional", link: "/feature/course-store" },
  { icon: <FileSpreadsheet className="w-5 h-5" />, title: "ФИС ФРДО", description: "Автоматическая отчётность в федеральный реестр", minPlan: "maximum", link: "/feature/frdo" },
  { icon: <Brain className="w-5 h-5" />, title: "ИИ-генерация", description: "Создание контента курсов за минуты с ИИ", minPlan: "maximum", link: "/feature/ai-courses" },
  { icon: <Infinity className="w-5 h-5" />, title: "Без ограничений", description: "Безлимитные курсы и ученики — масштабируйтесь свободно", minPlan: "maximum" },
];

interface FeatureRow {
  label: string;
  key?: keyof PlanInfo['limits'];
  link?: string;
  format?: (v: any) => any;
  getValue?: (plan: PlanInfo) => any;
}

const featureRows: FeatureRow[] = [
  { label: "Курсы", key: "maxCourses", format: (v: number) => v === -1 ? "∞" : String(v) },
  { label: "Ученики", key: "maxStudents", format: (v: number) => v === -1 ? "∞" : String(v) },
  { label: "Настройки курсов", key: "courseSettings", format: (v: boolean) => v, link: "/feature/course-settings" },
  { label: "Чек-лист документов", key: "documentChecklist", format: (v: boolean) => v, link: "/feature/document-checklist" },
  { label: "Видео-идентификация", key: "videoIdentification", format: (v: boolean) => v, link: "/feature/video-id" },
  { label: "Брендирование", key: "branding", format: (v: boolean) => v, link: "/feature/branding" },
  { label: "ИИ-генерация", key: "aiEnabled", format: (v: boolean) => v, link: "/feature/ai-courses" },
  { label: "ИИ-озвучка", key: "aiAudioEnabled", format: (v: boolean) => v },
  { label: "Компании", getValue: (plan) => plan.enabledCategories.includes('companies'), format: (v: boolean) => v },
  { label: "Журналы", getValue: (plan) => plan.enabledCategories.includes('journals'), format: (v: boolean) => v },
  { label: "Документооборот", getValue: (plan) => plan.enabledCategories.includes('documents'), format: (v: boolean) => v, link: "/feature/documents" },
  { label: "Охрана труда", getValue: (plan) => plan.enabledCategories.includes('labor_safety'), format: (v: boolean) => v, link: "/feature/labor-safety" },
  { label: "ФИС ФРДО", getValue: (plan) => plan.enabledCategories.includes('frdo'), format: (v: boolean) => v, link: "/feature/frdo" },
  { label: "Магазин курсов", getValue: (plan) => plan.enabledCategories.includes('services'), format: (v: boolean) => v, link: "/feature/course-store" },
  { label: "Хранилище файлов", getValue: (plan) => plan.enabledCategories.includes('library'), format: (v: boolean) => v },
];

export function SubscriptionTab() {
  const d = useOrgDashboard();
  const organizationId = d.organizationId;
  const subscriptionLimits = d.subscriptionLimits;
  
  const [paidUntil, setPaidUntil] = useState<string | null>(null);
  const [tariffCustomLabel, setTariffCustomLabel] = useState<string | null>(null);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<{ requested_plan: string; created_at: string } | null>(null);
  const [orgContact, setOrgContact] = useState<{ email?: string; phone?: string; contact_name?: string }>({});

  const currentPlan = subscriptionLimits.plan;
  const currentPlanInfo = SUBSCRIPTION_PLANS[currentPlan];
  const currentPlanIndex = PLAN_ORDER.indexOf(currentPlan);

  useEffect(() => {
    if (!organizationId) return;
    
    const fetchOrgDetails = async () => {
      const [orgRes, reqRes] = await Promise.all([
        supabase.from("organizations").select("paid_until, tariff_custom_label, email, phone, contact_name").eq("id", organizationId).single(),
        supabase.from("subscription_requests" as any).select("requested_plan, created_at").eq("organization_id", organizationId).eq("status", "pending").order("created_at", { ascending: false }).limit(1),
      ]);
      
      if (orgRes.data?.paid_until) setPaidUntil(orgRes.data.paid_until);
      if ((orgRes.data as any)?.tariff_custom_label) setTariffCustomLabel((orgRes.data as any).tariff_custom_label);
      setOrgContact({ email: orgRes.data?.email, phone: orgRes.data?.phone, contact_name: orgRes.data?.contact_name });
      if ((reqRes.data as any)?.[0]) setPendingRequest((reqRes.data as any)[0]);
    };
    fetchOrgDetails();
  }, [organizationId]);

  const daysRemaining = useMemo(() => {
    if (!paidUntil) return null;
    return differenceInDays(new Date(paidUntil), new Date());
  }, [paidUntil]);

  const urgencyColor = useMemo(() => {
    if (daysRemaining === null) return "text-muted-foreground";
    if (daysRemaining <= 0) return "text-destructive";
    if (daysRemaining <= 7) return "text-destructive";
    if (daysRemaining <= 30) return "text-amber-500";
    return "text-emerald-500";
  }, [daysRemaining]);

  const handleRequestUpgrade = async () => {
    if (!organizationId || !selectedPlan) return;
    setSubmitting(true);
    
    const { error } = await supabase.from("subscription_requests" as any).insert({
      organization_id: organizationId,
      current_plan: currentPlan,
      requested_plan: selectedPlan,
      message: message || null,
    } as any);

    if (error) {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Заявка отправлена", description: "Мы свяжемся с вами для оформления перехода на новый тариф" });
      setPendingRequest({ requested_plan: selectedPlan, created_at: new Date().toISOString() });
      setShowUpgradeDialog(false);
      setMessage("");
      setSelectedPlan(null);

      const planInfo = SUBSCRIPTION_PLANS[selectedPlan];
      const orgDisplayName = d.organizationName || organizationId;
      try {
        await supabase.functions.invoke("send-telegram-notification", {
          body: {
            message: `📋 <b>Заявка на повышение тарифа</b>\n\n` +
              `🏢 Организация: ${orgDisplayName}\n` +
              (orgContact.contact_name ? `👤 Контакт: ${orgContact.contact_name}\n` : '') +
              (orgContact.email ? `📧 Email: ${orgContact.email}\n` : '') +
              (orgContact.phone ? `📞 Телефон: ${orgContact.phone}\n` : '') +
              `📊 Текущий тариф: ${SUBSCRIPTION_PLANS[currentPlan]?.name || currentPlan}\n` +
              `🆕 Запрошенный тариф: ${planInfo?.name || selectedPlan}\n` +
              `💰 Стоимость: ${planInfo?.price?.toLocaleString() || '?'} ₽/мес\n` +
              (message ? `💬 Комментарий: ${message}\n` : '') +
              `\n🕐 ${new Date().toLocaleString('ru-RU')}`,
          },
        });
      } catch (tgErr) {
        console.error("Telegram notification failed:", tgErr);
      }
    }
    setSubmitting(false);
  };

  const coursesPercent = currentPlanInfo.limits.maxCourses === -1 ? 0 :
    Math.round((subscriptionLimits.usage.coursesCount / currentPlanInfo.limits.maxCourses) * 100);
  const studentsPercent = currentPlanInfo.limits.maxStudents === -1 ? 0 :
    Math.round((subscriptionLimits.usage.studentsCount / currentPlanInfo.limits.maxStudents) * 100);
  const trainedPercent = currentPlanInfo.limits.maxTrainedPerMonth === -1 ? 0 :
    Math.round(((subscriptionLimits.usage.trainedThisMonth || 0) / currentPlanInfo.limits.maxTrainedPerMonth) * 100);

  return (
    <div className="space-y-6">
      {/* Tariff Plan - default open since it's the only content */}
      <Accordion type="single" collapsible defaultValue="tariff" className="w-full">
        <AccordionItem value="tariff" className="border rounded-lg">
          <AccordionTrigger className="px-6 py-4 hover:no-underline">
            <div className="flex items-center gap-2 text-base font-semibold">
              <Crown className={`w-5 h-5 ${planAccents[currentPlan]}`} />
              Тарифный план — {currentPlanInfo.name}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="space-y-6">
              {/* Current Plan Card */}
              <Card className={`border-2 ${planBorders[currentPlan]} bg-gradient-to-br ${planGradients[currentPlan]}`}>
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Crown className={`w-6 h-6 ${planAccents[currentPlan]}`} />
                        <h2 className="text-2xl font-bold">{currentPlanInfo.name}</h2>
                        <Badge variant="secondary" className="ml-2">{currentPlanInfo.description}</Badge>
                      </div>
                      <p className="text-muted-foreground">
                        {currentPlanInfo.price === 0 ? "Бесплатный тариф" : `${currentPlanInfo.price.toLocaleString()} ₽/мес`}
                      </p>
                      {tariffCustomLabel && (
                        <p className="text-sm font-medium text-primary mt-1">{tariffCustomLabel}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {paidUntil && currentPlan !== 'free' ? (
                        <div className={`flex items-center gap-2 ${urgencyColor}`}>
                          {daysRemaining !== null && daysRemaining <= 7 && <AlertTriangle className="w-4 h-4" />}
                          <Calendar className="w-4 h-4" />
                          <span className="text-sm font-medium">
                            {daysRemaining !== null && daysRemaining <= 0 
                              ? "Тариф истёк" 
                              : `Оплачен до ${format(new Date(paidUntil), "d MMMM yyyy", { locale: ru })}`}
                          </span>
                          {daysRemaining !== null && daysRemaining > 0 && (
                            <Badge variant="outline" className={urgencyColor}>
                              {daysRemaining} {daysRemaining === 1 ? "день" : daysRemaining < 5 ? "дня" : "дней"}
                            </Badge>
                          )}
                        </div>
                      ) : currentPlan === 'free' ? (
                        <span className="text-sm text-muted-foreground">Бессрочно</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Дата не указана</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Pending Request */}
              {pendingRequest && (
                <Card className="border-amber-500/30 bg-amber-500/5">
                  <CardContent className="p-4 flex items-center gap-3">
                    <Sparkles className="w-5 h-5 text-amber-500" />
                    <div>
                      <span className="font-medium">Ожидает рассмотрения: </span>
                      <span>переход на тариф «{SUBSCRIPTION_PLANS[pendingRequest.requested_plan as SubscriptionPlan]?.name}»</span>
                      <span className="text-muted-foreground text-sm ml-2">
                        от {format(new Date(pendingRequest.created_at), "d MMM yyyy", { locale: ru })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Usage Meters */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <BookOpen className="w-4 h-4 text-primary" />
                        Курсы
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {subscriptionLimits.usage.coursesCount} / {currentPlanInfo.limits.maxCourses === -1 ? "∞" : currentPlanInfo.limits.maxCourses}
                      </span>
                    </div>
                    <Progress value={currentPlanInfo.limits.maxCourses === -1 ? 0 : coursesPercent} className="h-2" />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Users className="w-4 h-4 text-primary" />
                        Ученики
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {subscriptionLimits.usage.studentsCount} / {currentPlanInfo.limits.maxStudents === -1 ? "∞" : currentPlanInfo.limits.maxStudents}
                      </span>
                    </div>
                    <Progress value={currentPlanInfo.limits.maxStudents === -1 ? 0 : studentsPercent} className="h-2" />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Sparkles className="w-4 h-4 text-primary" />
                        Обучено в этом месяце
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {subscriptionLimits.usage.trainedThisMonth || 0} / {currentPlanInfo.limits.maxTrainedPerMonth === -1 ? "∞" : currentPlanInfo.limits.maxTrainedPerMonth}
                      </span>
                    </div>
                    <Progress value={currentPlanInfo.limits.maxTrainedPerMonth === -1 ? 0 : trainedPercent} className="h-2" />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <HardDrive className="w-4 h-4 text-primary" />
                        Хранилище
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {formatStorageSize(currentPlanInfo.limits.storageBytes)}
                      </span>
                    </div>
                    <Progress value={0} className="h-2" />
                  </CardContent>
                </Card>
              </div>

              {/* Feature Highlights */}
              {currentPlanIndex < PLAN_ORDER.length - 1 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Sparkles className="w-5 h-5 text-amber-500" />
                      Возможности, доступные на старших тарифах
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">Перейдите на более высокий тариф, чтобы разблокировать</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                      {FEATURE_HIGHLIGHTS.filter(f => PLAN_ORDER.indexOf(f.minPlan) > currentPlanIndex).map((feature, i) => (
                        <div key={i} className="p-4 rounded-xl border border-border bg-muted/30 space-y-2 relative overflow-hidden">
                          <div className="absolute top-2 right-2">
                            <Badge variant="outline" className={planAccents[feature.minPlan]}>
                              {SUBSCRIPTION_PLANS[feature.minPlan].name}+
                            </Badge>
                          </div>
                          <div className={`${planAccents[feature.minPlan]}`}>{feature.icon}</div>
                          <h4 className="font-semibold text-sm">{feature.title}</h4>
                          <p className="text-xs text-muted-foreground">{feature.description}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Plan Comparison Grid */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Сравнение тарифов</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="text-left p-2 font-medium text-muted-foreground">Функция</th>
                          {PLAN_ORDER.map(planId => {
                            const plan = SUBSCRIPTION_PLANS[planId];
                            const isCurrent = planId === currentPlan;
                            return (
                              <th key={planId} className={`p-2 text-center min-w-[120px] ${isCurrent ? `bg-primary/5 rounded-t-lg border-t-2 ${planBorders[planId]}` : ""}`}>
                                <div className="space-y-1">
                                  <div className={`font-bold ${isCurrent ? planAccents[planId] : ""}`}>{plan.name}</div>
                                  <div className="text-xs text-muted-foreground font-normal">
                                    {plan.price === 0 ? "0 ₽" : `${plan.price.toLocaleString()} ₽`}
                                  </div>
                                  {isCurrent && <Badge variant="secondary" className="text-[10px]">Текущий</Badge>}
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {featureRows.map((row) => (
                          <tr key={row.label} className="border-t border-border">
                            <td className="p-2 font-medium">
                              {row.link ? (
                                <Link to={row.link} className="inline-flex items-center gap-1 hover:text-primary hover:underline transition-colors">
                                  {row.label}
                                  <ExternalLink className="w-3 h-3 text-muted-foreground" />
                                </Link>
                              ) : (
                                row.label
                              )}
                            </td>
                            {PLAN_ORDER.map(planId => {
                              const plan = SUBSCRIPTION_PLANS[planId];
                              const value = row.getValue ? row.getValue(plan) : row.key ? plan.limits[row.key] : null;
                              const isCurrent = planId === currentPlan;
                              const formatted = row.format ? (row.format as Function)(value) : value;
                              return (
                                <td key={planId} className={`p-2 text-center ${isCurrent ? "bg-primary/5" : ""}`}>
                                  {typeof formatted === "boolean" ? (
                                    formatted ? <Check className="w-4 h-4 text-emerald-500 mx-auto" /> : <X className="w-4 h-4 text-muted-foreground/30 mx-auto" />
                                  ) : (
                                    <span className="font-medium">{formatted}</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                        {/* Action row */}
                        <tr className="border-t border-border">
                          <td className="p-2"></td>
                          {PLAN_ORDER.map(planId => {
                            const isCurrent = planId === currentPlan;
                            const planIndex = PLAN_ORDER.indexOf(planId);
                            const isUpgrade = planIndex > currentPlanIndex;
                            return (
                              <td key={planId} className={`p-2 text-center ${isCurrent ? "bg-primary/5 rounded-b-lg" : ""}`}>
                                {isCurrent ? (
                                  <span className="text-xs text-muted-foreground">Активен</span>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant={isUpgrade ? "default" : "outline"}
                                    className="text-xs"
                                    onClick={() => { setSelectedPlan(planId); setShowUpgradeDialog(true); }}
                                    disabled={!!pendingRequest}
                                  >
                                    {isUpgrade ? (
                                      <>Перейти <ArrowRight className="w-3 h-3 ml-1" /></>
                                    ) : "Понизить"}
                                  </Button>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Upgrade Request Dialog */}
      <Dialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedPlan && PLAN_ORDER.indexOf(selectedPlan) > currentPlanIndex
                ? "Повышение тарифа"
                : "Понижение тарифа"}
            </DialogTitle>
            <DialogDescription>
              {selectedPlan && (
                <>Переход с «{currentPlanInfo.name}» на «{SUBSCRIPTION_PLANS[selectedPlan].name}»</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedPlan && (
              <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                <div className="flex justify-between">
                  <span>Новый тариф:</span>
                  <span className="font-bold">{SUBSCRIPTION_PLANS[selectedPlan].name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Стоимость:</span>
                  <span className="font-bold">
                    {SUBSCRIPTION_PLANS[selectedPlan].price === 0 ? "Бесплатно" : `${SUBSCRIPTION_PLANS[selectedPlan].price.toLocaleString()} ₽/мес`}
                  </span>
                </div>
              </div>
            )}
            <Textarea
              placeholder="Комментарий к заявке (необязательно)"
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpgradeDialog(false)}>Отмена</Button>
            <Button onClick={handleRequestUpgrade} disabled={submitting}>
              {submitting ? "Отправка..." : "Отправить заявку"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
