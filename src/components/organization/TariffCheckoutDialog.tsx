import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/constants/subscriptionPlans";
import { formatRub, derivePlatformContractDraft, type PlatformContractPeriodMonths } from "@/lib/platform-contract";
import { PlatformContractPreview } from "@/components/platform-contract/PlatformContractPreview";
import { CommercialSetCards } from "@/components/platform-contract/CommercialSetCards";
import { customerFromOrganization, REQUIRED_REQUISITES } from "@/lib/platform-commerce";
import { usePlatformCommercialSet } from "@/hooks/usePlatformCommercialSet";

const PAID_PLANS: SubscriptionPlan[] = ["start", "standard", "professional", "maximum"];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  currentPlan: SubscriptionPlan;
  onOpenAct?: () => void;
}

/** Клиентский мастер «Оформление тарифа»: тариф → реквизиты → документы. */
export function TariffCheckoutDialog({ open, onOpenChange, organizationId, currentPlan, onOpenAct }: Props) {
  const { loading, set, org, missing, generating, generate, reload } = usePlatformCommercialSet(open ? organizationId : null);
  const [step, setStep] = useState(1);
  const [plan, setPlan] = useState<SubscriptionPlan>(PAID_PLANS.includes(currentPlan) ? currentPlan : "start");
  const [period, setPeriod] = useState<PlatformContractPeriodMonths>(12);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savingReq, setSavingReq] = useState(false);

  useEffect(() => {
    if (open) setStep(1);
  }, [open]);

  const draft = useMemo(
    () =>
      derivePlatformContractDraft({
        plan,
        periodMonths: period,
        customer: customerFromOrganization(org),
      }),
    [plan, period, org],
  );

  const saveRequisites = async () => {
    const patch = Object.fromEntries(
      Object.entries(edits).filter(([, v]) => typeof v === "string" && v.trim().length > 0).map(([k, v]) => [k, v.trim()]),
    );
    if (Object.keys(patch).length === 0) return;
    setSavingReq(true);
    const { error } = await supabase.from("organizations").update(patch).eq("id", organizationId);
    setSavingReq(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEdits({});
    await reload();
    toast.success("Реквизиты сохранены");
  };

  const handleGenerate = async () => {
    const res = await generate(plan, period);
    if (res) {
      toast.success("Проект договора и счёт сформированы");
      setStep(3);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Оформление тарифа</DialogTitle>
          <DialogDescription>
            Шаг {step} из 3 — {step === 1 ? "тариф и срок" : step === 2 ? "реквизиты" : "документы"}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PAID_PLANS.map((p) => {
                const info = SUBSCRIPTION_PLANS[p];
                const active = plan === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlan(p)}
                    className={`text-left rounded-xl border-2 p-4 transition ${active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{info.name}</span>
                      {active && <Check className="w-4 h-4 text-primary" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{info.description}</p>
                    <p className="text-sm font-medium mt-2">{formatRub(info.price)} / мес</p>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2">
              {([1, 12] as PlatformContractPeriodMonths[]).map((m) => (
                <Button key={m} variant={period === m ? "default" : "outline"} size="sm" className="rounded-xl" onClick={() => setPeriod(m)}>
                  {m === 1 ? "1 месяц" : "12 месяцев (со скидкой)"}
                </Button>
              ))}
            </div>

            <Card className="bg-muted/40">
              <CardContent className="p-4 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Цена за месяц</span><span>{formatRub(draft.effectiveMonthlyPrice)}</span></div>
                {draft.discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-600"><span>Скидка за год</span><span>−{formatRub(draft.discountAmount)}</span></div>
                )}
                <div className="flex justify-between font-semibold"><span>Итого за период</span><span>{formatRub(draft.totalAmount)}</span></div>
              </CardContent>
            </Card>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {missing.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <Check className="w-4 h-4" /> Все обязательные реквизиты заполнены
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-2 text-sm text-amber-600">
                  <AlertTriangle className="w-4 h-4 mt-0.5" />
                  <span>Не хватает реквизитов — заполните их, значения не подставляются автоматически.</span>
                </div>
                {missing.map((m) => (
                  <div key={m.key} className="space-y-1">
                    <Label className="text-xs">{m.label}</Label>
                    <Input
                      value={edits[m.key] ?? ""}
                      onChange={(e) => setEdits((p) => ({ ...p, [m.key]: e.target.value }))}
                      placeholder={m.label}
                    />
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={saveRequisites} disabled={savingReq}>
                  {savingReq ? <Loader2 className="w-4 h-4 animate-spin" /> : "Сохранить реквизиты"}
                </Button>
              </div>
            )}

            <div className="space-y-1 text-xs text-muted-foreground">
              {REQUIRED_REQUISITES.map(({ key, label }) => (
                <div key={String(key)} className="flex justify-between gap-2">
                  <span>{label}</span>
                  <span className="text-foreground text-right">{(org as any)?.[key] || "—"}</span>
                </div>
              ))}
            </div>

            <div className="border rounded-xl overflow-hidden">
              <PlatformContractPreview draft={draft} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <Badge variant="outline">Проекту договора номер не присваивается</Badge>
            <CommercialSetCards set={set} loading={loading} onOpenAct={onOpenAct} />
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Назад
            </Button>
          )}
          {step === 1 && (
            <Button onClick={() => setStep(2)} className="gap-2">
              Далее <ArrowRight className="w-4 h-4" />
            </Button>
          )}
          {step === 2 && (
            <Button onClick={handleGenerate} disabled={generating || missing.length > 0} className="gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Сформировать проект договора и счёт
            </Button>
          )}
          {step === 3 && <Button onClick={() => onOpenChange(false)}>Готово</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
