import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Search, Filter, TerminalSquare, Plus, Trash2, KeyRound, Mail, Settings2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type Sender = {
  id: string;
  email: string;
  app_password: string | null;
  host: string;
  port: number;
  encryption: string;
  from_name: string | null;
  is_active: boolean;
  warmup_enabled: boolean;
  daily_limit: number;
  sends_today: number;
  total_sent: number;
  last_error: string | null;
  last_error_at: string | null;
  warmup_daily_target: number;
  warmup_start_count: number;
  warmup_inbox_count: number;
  warmup_spam_count: number;
};



const providerIcon = (email: string) => {
  const domain = (email.split("@")[1] || "").toLowerCase();
  if (domain.endsWith("gmail.com") || domain.endsWith("yi.mannni.com")) {
    return { color: "bg-white border", letter: "G", text: "text-[#EA4335]" };
  }
  if (domain.endsWith("vk.com") || domain.endsWith("mail.ru")) {
    return { color: "bg-[#0077FF]", letter: "M", text: "text-white" };
  }
  return { color: "bg-primary/10", letter: <Mail className="w-4 h-4 text-primary" />, text: "" };
};

const reputationScore = (r: Sender): number | null => {
  if (!r.app_password || !r.is_active) return null;
  const inbox = r.warmup_inbox_count ?? 0;
  const spam = r.warmup_spam_count ?? 0;
  const total = inbox + spam;
  // Нет данных о размещении — репутация ещё не измерена
  if (total === 0) return null;
  // Доля писем во «Входящих» = репутация
  return Math.round((inbox / total) * 100);
};


const reputationTone = (score: number | null) => {
  if (score === null) return "bg-muted text-muted-foreground";
  if (score >= 95) return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
  if (score >= 80) return "bg-lime-500/15 text-lime-700 dark:text-lime-400";
  if (score >= 60) return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  return "bg-destructive/15 text-destructive";
};

