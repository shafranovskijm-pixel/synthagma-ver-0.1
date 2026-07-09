import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Save, Trash2, AlertTriangle, CheckCircle2, KeyRound, Plus, ChevronLeft, Mail } from "lucide-react";

type ProviderKey = "yandex" | "mailru" | "timeweb" | "gmail" | "other";
const PROVIDERS: Record<ProviderKey, {
  label: string;
  hint: string;
  host: string;
  port: number;
  encryption: string;
  emailPlaceholder: string;
  passHint: string;
  logoBg: string;
  logoText: string;
  icon?: string;
}> = {
  yandex: {
    label: "Yandex 360 / Яндекс.Почта",
    hint: "smtp.yandex.ru:465 (SSL). Нужен пароль приложения (id.yandex.ru → Безопасность → Пароли приложений → Почта).",
    host: "smtp.yandex.ru", port: 465, encryption: "ssl",
    emailPlaceholder: "name@yandex.ru или name@ваш-домен.ru",
    passHint: "Пароль приложения (не пароль от аккаунта)",
    logoBg: "bg-red-500", logoText: "Я",
  },
  mailru: {
    label: "VK WorkSpace / Mail.ru",
    hint: "smtp.mail.ru:465 (SSL). Нужен пароль для внешних приложений (id.mail.ru → Безопасность → Пароли для внешних приложений).",
    host: "smtp.mail.ru", port: 465, encryption: "ssl",
    emailPlaceholder: "name@mail.ru / bk.ru / list.ru / inbox.ru",
    passHint: "Пароль для внешнего приложения",
    logoBg: "bg-sky-500", logoText: "@",
  },
  timeweb: {
    label: "Timeweb (корпоративная почта)",
    hint: "smtp.timeweb.ru:465 (SSL). Обычный пароль от ящика.",
    host: "smtp.timeweb.ru", port: 465, encryption: "ssl",
    emailPlaceholder: "name@ваш-домен.ru",
    passHint: "Пароль от почтового ящика Timeweb",
    logoBg: "bg-emerald-600", logoText: "T",
  },
  gmail: {
    label: "Google Workspace (Gmail)",
    hint: "smtp.gmail.com:465 (SSL). Нужен app-пароль (myaccount.google.com → Security → 2-Step Verification → App passwords).",
    host: "smtp.gmail.com", port: 465, encryption: "ssl",
    emailPlaceholder: "name@gmail.com или домен на Google Workspace",
    passHint: "App-пароль (16 символов без пробелов)",
    logoBg: "bg-white border", logoText: "G",
  },
  other: {
    label: "Другой провайдер",
    hint: "Укажите host / port / шифрование вручную.",
    host: "", port: 465, encryption: "ssl",
    emailPlaceholder: "name@domain.com",
    passHint: "SMTP-пароль",
    logoBg: "bg-slate-500", logoText: "?",
  },
};

type Sender = {
  id: string;
  email: string;
  app_password: string | null;
  host: string;
  port: number;
  encryption: string;
  from_name: string | null;
  is_active: boolean;
  priority: number;
  daily_limit: number;
  sends_today: number;
  last_used_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  notes: string | null;
};

