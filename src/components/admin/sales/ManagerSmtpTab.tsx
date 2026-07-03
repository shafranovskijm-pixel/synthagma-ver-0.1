import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Save, Send, KeyRound, Plus, Link2, Unlink } from "lucide-react";
import { safeInvoke } from "@/utils/safeInvoke";

type Sender = {
  id: string;
  email: string;
  app_password: string | null;
  host: string;
  port: number;
  encryption: string;
  from_name: string | null;
  is_active: boolean;
  daily_limit: number;
  sends_today: number;
  last_error: string | null;
  assigned_manager_id: string | null;
};

interface Props {
  managerId: string;
  managerFullName: string;
}

export function ManagerSmtpTab({ managerId, managerFullName }: Props) {
  const [mode, setMode] = useState<"pool" | "personal">("pool");
  const [rows, setRows] = useState<Sender[]>([]);
  const [free, setFree] = useState<Sender[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [savingMode, setSavingMode] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const { data: mgr } = await (supabase as any).from("sales_managers").select("email_sender_mode").eq("id", managerId).maybeSingle();
    setMode((mgr?.email_sender_mode as any) || "pool");
    const { data: all } = await (supabase as any).from("email_sender_pool").select("*").order("email");
    const list = (all as Sender[]) || [];
    setRows(list.filter(r => r.assigned_manager_id === managerId));
    setFree(list.filter(r => !r.assigned_manager_id));
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [managerId]);

  const changeMode = async (v: boolean) => {
    const next = v ? "personal" : "pool";
    setSavingMode(true);
    const { error } = await (supabase as any).from("sales_managers").update({ email_sender_mode: next }).eq("id", managerId);
    setSavingMode(false);
    if (error) return toast.error(error.message);
    setMode(next);
    toast.success(next === "personal" ? "Менеджер шлёт со своих ящиков" : "Менеджер шлёт из общего пула");
  };

  const assign = async (senderId: string) => {
    const { error } = await (supabase as any).from("email_sender_pool").update({ assigned_manager_id: managerId }).eq("id", senderId);
    if (error) return toast.error(error.message);
    load();
  };
  const unassign = async (senderId: string) => {
    const { error } = await (supabase as any).from("email_sender_pool").update({ assigned_manager_id: null }).eq("id", senderId);
    if (error) return toast.error(error.message);
    load();
  };
  const toggleActive = async (row: Sender, v: boolean) => {
    if (v && !row.app_password) return toast.error("Нужен app-пароль");
    const { error } = await (supabase as any).from("email_sender_pool").update({ is_active: v }).eq("id", row.id);
    if (error) return toast.error(error.message);
    load();
  };
  const savePassword = async (row: Sender) => {
    const val = drafts[row.id];
    if (val === undefined) return;
    const { error } = await (supabase as any).from("email_sender_pool").update({ app_password: val }).eq("id", row.id);
    if (error) return toast.error(error.message);
    setDrafts(d => { const n = { ...d }; delete n[row.id]; return n; });
    toast.success("Сохранено");
    load();
  };

  const testSmtp = async (row: Sender) => {
    setTestingId(row.id);
    const { data, error } = await safeInvoke<any>("test-sender-pool-smtp", { body: { sender_id: row.id } });
    setTestingId(null);
    if (error) return toast.error(error.message);
    if (data?.success) toast.success(`✅ Работает: ${row.email}`, { description: `Проверочное письмо на ${data.sent_to}` });
    else toast.error(`❌ ${row.email}`, { description: data?.error || "Ошибка отправки" });
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 rounded-lg border p-3 bg-muted/30">
        <div>
          <div className="text-sm font-medium">Режим отправки писем</div>
          <div className="text-xs text-muted-foreground max-w-md">
            {mode === "personal"
              ? "Только закреплённые за менеджером ящики. Если все заняты дневным лимитом — берётся общий пул."
              : "Используется общий пул отправителей (LRU)."}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Label htmlFor="mode-switch" className="text-xs">Свои ящики</Label>
          <Switch id="mode-switch" checked={mode === "personal"} onCheckedChange={changeMode} disabled={savingMode} />
        </div>
      </div>

      <div>
        <div className="text-sm font-medium mb-2">Закреплённые ящики ({rows.length})</div>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="text-xs text-muted-foreground py-3 border rounded-lg p-3 text-center">Нет закреплённых ящиков — прикрепите из списка ниже.</div>
        ) : (
          <div className="space-y-2">
            {rows.map(r => (
              <div key={r.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="font-mono text-xs">{r.email}</div>
                  <div className="flex items-center gap-2">
                    <Badge variant={r.is_active ? "default" : "secondary"} className="text-[10px]">{r.is_active ? "активен" : "выключен"}</Badge>
                    <span className="text-[10px] text-muted-foreground">{r.sends_today}/{r.daily_limit} сегодня</span>
                    <Switch checked={r.is_active} onCheckedChange={v => toggleActive(r, v)} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    className="h-8 text-xs font-mono"
                    placeholder={r.app_password ? "•••• •••• •••• ••••" : "app-пароль (16 символов)"}
                    value={drafts[r.id] ?? ""}
                    onChange={e => setDrafts(d => ({ ...d, [r.id]: e.target.value }))}
                  />
                  <Button size="sm" variant="outline" onClick={() => savePassword(r)} disabled={drafts[r.id] === undefined}>
                    <Save className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => testSmtp(r)} disabled={testingId === r.id}>
                    {testingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                    Тест
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => unassign(r.id)}>
                    <Unlink className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {r.last_error && <div className="text-[11px] text-destructive">Последняя ошибка: {r.last_error}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="text-sm font-medium mb-2">Свободные ящики пула ({free.length})</div>
        {free.length === 0 ? (
          <div className="text-xs text-muted-foreground">Все ящики распределены.</div>
        ) : (
          <div className="grid gap-2 max-h-64 overflow-y-auto pr-1">
            {free.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                <div className="min-w-0">
                  <div className="font-mono text-xs truncate">{r.email}</div>
                  <div className="text-[10px] text-muted-foreground">{r.app_password ? "app-пароль есть" : "нужен app-пароль"}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => assign(r.id)}>
                  <Link2 className="w-3.5 h-3.5 mr-1" />Прикрепить
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