export function SenderInboxesTable() {
  const [rows, setRows] = useState<Sender[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPass, setNewPass] = useState("");
  const [checking, setChecking] = useState(false);
  const [editing, setEditing] = useState<Sender | null>(null);
  const [warmupCfg, setWarmupCfg] = useState<{ row: Sender; target: number; start: number; applyAll: boolean } | null>(null);


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

  const filtered = useMemo(() => {
    let list = rows;
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter(r => r.email.toLowerCase().includes(s) || (r.from_name || "").toLowerCase().includes(s));
    }
    if (onlyActive) list = list.filter(r => r.is_active);
    return list;
  }, [rows, q, onlyActive]);

  const toggleWarmup = async (row: Sender, v: boolean) => {
    if (v && !row.app_password) return toast.error("Сначала укажите app-пароль");
    const { error } = await supabase.from("email_sender_pool").update({
      warmup_enabled: v,
      is_active: v ? true : row.is_active,
    }).eq("id", row.id);
    if (error) return toast.error(error.message);
    load();
  };

  const bulkToggle = async (v: boolean) => {
    if (selected.size === 0) return;
    const ids = [...selected];
    const { error } = await supabase.from("email_sender_pool")
      .update({ warmup_enabled: v, is_active: v })
      .in("id", ids);
    if (error) return toast.error(error.message);
    setSelected(new Set());
    toast.success(v ? "Прогрев включён" : "Прогрев выключен");
    load();
  };

  const bulkDelete = async () => {
    if (selected.size === 0 || !confirm(`Удалить ${selected.size} ящик(ов)?`)) return;
    const { error } = await supabase.from("email_sender_pool").delete().in("id", [...selected]);
    if (error) return toast.error(error.message);
    setSelected(new Set());
    load();
  };

  const addSender = async () => {
    if (!newEmail.trim()) return;
    const { error } = await supabase.from("email_sender_pool").insert({
      email: newEmail.trim(),
      app_password: newPass.trim() || null,
      host: "smtp.gmail.com", port: 465, encryption: "ssl",
      from_name: "Синтагма",
      is_active: !!newPass.trim(),
      warmup_enabled: !!newPass.trim(),
    });
    if (error) return toast.error(error.message);
    setNewEmail(""); setNewPass(""); setAddOpen(false);
    toast.success("Ящик добавлен");
    load();
  };

  const runCheck = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("autocheck-sender-pool");
      if (error) throw error;
      toast.success(`Проверено. OK: ${(data as any)?.ok_count ?? 0}`);
      load();
    } catch (e: any) {
      toast.error(e.message || "Ошибка проверки");
    } finally { setChecking(false); }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const { error } = await supabase.from("email_sender_pool").update({
      email: editing.email,
      app_password: editing.app_password,
      host: editing.host,
      port: editing.port,
      encryption: editing.encryption,
      from_name: editing.from_name,
      daily_limit: editing.daily_limit,
    }).eq("id", editing.id);
    if (error) return toast.error(error.message);
    setEditing(null);
    toast.success("Сохранено");
    load();
  };

  const saveWarmupCfg = async () => {
    if (!warmupCfg) return;
    const target = Math.max(1, Math.min(50, Number(warmupCfg.target) || 20));
    const start = Math.max(1, Math.min(target, Number(warmupCfg.start) || 1));
    const patch: any = {
      warmup_daily_target: target,
      warmup_start_count: start,
      warmup_enabled: true,
      is_active: true,
    };
    const q = supabase.from("email_sender_pool").update(patch as any);
    const { error } = warmupCfg.applyAll
      ? await (q as any).not("id", "is", null)
      : await q.eq("id", warmupCfg.row.id);
    if (error) return toast.error(error.message);
    setWarmupCfg(null);
    toast.success(warmupCfg.applyAll ? "Настройки применены ко всем ящикам" : "Настройки прогрева сохранены");
    load();
  };



  const allChecked = filtered.length > 0 && filtered.every(r => selected.has(r.id));

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} className="pl-9" placeholder="Поиск по ящику..." />
        </div>
        <Button variant="outline" size="icon" onClick={() => setOnlyActive(v => !v)} className={cn(onlyActive && "border-primary text-primary")} title="Только активные">
          <Filter className="w-4 h-4" />
        </Button>
        {selected.size > 0 && (
          <>
            <Button variant="outline" size="sm" onClick={() => bulkToggle(true)}>Прогрев ВКЛ ({selected.size})</Button>
            <Button variant="outline" size="sm" onClick={() => bulkToggle(false)}>Прогрев ВЫКЛ</Button>
            <Button variant="outline" size="sm" onClick={bulkDelete}><Trash2 className="w-4 h-4 mr-1 text-destructive" />Удалить</Button>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" onClick={runCheck} disabled={checking} className="gap-1">
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <TerminalSquare className="w-4 h-4" />}
            Проверка настроек
          </Button>
          <Button onClick={() => setAddOpen(true)} className="gap-1"><Plus className="w-4 h-4" />Добавить ящик</Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="p-3 w-10">
                  <Checkbox checked={allChecked} onCheckedChange={(v) => {
                    if (v) setSelected(new Set(filtered.map(r => r.id))); else setSelected(new Set());
                  }} />
                </th>
                <th className="p-3 text-left font-medium">Почта</th>
                <th className="p-3 text-left font-medium">Прогрев</th>
                <th className="p-3 text-left font-medium">Репутация</th>
                <th className="p-3 text-left font-medium">Писем (сегодня)</th>
                <th className="p-3 text-left font-medium">Писем (все время)</th>
                <th className="p-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="p-10 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="p-10 text-center text-muted-foreground">Ящики не найдены</td></tr>
              )}
              {filtered.map(r => {
                const p = providerIcon(r.email);
                const score = reputationScore(r);
                const dkimIssue = /dkim/i.test(r.last_error || "");
                const isSel = selected.has(r.id);
                return (
                  <tr key={r.id} className="border-t hover:bg-muted/20 transition-colors">
                    <td className="p-3">
                      <Checkbox checked={isSel} onCheckedChange={(v) => {
                        setSelected(prev => {
                          const n = new Set(prev);
                          if (v) n.add(r.id); else n.delete(r.id);
                          return n;
                        });
                      }} />
                    </td>
                    <td className="p-3">
                      <button onClick={() => setEditing(r)} className="flex items-center gap-3 text-left group">
                        <div className={cn("w-9 h-9 rounded-full grid place-items-center font-bold text-sm shrink-0", p.color, p.text)}>
                          {p.letter}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold group-hover:text-primary transition-colors truncate">
                              {r.from_name || r.email.split("@")[0]}
                            </span>
                            {dkimIssue && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive font-medium">⚠ DKIM</span>
                            )}
                            {!r.app_password && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 font-medium flex items-center gap-0.5">
                                <KeyRound className="w-3 h-3" />нет пароля
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                        </div>
                      </button>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <Switch checked={r.warmup_enabled && r.is_active} onCheckedChange={v => toggleWarmup(r, v)} />
                        <div className="min-w-0">
                          <div className={cn("text-sm font-medium", r.warmup_enabled && r.is_active ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                            {r.warmup_enabled && r.is_active ? "Включен" : "Выключен"}
                          </div>
                          {r.warmup_enabled && r.is_active && (
                            <div className="text-xs text-muted-foreground">
                              {r.sends_today} из {r.warmup_daily_target ?? 20}/день · старт {r.warmup_start_count ?? 1}
                            </div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 ml-1 text-muted-foreground hover:text-primary"
                          title="Настройки прогрева"
                          onClick={() => setWarmupCfg({
                            row: r,
                            target: r.warmup_daily_target ?? 20,
                            start: r.warmup_start_count ?? 1,
                            applyAll: false,
                          })}
                        >
                          <Settings2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>

                    <td className="p-3">
                      <span className={cn("inline-flex items-center px-2.5 py-1 rounded-md font-semibold text-xs", reputationTone(score))}>
                        {score === null ? "N/A" : `${score}%`}
                      </span>
                    </td>
                    <td className="p-3 tabular-nums">
                      <span className="font-medium">{r.sends_today}</span>
                      <span className="text-muted-foreground"> /{r.daily_limit}</span>
                    </td>
                    <td className="p-3 tabular-nums font-medium">{r.total_sent}</td>
                    <td className="p-3">
                      {r.last_error && (
                        <span title={r.last_error} className="text-xs text-destructive">●</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Добавить ящик</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Email</label>
              <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="name@yi.mannni.com" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">App-пароль (16 символов, Gmail SMTP)</label>
              <Input value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="xxxx xxxx xxxx xxxx" />
              <p className="text-[11px] text-muted-foreground mt-1">
                Пароль генерируется в Google Account → Security → App passwords. Обычный пароль SMTP не примет.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Отмена</Button>
            <Button onClick={addSender}>Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Настройки ящика</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">Email</label>
                <Input value={editing.email} onChange={e => setEditing({ ...editing, email: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">App-пароль</label>
                <Input value={editing.app_password || ""} onChange={e => setEditing({ ...editing, app_password: e.target.value })} className="font-mono" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">Отображаемое имя</label>
                <Input value={editing.from_name || ""} onChange={e => setEditing({ ...editing, from_name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">SMTP host</label>
                <Input value={editing.host} onChange={e => setEditing({ ...editing, host: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Port</label>
                <Input type="number" value={editing.port} onChange={e => setEditing({ ...editing, port: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Шифрование</label>
                <Input value={editing.encryption} onChange={e => setEditing({ ...editing, encryption: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Лимит/день</label>
                <Input type="number" value={editing.daily_limit} onChange={e => setEditing({ ...editing, daily_limit: Number(e.target.value) })} />
              </div>
              {editing.last_error && (
                <div className="col-span-2 text-xs bg-destructive/10 text-destructive p-2 rounded">
                  Последняя ошибка: {editing.last_error}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Отмена</Button>
            <Button onClick={saveEdit}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Warmup settings dialog */}
      <Dialog open={!!warmupCfg} onOpenChange={(o) => !o && setWarmupCfg(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Настройки прогрева</DialogTitle></DialogHeader>
          {warmupCfg && (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Прогрев автоматически повышает репутацию ваших почт.
              </p>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Лимит прогрева в день (максимум 50)</label>
                <p className="text-xs text-muted-foreground">
                  Мы автоматом будем повышать количество писем в день до выбранного числа для плавного прогрева почты.
                </p>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={warmupCfg.target}
                  onChange={(e) => setWarmupCfg({ ...warmupCfg, target: Number(e.target.value) })}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Стартовое число прогрева (максимум {warmupCfg.target})</label>
                <p className="text-xs text-muted-foreground">
                  Меняйте эту настройку только если мигрируете из другого софта для прогрева почт.
                </p>
                <Input
                  type="number"
                  min={1}
                  max={warmupCfg.target}
                  value={warmupCfg.start}
                  onChange={(e) => setWarmupCfg({ ...warmupCfg, start: Number(e.target.value) })}
                />
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={warmupCfg.applyAll}
                  onCheckedChange={(v) => setWarmupCfg({ ...warmupCfg, applyAll: !!v })}
                />
                <span>Применить настройки на другие почты</span>
                <Info className="w-3.5 h-3.5 text-muted-foreground" />
              </label>

              <div className="text-xs text-muted-foreground border-t pt-3">
                Ящик: <span className="font-medium text-foreground">{warmupCfg.row.email}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setWarmupCfg(null)}>Отменить</Button>
            <Button onClick={saveWarmupCfg}>Включить прогрев</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

  );
}