export function EmailSenderPoolManager() {
  const [rows, setRows] = useState<Sender[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Partial<Sender>>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("email_sender_pool")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    setRows((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter(r => r.is_active && r.app_password).length,
    withErrors: rows.filter(r => r.last_error).length,
    sendsToday: rows.reduce((s, r) => s + (r.sends_today || 0), 0),
  }), [rows]);

  const patch = (id: string, p: Partial<Sender>) =>
    setDrafts(d => ({ ...d, [id]: { ...d[id], ...p } }));

  const save = async (row: Sender) => {
    const draft = drafts[row.id] || {};
    if (Object.keys(draft).length === 0) return;
    setSavingId(row.id);
    const { error } = await supabase.from("email_sender_pool").update(draft).eq("id", row.id);
    setSavingId(null);
    if (error) return toast.error(error.message);
    toast.success("Сохранено");
    setDrafts(d => { const n = { ...d }; delete n[row.id]; return n; });
    load();
  };

  const remove = async (row: Sender) => {
    if (!confirm(`Удалить ${row.email}?`)) return;
    const { error } = await supabase.from("email_sender_pool").delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Удалено");
    load();
  };

  const toggleActive = async (row: Sender, v: boolean) => {
    if (v && !(drafts[row.id]?.app_password ?? row.app_password)) {
      return toast.error("Нужен app-пароль перед активацией");
    }
    const { error } = await supabase.from("email_sender_pool").update({ is_active: v }).eq("id", row.id);
    if (error) return toast.error(error.message);
    load();
  };

  const [newEmail, setNewEmail] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newHost, setNewHost] = useState("");
  const [newPort, setNewPort] = useState<number>(465);
  const [newEnc, setNewEnc] = useState<string>("ssl");
  const [newFromName, setNewFromName] = useState("Синтагма");
  const [addOpen, setAddOpen] = useState(false);
  const [provider, setProvider] = useState<ProviderKey | null>(null);
  const [adding, setAdding] = useState(false);

  const openAdd = () => { setAddOpen(true); setProvider(null); };
  const pickProvider = (p: ProviderKey) => {
    const cfg = PROVIDERS[p];
    setProvider(p);
    setNewEmail(""); setNewPass("");
    setNewHost(cfg.host); setNewPort(cfg.port); setNewEnc(cfg.encryption);
    setNewFromName("Синтагма");
  };
  const backToPicker = () => setProvider(null);
  const closeAdd = () => { setAddOpen(false); setProvider(null); };

  const submitAdd = async () => {
    if (!newEmail.trim()) return toast.error("Укажите email");
    if (!newHost.trim()) return toast.error("Укажите SMTP host");
    setAdding(true);
    const { error } = await supabase.from("email_sender_pool").insert({
      email: newEmail.trim(),
      app_password: newPass.trim() || null,
      host: newHost.trim(), port: newPort, encryption: newEnc,
      from_name: newFromName.trim() || "Синтагма",
      is_active: !!newPass.trim(),
    });
    setAdding(false);
    if (error) return toast.error(error.message);
    toast.success("Ящик добавлен");
    closeAdd();
    load();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
          <div>
            <div className="font-medium mb-1">Совет по паролям</div>
            <div className="text-muted-foreground">
              Для Gmail и Яндекса нужен <b>пароль приложения</b>, а не пароль от аккаунта.
              Для Timeweb и Mail.ru — обычно достаточно пароля от ящика (или пароля для внешних приложений).
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Всего" value={stats.total} />
        <StatCard label="Активных" value={stats.active} tone="ok" />
        <StatCard label="С ошибками" value={stats.withErrors} tone={stats.withErrors ? "err" : undefined} />
        <StatCard label="Отправлено сегодня" value={stats.sendsToday} />
      </div>

      <div className="flex justify-end">
        <Button onClick={openAdd} className="gap-1"><Plus className="w-4 h-4" />Добавить ящик</Button>
      </div>


      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Email</th>
                <th className="p-2 text-left">App-пароль</th>
                <th className="p-2 text-left">Хост:порт</th>
                <th className="p-2 text-left">От имени</th>
                <th className="p-2 text-center">Лимит/день</th>
                <th className="p-2 text-center">Сегодня</th>
                <th className="p-2 text-center">Активен</th>
                <th className="p-2 text-left">Последняя ошибка</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const d = drafts[r.id] || {};
                const dirty = Object.keys(d).length > 0;
                const currentPass = (d.app_password ?? r.app_password) || "";
                return (
                  <tr key={r.id} className="border-t align-top">
                    <td className="p-2 font-mono text-xs">
                      {r.email}
                      {r.app_password ? (
                        <CheckCircle2 className="inline w-3 h-3 text-emerald-500 ml-1" />
                      ) : (
                        <KeyRound className="inline w-3 h-3 text-amber-500 ml-1" />
                      )}
                    </td>
                    <td className="p-2 min-w-[180px]">
                      <Input
                        type="text"
                        className="h-8 text-xs font-mono"
                        value={currentPass}
                        placeholder="xxxx xxxx xxxx xxxx"
                        onChange={e => patch(r.id, { app_password: e.target.value })}
                      />
                    </td>
                    <td className="p-2 min-w-[160px]">
                      <div className="flex gap-1">
                        <Input className="h-8 text-xs" value={d.host ?? r.host} onChange={e => patch(r.id, { host: e.target.value })} />
                        <Input className="h-8 text-xs w-16" type="number" value={d.port ?? r.port} onChange={e => patch(r.id, { port: Number(e.target.value) })} />
                      </div>
                    </td>
                    <td className="p-2 min-w-[130px]">
                      <Input className="h-8 text-xs" value={d.from_name ?? r.from_name ?? ""} onChange={e => patch(r.id, { from_name: e.target.value })} />
                    </td>
                    <td className="p-2 text-center">
                      <Input className="h-8 text-xs w-20 text-center" type="number" value={d.daily_limit ?? r.daily_limit} onChange={e => patch(r.id, { daily_limit: Number(e.target.value) })} />
                    </td>
                    <td className="p-2 text-center text-xs text-muted-foreground">{r.sends_today}</td>
                    <td className="p-2 text-center">
                      <Switch checked={r.is_active} onCheckedChange={v => toggleActive(r, v)} />
                    </td>
                    <td className="p-2 max-w-[220px]">
                      {r.last_error ? (
                        <Badge variant="destructive" className="text-[10px] whitespace-normal">{r.last_error.slice(0, 80)}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-2 flex gap-1">
                      <Button size="sm" variant={dirty ? "default" : "outline"} disabled={!dirty || savingId === r.id} onClick={() => save(r)}>
                        {savingId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(r)}>
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="p-6 text-center text-sm text-muted-foreground">Пул пуст</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "ok" | "err" }) {
  const cls = tone === "ok" ? "text-emerald-600" : tone === "err" ? "text-destructive" : "";
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
