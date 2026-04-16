import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { toast } from "sonner";
import {
  CreditCard, Save, CheckCircle2, XCircle, Copy, ExternalLink,
  Play, Eye, EyeOff, RefreshCw, AlertTriangle, Check
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Org { id: string; name: string; subscription_plan: string | null; paid_until: string | null; }

const PLANS = [
  { key: "start", name: "Старт", price: 3490 },
  { key: "standard", name: "Стандарт", price: 6990 },
  { key: "professional", name: "Профессиональный", price: 16990 },
  { key: "maximum", name: "Максимальный", price: 24990 },
] as const;

export function AdminPaymentTester() {
  // Step 1: Platform terminal settings
  const [terminalKey, setTerminalKey] = useState("");
  const [password, setPassword] = useState("");
  const [isTestMode, setIsTestMode] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  // Step 2: Tariff purchase
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [periodMonths, setPeriodMonths] = useState<1 | 12>(1);
  const [email, setEmail] = useState("test@example.com");
  const [initiating, setInitiating] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState("");
  const [invoiceId, setInvoiceId] = useState("");

  // Step 3: Result
  const [invoiceStatus, setInvoiceStatus] = useState("");
  const [polling, setPolling] = useState(false);
  const [orgAfterPayment, setOrgAfterPayment] = useState<{ plan: string; paid_until: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load platform terminal settings + orgs on mount
  useEffect(() => {
    loadSettings();
    supabase.from("organizations").select("id, name, subscription_plan, paid_until").order("name").then(({ data }) => {
      setOrgs((data as any[]) || []);
    });
  }, []);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const loadSettings = async () => {
    setLoadingSettings(true);
    const { data } = await supabase
      .from("app_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["tbank_terminal_key", "tbank_password", "tbank_test_mode"]);

    const map: Record<string, string> = {};
    (data || []).forEach(s => { map[s.setting_key] = s.setting_value; });

    if (map.tbank_terminal_key) {
      setTerminalKey(map.tbank_terminal_key);
      setIsTestMode(map.tbank_test_mode === "true");
      setIsConnected(true);
    }
    setLoadingSettings(false);
  };

  const handleSaveSettings = async () => {
    if (!terminalKey) return;
    setSaving(true);
    try {
      const entries = [
        { setting_key: "tbank_terminal_key", setting_value: terminalKey },
        { setting_key: "tbank_test_mode", setting_value: isTestMode ? "true" : "false" },
      ];
      if (password) {
        entries.push({ setting_key: "tbank_password", setting_value: password });
      }

      for (const entry of entries) {
        const { data: existing } = await supabase
          .from("app_settings")
          .select("id")
          .eq("setting_key", entry.setting_key)
          .maybeSingle();

        if (existing) {
          await supabase.from("app_settings").update({ setting_value: entry.setting_value }).eq("setting_key", entry.setting_key);
        } else {
          await supabase.from("app_settings").insert(entry);
        }
      }

      setPassword("");
      setIsConnected(true);
      toast.success("Настройки платформенной кассы сохранены");
    } catch (err) {
      console.error(err);
      toast.error("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const selectedPlanData = PLANS.find(p => p.key === selectedPlan);
  const discount = periodMonths === 12 ? 0.15 : 0;
  const totalAmount = selectedPlanData
    ? Math.round(selectedPlanData.price * periodMonths * (1 - discount))
    : 0;

  const handleInitPayment = async () => {
    if (!selectedOrg || !selectedPlan) return;
    setInitiating(true);
    setPaymentUrl("");
    setInvoiceId("");
    setInvoiceStatus("");
    setOrgAfterPayment(null);
    if (pollRef.current) clearInterval(pollRef.current);

    try {
      const { data, error } = await supabase.functions.invoke("tbank-init-subscription", {
        body: { organization_id: selectedOrg, plan: selectedPlan, period_months: periodMonths, email: email || undefined },
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      setPaymentUrl(data.url);
      setInvoiceId(data.invoice_id);
      setInvoiceStatus("pending");
      toast.success("Счёт на подписку создан");

      if (data.url) window.open(data.url, "_blank");
      startPolling(data.invoice_id);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Ошибка создания платежа");
    } finally {
      setInitiating(false);
    }
  };

  const startPolling = (id: string) => {
    setPolling(true);
    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from("subscription_invoices")
        .select("status, paid_at")
        .eq("id", id)
        .single();

      if (data) {
        setInvoiceStatus((data as any).status);
        if ((data as any).status !== "pending") {
          if (pollRef.current) clearInterval(pollRef.current);
          setPolling(false);

          if ((data as any).status === "paid") {
            toast.success("✅ Подписка оплачена! Webhook работает.");
            // Check org subscription update
            const { data: org } = await supabase
              .from("organizations")
              .select("subscription_plan, paid_until")
              .eq("id", selectedOrg)
              .single();
            if (org) setOrgAfterPayment({ plan: (org as any).subscription_plan, paid_until: (org as any).paid_until });
          } else {
            toast.error(`Статус: ${(data as any).status}`);
          }
        }
      }
    }, 5000);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Скопировано");
  };

  const selectedOrgData = orgs.find(o => o.id === selectedOrg);

  return (
    <div className="space-y-6">
      {/* Step 1: Platform Terminal */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center font-bold">1</span>
            Платформенная касса T-Bank
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingSettings ? (
            <div className="flex items-center gap-2 text-muted-foreground"><SigmaSpinner size="sm" />Загрузка...</div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Badge variant={isConnected ? "default" : "destructive"} className="flex items-center gap-1.5">
                  {isConnected ? <><CheckCircle2 className="w-3.5 h-3.5" /> Подключено</> : <><XCircle className="w-3.5 h-3.5" /> Не настроено</>}
                </Badge>
                {isConnected && (
                  <Badge variant={isTestMode ? "secondary" : "default"}>
                    {isTestMode ? "Тестовый режим" : "Боевой режим"}
                  </Badge>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-4 max-w-lg">
                <div>
                  <Label>TerminalKey</Label>
                  <Input value={terminalKey} onChange={e => setTerminalKey(e.target.value)} placeholder="Ключ терминала" />
                </div>
                <div>
                  <Label>Пароль</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder={isConnected ? "••••••• (не изменён)" : "Пароль"}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Switch checked={isTestMode} onCheckedChange={setIsTestMode} id="admin-test-mode" />
                <Label htmlFor="admin-test-mode" className="cursor-pointer">Тестовый режим</Label>
              </div>

              <Button onClick={handleSaveSettings} disabled={saving || !terminalKey} size="sm">
                {saving ? <SigmaSpinner size="sm" className="mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Сохранить настройки
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Buy Tariff */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center font-bold">2</span>
              Покупка тарифа
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-md">
              <Label>Организация</Label>
              <Select value={selectedOrg} onValueChange={v => { setSelectedOrg(v); setPaymentUrl(""); setInvoiceId(""); setInvoiceStatus(""); setOrgAfterPayment(null); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите организацию" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map(o => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name} {o.subscription_plan ? `(${o.subscription_plan})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedOrg && selectedOrgData && (
              <>
                {selectedOrgData.subscription_plan && selectedOrgData.subscription_plan !== "free" && (
                  <div className="text-xs text-muted-foreground">
                    Текущий план: <span className="font-medium text-foreground">{selectedOrgData.subscription_plan}</span>
                    {selectedOrgData.paid_until && <>, оплачен до {new Date(selectedOrgData.paid_until).toLocaleDateString("ru")}</>}
                  </div>
                )}

                {/* Plan cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {PLANS.map(plan => (
                    <button
                      key={plan.key}
                      onClick={() => setSelectedPlan(plan.key)}
                      className={cn(
                        "p-3 rounded-lg border text-left transition-all",
                        selectedPlan === plan.key
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-primary/40"
                      )}
                    >
                      <p className="font-semibold text-sm">{plan.name}</p>
                      <p className="text-lg font-bold mt-1">{plan.price.toLocaleString("ru")} ₽</p>
                      <p className="text-[10px] text-muted-foreground">/ мес</p>
                    </button>
                  ))}
                </div>

                {/* Period */}
                {selectedPlan && (
                  <div className="flex gap-2">
                    <Button
                      variant={periodMonths === 1 ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPeriodMonths(1)}
                    >
                      1 месяц
                    </Button>
                    <Button
                      variant={periodMonths === 12 ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPeriodMonths(12)}
                    >
                      12 месяцев (−15%)
                    </Button>
                  </div>
                )}

                {selectedPlanData && (
                  <div className="text-sm">
                    Итого: <span className="font-bold text-foreground">{totalAmount.toLocaleString("ru")} ₽</span>
                    {periodMonths === 12 && (
                      <span className="text-xs text-muted-foreground ml-2">
                        (экономия {Math.round(selectedPlanData.price * 12 * 0.15).toLocaleString("ru")} ₽)
                      </span>
                    )}
                  </div>
                )}

                <div className="max-w-xs">
                  <Label>Email (для чека)</Label>
                  <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="test@example.com" />
                </div>

                <Button onClick={handleInitPayment} disabled={initiating || !selectedPlan} size="sm">
                  {initiating ? <SigmaSpinner size="sm" className="mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                  Оплатить подписку
                </Button>

                {paymentUrl && (
                  <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <ExternalLink className="w-4 h-4 text-primary" />
                      <a href={paymentUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                        Ссылка на оплату
                      </a>
                    </div>
                    <p className="text-xs text-muted-foreground">Invoice ID: <code className="font-mono">{invoiceId}</code></p>
                  </div>
                )}
              </>
            )}

            {/* Test card info */}
            {isTestMode && (
              <Card className="border-dashed border-amber-500/50 bg-amber-500/5">
                <CardContent className="pt-4 pb-3">
                  <h4 className="font-semibold text-xs mb-2 flex items-center gap-2">
                    <CreditCard className="w-3.5 h-3.5 text-amber-500" />
                    Тестовые данные карты
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Номер карты", value: "4300000000000777", display: "4300 0000 0000 0777" },
                      { label: "Срок", value: "1225", display: "12/25" },
                      { label: "CVC", value: "000", display: "000" },
                    ].map(item => (
                      <div key={item.label} className="space-y-0.5">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
                        <button onClick={() => copyToClipboard(item.value)} className="flex items-center gap-1 font-mono text-xs hover:text-primary transition-colors">
                          {item.display} <Copy className="w-3 h-3 text-muted-foreground" />
                        </button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Result */}
      {invoiceId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center font-bold">3</span>
              Результат
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Статус счёта:</span>
              {invoiceStatus === "pending" && (
                <Badge variant="outline" className="flex items-center gap-1.5">
                  {polling && <RefreshCw className="w-3 h-3 animate-spin" />}
                  Ожидание оплаты
                </Badge>
              )}
              {invoiceStatus === "paid" && (
                <Badge variant="default" className="flex items-center gap-1.5 bg-emerald-600">
                  <Check className="w-3 h-3" /> Оплачен
                </Badge>
              )}
              {(invoiceStatus === "failed" || invoiceStatus === "cancelled") && (
                <Badge variant="destructive" className="flex items-center gap-1.5">
                  <XCircle className="w-3 h-3" /> Ошибка
                </Badge>
              )}
            </div>

            {invoiceStatus === "pending" && polling && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 text-amber-500" />
                Оплатите в открывшемся окне. Статус обновится автоматически.
              </p>
            )}

            {invoiceStatus === "paid" && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                <p className="text-sm font-medium text-emerald-600">✅ Подписка оплачена!</p>
                <p className="text-xs text-muted-foreground">
                  Webhook tbank-webhook корректно обновил статус счёта.
                </p>
                {orgAfterPayment && (
                  <div className="text-xs space-y-0.5 mt-2 pt-2 border-t border-emerald-500/20">
                    <p>Тариф организации: <span className="font-semibold text-foreground">{orgAfterPayment.plan}</span></p>
                    {orgAfterPayment.paid_until && (
                      <p>Оплачен до: <span className="font-semibold text-foreground">{new Date(orgAfterPayment.paid_until).toLocaleDateString("ru")}</span></p>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
