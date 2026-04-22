import { Link } from "react-router-dom";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan, formatStorageSize } from "@/constants/subscriptionPlans";
import { ORG_FEATURE_CATALOG } from "@/constants/orgFeatureCatalog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Crown, BookOpen, Users, HardDrive, Sparkles, Check, X,
  ArrowRight, Calendar, AlertTriangle,
  ExternalLink, CreditCard, Wallet
} from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import {
  useSubscriptionTab,
  PLAN_ORDER, planGradients, planAccents, planBorders,
  featureRows,
} from "@/hooks/useSubscriptionTab";

// Build feature highlights dynamically from the unified catalog
const FEATURE_HIGHLIGHTS = ORG_FEATURE_CATALOG.map((f) => ({
  key: f.key,
  icon: <f.icon className="w-5 h-5" />,
  title: f.label,
  description: f.description,
  minPlan: f.minPlan,
  link: f.link,
}));

export function SubscriptionTab() {
  const s = useSubscriptionTab();

  return (
    <div className="space-y-6">
      <Accordion type="single" collapsible defaultValue="tariff" className="w-full">
        <AccordionItem value="tariff" className="border rounded-lg">
          <AccordionTrigger className="px-6 py-4 hover:no-underline">
            <div className="flex items-center gap-2 text-base font-semibold">
              <Crown className={`w-5 h-5 ${planAccents[s.currentPlan]}`} />
              Тарифный план — {s.currentPlanInfo.name}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="space-y-6">
              {/* Current Plan Card */}
              <Card className={`border-2 ${planBorders[s.currentPlan]} bg-gradient-to-br ${planGradients[s.currentPlan]}`}>
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Crown className={`w-6 h-6 ${planAccents[s.currentPlan]}`} />
                        <h2 className="text-2xl font-bold">{s.currentPlanInfo.name}</h2>
                        <Badge variant="secondary" className="ml-2">{s.currentPlanInfo.description}</Badge>
                      </div>
                      <p className="text-muted-foreground">
                        {s.currentPlanInfo.price === 0 ? "Бесплатный тариф" : `${s.currentPlanInfo.price.toLocaleString()} ₽/мес`}
                      </p>
                      {s.tariffCustomLabel && <p className="text-sm font-medium text-primary mt-1">{s.tariffCustomLabel}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {s.paidUntil && s.currentPlan !== 'free' ? (
                        <div className={`flex items-center gap-2 ${s.urgencyColor}`}>
                          {s.daysRemaining !== null && s.daysRemaining <= 7 && <AlertTriangle className="w-4 h-4" />}
                          <Calendar className="w-4 h-4" />
                          <span className="text-sm font-medium">
                            {s.daysRemaining !== null && s.daysRemaining <= 0
                              ? "Тариф истёк"
                              : `Оплачен до ${format(new Date(s.paidUntil), "d MMMM yyyy", { locale: ru })}`}
                          </span>
                          {s.daysRemaining !== null && s.daysRemaining > 0 && (
                            <Badge variant="outline" className={s.urgencyColor}>
                              {s.daysRemaining} {s.daysRemaining === 1 ? "день" : s.daysRemaining < 5 ? "дня" : "дней"}
                            </Badge>
                          )}
                        </div>
                      ) : s.currentPlan === 'free' ? (
                        <span className="text-sm text-muted-foreground">Бессрочно</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Дата не указана</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Generate Invoice */}
              {s.currentPlan !== 'free' && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CreditCard className="w-5 h-5 text-primary" />
                      <div>
                        <p className="font-medium text-sm">Продлите тариф</p>
                        <p className="text-xs text-muted-foreground">
                          {(s.daysRemaining ?? 0) <= 0 ? "Тариф истёк" : `До окончания ${s.daysRemaining} дн.`} — выставите счёт на продление
                        </p>
                      </div>
                    </div>
                    <Button size="sm" onClick={s.handleGenerateInvoice} disabled={s.generatingInvoice}>
                      {s.generatingInvoice ? "Создание..." : "Выставить счёт"}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Pending Request */}
              {s.pendingRequest && (
                <Card className="border-amber-500/30 bg-amber-500/5">
                  <CardContent className="p-4 flex items-center gap-3">
                    <Sparkles className="w-5 h-5 text-amber-500" />
                    <div>
                      <span className="font-medium">Ожидает рассмотрения: </span>
                      <span>переход на тариф «{SUBSCRIPTION_PLANS[s.pendingRequest.requested_plan as SubscriptionPlan]?.name}»</span>
                      <span className="text-muted-foreground text-sm ml-2">
                        от {format(new Date(s.pendingRequest.created_at), "d MMM yyyy", { locale: ru })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Usage Meters */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card><CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium"><BookOpen className="w-4 h-4 text-primary" />Курсы</div>
                    <span className="text-sm text-muted-foreground">{s.subscriptionLimits.usage.coursesCount} / {s.subscriptionLimits.limits.maxCourses === -1 ? "∞" : s.subscriptionLimits.limits.maxCourses}</span>
                  </div>
                  <Progress value={s.subscriptionLimits.limits.maxCourses === -1 ? 0 : s.coursesPercent} className="h-2" />
                </CardContent></Card>
                <Card><CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium"><Users className="w-4 h-4 text-primary" />Ученики</div>
                    <span className="text-sm text-muted-foreground">{s.subscriptionLimits.usage.studentsCount} / {s.subscriptionLimits.limits.maxStudents === -1 ? "∞" : s.subscriptionLimits.limits.maxStudents}</span>
                  </div>
                  <Progress value={s.subscriptionLimits.limits.maxStudents === -1 ? 0 : s.studentsPercent} className="h-2" />
                </CardContent></Card>
                <Card><CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="w-4 h-4 text-primary" />Обучено в этом месяце</div>
                    <span className="text-sm text-muted-foreground">{s.subscriptionLimits.usage.trainedThisMonth || 0} / {s.subscriptionLimits.limits.maxTrainedPerMonth === -1 ? "∞" : s.subscriptionLimits.limits.maxTrainedPerMonth}</span>
                  </div>
                  <Progress value={s.subscriptionLimits.limits.maxTrainedPerMonth === -1 ? 0 : s.trainedPercent} className="h-2" />
                </CardContent></Card>
                <Card><CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium"><HardDrive className="w-4 h-4 text-primary" />Хранилище</div>
                    <span className="text-sm text-muted-foreground">{formatStorageSize(s.subscriptionLimits.usage.storageUsedBytes)} / {s.subscriptionLimits.limits.storageBytes === -1 ? "∞" : formatStorageSize(s.subscriptionLimits.limits.storageBytes)}</span>
                  </div>
                  <Progress value={s.subscriptionLimits.limits.storageBytes === -1 ? 0 : Math.min(100, Math.round((s.subscriptionLimits.usage.storageUsedBytes / s.subscriptionLimits.limits.storageBytes) * 100))} className="h-2" />
                </CardContent></Card>
              </div>

              {/* Feature Highlights */}
              {s.currentPlanIndex < PLAN_ORDER.length - 1 && (
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
                      {FEATURE_HIGHLIGHTS.filter(f => PLAN_ORDER.indexOf(f.minPlan) > s.currentPlanIndex && !s.customEnabledCategories.includes(f.key)).map((feature) => (
                        <div key={feature.key} className="p-4 rounded-xl border border-border bg-muted/30 space-y-2 relative overflow-hidden">
                          <div className="absolute top-2 right-2">
                            <Badge variant="outline" className={planAccents[feature.minPlan]}>
                              {SUBSCRIPTION_PLANS[feature.minPlan].name}+
                            </Badge>
                          </div>
                          <div className={planAccents[feature.minPlan]}>{feature.icon}</div>
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
                <CardHeader><CardTitle className="text-base">Сравнение тарифов</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="text-left p-2 font-medium text-muted-foreground">Функция</th>
                          {PLAN_ORDER.map(planId => {
                            const plan = SUBSCRIPTION_PLANS[planId];
                            const isCurrent = planId === s.currentPlan;
                            return (
                              <th key={planId} className={`p-2 text-center min-w-[120px] ${isCurrent ? `bg-primary/5 rounded-t-lg border-t-2 ${planBorders[planId]}` : ""}`}>
                                <div className="space-y-1">
                                  <div className={`font-bold ${isCurrent ? planAccents[planId] : ""}`}>{plan.name}</div>
                                  <div className="text-xs text-muted-foreground font-normal">{plan.price === 0 ? "0 ₽" : `${plan.price.toLocaleString()} ₽`}</div>
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
                                  {row.label}<ExternalLink className="w-3 h-3 text-muted-foreground" />
                                </Link>
                              ) : row.label}
                            </td>
                            {PLAN_ORDER.map(planId => {
                              const plan = SUBSCRIPTION_PLANS[planId];
                              const value = row.getValue ? row.getValue(plan) : row.key ? plan.limits[row.key] : null;
                              const isCurrent = planId === s.currentPlan;
                              const formatted = row.format ? (row.format as Function)(value) : value;
                              return (
                                <td key={planId} className={`p-2 text-center ${isCurrent ? "bg-primary/5" : ""}`}>
                                  {typeof formatted === "boolean" ? (
                                    formatted ? <Check className="w-4 h-4 text-emerald-500 mx-auto" /> : <X className="w-4 h-4 text-muted-foreground/30 mx-auto" />
                                  ) : <span className="font-medium">{formatted}</span>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                        <tr className="border-t border-border">
                          <td className="p-2"></td>
                          {PLAN_ORDER.map(planId => {
                            const isCurrent = planId === s.currentPlan;
                            const isUpgrade = PLAN_ORDER.indexOf(planId) > s.currentPlanIndex;
                            return (
                              <td key={planId} className={`p-2 text-center ${isCurrent ? "bg-primary/5 rounded-b-lg" : ""}`}>
                                {isCurrent ? (
                                  <span className="text-xs text-muted-foreground">Активен</span>
                                ) : (
                                  <Button size="sm" variant={isUpgrade ? "default" : "outline"} className="text-xs"
                                    onClick={() => { s.setSelectedPlan(planId); s.setShowUpgradeDialog(true); }}
                                    disabled={!!s.pendingRequest}>
                                    {isUpgrade ? <>Перейти <ArrowRight className="w-3 h-3 ml-1" /></> : "Понизить"}
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

      {/* Upgrade Dialog */}
      <Dialog open={s.showUpgradeDialog} onOpenChange={s.setShowUpgradeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {s.selectedPlan && PLAN_ORDER.indexOf(s.selectedPlan) > s.currentPlanIndex ? "Повышение тарифа" : "Понижение тарифа"}
            </DialogTitle>
            <DialogDescription>
              {s.selectedPlan && <>Переход с «{s.currentPlanInfo.name}» на «{SUBSCRIPTION_PLANS[s.selectedPlan].name}»</>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {s.selectedPlan && (
              <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                <div className="flex justify-between"><span>Новый тариф:</span><span className="font-bold">{SUBSCRIPTION_PLANS[s.selectedPlan].name}</span></div>
                <div className="flex justify-between"><span>Стоимость:</span><span className="font-bold">{SUBSCRIPTION_PLANS[s.selectedPlan].price === 0 ? "Бесплатно" : `${SUBSCRIPTION_PLANS[s.selectedPlan].price.toLocaleString()} ₽/мес`}</span></div>
              </div>
            )}
            <Textarea placeholder="Комментарий к заявке (необязательно)" value={s.message} onChange={e => s.setMessage(e.target.value)} rows={3} />
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => s.setShowUpgradeDialog(false)}>Отмена</Button>
            <Button onClick={s.handleRequestUpgrade} disabled={s.submitting}>{s.submitting ? "Отправка..." : "Отправить заявку"}</Button>
            {s.selectedPlan && SUBSCRIPTION_PLANS[s.selectedPlan].price > 0 && PLAN_ORDER.indexOf(s.selectedPlan) > s.currentPlanIndex && (
              <Button variant="default" className="bg-emerald-600 hover:bg-emerald-700" disabled={s.payingOnline} onClick={s.handlePayOnline}>
                <CreditCard className="w-4 h-4 mr-2" />{s.payingOnline ? "Переход к оплате..." : "Оплатить онлайн"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
