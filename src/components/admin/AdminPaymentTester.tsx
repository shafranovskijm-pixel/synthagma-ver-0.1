import { useState, useEffect, useCallback, useRef } from "react";
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

interface Org { id: string; name: string; }
interface Course { id: string; title: string; price: number; }

export function AdminPaymentTester() {
  // Step 1: Settings
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [terminalKey, setTerminalKey] = useState("");
  const [password, setPassword] = useState("");
  const [isTestMode, setIsTestMode] = useState(true);
  const [hasExisting, setHasExisting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);

  // Step 2: Payment
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [email, setEmail] = useState("test@example.com");
  const [initiating, setInitiating] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState("");
  const [paymentId, setPaymentId] = useState("");

  // Step 3: Result
  const [paymentStatus, setPaymentStatus] = useState("");
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Load orgs on mount
  useEffect(() => {
    supabase.from("organizations").select("id, name").order("name").then(({ data }) => {
      setOrgs(data || []);
    });
  }, []);

  // Load settings when org changes
  useEffect(() => {
    if (!selectedOrg) return;
    setLoadingSettings(true);
    setHasExisting(false);
    setTerminalKey("");
    setPassword("");
    setPaymentUrl("");
    setPaymentId("");
    setPaymentStatus("");

    supabase
      .from("organization_payment_settings")
      .select("terminal_key, is_test_mode" as any)
      .eq("organization_id", selectedOrg)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setTerminalKey((data as any).terminal_key || "");
          setIsTestMode((data as any).is_test_mode ?? true);
          setHasExisting(true);
        }
        setLoadingSettings(false);
      });

    // Load courses with price > 0
    supabase
      .from("courses")
      .select("id, title, price")
      .eq("organization_id", selectedOrg)
      .gt("price", 0)
      .order("title")
      .then(({ data }) => {
        setCourses(data || []);
        setSelectedCourse("");
      });
  }, [selectedOrg]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleSaveSettings = async () => {
    if (!terminalKey || !selectedOrg) return;
    setSaving(true);
    try {
      const payload: any = {
        organization_id: selectedOrg,
        terminal_key: terminalKey,
        is_test_mode: isTestMode,
      };
      if (password) payload.password_encrypted = password;

      if (hasExisting) {
        const { error } = await supabase
          .from("organization_payment_settings")
          .update(payload)
          .eq("organization_id", selectedOrg);
        if (error) throw error;
      } else {
        if (!password) {
          toast.error("Введите пароль терминала");
          setSaving(false);
          return;
        }
        const { error } = await supabase
          .from("organization_payment_settings")
          .insert(payload);
        if (error) throw error;
        setHasExisting(true);
      }
      setPassword("");
      toast.success("Настройки кассы сохранены");
    } catch (err) {
      console.error(err);
      toast.error("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const handleInitPayment = async () => {
    if (!selectedCourse || !selectedOrg) return;
    setInitiating(true);
    setPaymentUrl("");
    setPaymentId("");
    setPaymentStatus("");
    if (pollRef.current) clearInterval(pollRef.current);

    try {
      const { data, error } = await supabase.functions.invoke("tbank-init", {
        body: { course_id: selectedCourse, email: email || undefined },
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      setPaymentUrl(data.url);
      setPaymentId(data.payment_id);
      setPaymentStatus("pending");
      toast.success("Тестовый платёж создан");

      // Open payment page
      if (data.url) window.open(data.url, "_blank");

      // Start polling
      startPolling(data.payment_id);
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
        .from("course_payments")
        .select("status, paid_at")
        .eq("id", id)
        .single();

      if (data) {
        setPaymentStatus(data.status);
        if (data.status !== "pending") {
          if (pollRef.current) clearInterval(pollRef.current);
          setPolling(false);
          toast.success(data.status === "CONFIRMED" ? "✅ Платёж подтверждён! Webhook работает." : `Статус: ${data.status}`);
        }
      }
    }, 5000);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Скопировано");
  };

  const isConnected = hasExisting && !!terminalKey;
  const selectedCourseData = courses.find(c => c.id === selectedCourse);

  return (
    <div className="space-y-6">
      {/* Step 1: Configure */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center font-bold">1</span>
            Настройка кассы
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Организация</Label>
            <Select value={selectedOrg} onValueChange={setSelectedOrg}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите организацию" />
              </SelectTrigger>
              <SelectContent>
                {orgs.map(o => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedOrg && (
            loadingSettings ? (
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
                        placeholder={hasExisting ? "••••••• (не изменён)" : "Пароль"}
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
            )
          )}
        </CardContent>
      </Card>

      {/* Step 2: Initiate Payment */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center font-bold">2</span>
              Тестовый платёж
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {courses.length === 0 ? (
              <p className="text-sm text-muted-foreground">У этой организации нет курсов с ценой. Укажите цену курса в конструкторе.</p>
            ) : (
              <>
                <div className="grid sm:grid-cols-2 gap-4 max-w-lg">
                  <div>
                    <Label>Курс</Label>
                    <Select value={selectedCourse} onValueChange={setSelectedCourse}>
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите курс" />
                      </SelectTrigger>
                      <SelectContent>
                        {courses.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.title} — {c.price} ₽</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Email (для чека)</Label>
                    <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="test@example.com" />
                  </div>
                </div>

                {selectedCourseData && (
                  <div className="text-sm text-muted-foreground">
                    Сумма: <span className="font-semibold text-foreground">{selectedCourseData.price} ₽</span>
                  </div>
                )}

                <Button onClick={handleInitPayment} disabled={initiating || !selectedCourse} size="sm">
                  {initiating ? <SigmaSpinner size="sm" className="mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                  Создать тестовый платёж
                </Button>

                {paymentUrl && (
                  <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <ExternalLink className="w-4 h-4 text-primary" />
                      <a href={paymentUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                        Ссылка на оплату
                      </a>
                    </div>
                    <p className="text-xs text-muted-foreground">ID платежа: <code className="font-mono">{paymentId}</code></p>
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
      {paymentId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center font-bold">3</span>
              Результат
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Статус:</span>
              {paymentStatus === "pending" && (
                <Badge variant="outline" className="flex items-center gap-1.5">
                  {polling && <RefreshCw className="w-3 h-3 animate-spin" />}
                  Ожидание оплаты
                </Badge>
              )}
              {paymentStatus === "CONFIRMED" && (
                <Badge variant="default" className="flex items-center gap-1.5 bg-emerald-600">
                  <Check className="w-3 h-3" /> Оплачен
                </Badge>
              )}
              {paymentStatus === "paid" && (
                <Badge variant="default" className="flex items-center gap-1.5 bg-emerald-600">
                  <Check className="w-3 h-3" /> Оплачен
                </Badge>
              )}
              {(paymentStatus === "failed" || paymentStatus === "REJECTED") && (
                <Badge variant="destructive" className="flex items-center gap-1.5">
                  <XCircle className="w-3 h-3" /> Ошибка
                </Badge>
              )}
            </div>

            {paymentStatus === "pending" && polling && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 text-amber-500" />
                Оплатите в открывшемся окне. Статус обновится автоматически.
              </p>
            )}

            {(paymentStatus === "CONFIRMED" || paymentStatus === "paid") && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                <p className="text-sm font-medium text-emerald-600">✅ Тест пройден!</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Платёж успешно обработан. Webhook tbank-webhook корректно обновил статус.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
