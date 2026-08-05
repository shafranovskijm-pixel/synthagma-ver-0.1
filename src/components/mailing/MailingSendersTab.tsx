import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AtSign, Plus, Server, Trash2, Wand2 } from "lucide-react";
import { TORGI_PRESET, useMailingSenders, type SenderInput } from "@/hooks/useMailingSenders";

interface Props {
  organizationId: string | null;
}

const EMPTY: SenderInput = {
  label: "",
  from_name: "",
  from_email: "",
  smtp_host: "",
  smtp_port: 465,
  smtp_security: "ssl",
  smtp_username: "",
  password: "",
  imap_host: "",
  imap_port: 993,
  imap_security: "ssl",
  imap_username: "",
  daily_limit: 200,
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ok: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
    error: "bg-destructive/10 text-destructive border-destructive/30",
    untested: "bg-muted text-muted-foreground",
  };
  const label: Record<string, string> = {
    ok: "verified",
    error: "error",
    untested: "не проверен",
  };
  return (
    <Badge variant="outline" className={map[status] ?? map.untested}>
      {label[status] ?? status}
    </Badge>
  );
}

export function MailingSendersTab({ organizationId }: Props) {
  const { senders, loading, saving, testingId, save, remove, testConnection } =
    useMailingSenders(organizationId);
  const [form, setForm] = useState<SenderInput | null>(null);

  const set = (patch: Partial<SenderInput>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const applyPreset = () =>
    set({
      label: TORGI_PRESET.label,
      smtp_host: TORGI_PRESET.smtp_host,
      smtp_port: TORGI_PRESET.smtp_port,
      smtp_security: TORGI_PRESET.smtp_security,
      imap_host: TORGI_PRESET.imap_host,
      imap_port: TORGI_PRESET.imap_port,
      imap_security: TORGI_PRESET.imap_security,
    });

  const submit = async () => {
    if (!form) return;
    const ok = await save(form);
    if (ok) setForm(null);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            Отправители организации
            <Badge variant="secondary">{senders.length}</Badge>
          </CardTitle>
          <Button className="gap-2" onClick={() => setForm({ ...EMPTY })}>
            <Plus className="h-4 w-4" />
            Подключить ящик
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Это отдельная модель нескольких ящиков. Существующая единственная SMTP-настройка
            организации (раздел CRM) не изменяется и продолжает работать как раньше.
          </p>

          {loading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : senders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Отправителей пока нет. Подключите ящик — потребуется SMTP и, при желании, IMAP.
            </p>
          ) : (
            <div className="divide-y rounded-lg border">
              {senders.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      <AtSign className="h-3.5 w-3.5 text-muted-foreground" />
                      {s.from_name ? `${s.from_name} <${s.from_email}>` : s.from_email}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {s.label} · SMTP {s.smtp_host}:{s.smtp_port} ({s.smtp_security})
                      {s.imap_host ? ` · IMAP ${s.imap_host}:${s.imap_port}` : ""} · лимит{" "}
                      {s.daily_limit}/сутки
                    </p>
                    {s.last_error && (
                      <p className="truncate text-xs text-destructive">{s.last_error}</p>
                    )}
                    {s.last_tested_at && (
                      <p className="text-[11px] text-muted-foreground">
                        Проверено: {new Date(s.last_tested_at).toLocaleString("ru-RU")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">SMTP</span>
                    <StatusBadge status={s.smtp_status} />
                    <span className="text-xs text-muted-foreground">IMAP</span>
                    <StatusBadge status={s.imap_status} />
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={testingId === s.id}
                      onClick={() => testConnection(s.id, "smtp")}
                    >
                      Тест SMTP
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={testingId === s.id || !s.imap_host}
                      onClick={() => testConnection(s.id, "imap")}
                    >
                      Тест IMAP
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(s.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Подключение ящика</DialogTitle>
            <DialogDescription>
              Пароль передаётся только на сервер, хранится зашифрованным и никогда не отображается
              повторно.
            </DialogDescription>
          </DialogHeader>

          {form && (
            <div className="space-y-4">
              <Button variant="outline" size="sm" className="gap-2" onClick={applyPreset}>
                <Wand2 className="h-4 w-4" />
                Пресет torgi.com.ru (без пароля)
              </Button>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Название</Label>
                  <Input value={form.label} onChange={(e) => set({ label: e.target.value })} />
                </div>
                <div>
                  <Label>Имя отправителя</Label>
                  <Input value={form.from_name} onChange={(e) => set({ from_name: e.target.value })} />
                </div>
                <div>
                  <Label>Email отправителя</Label>
                  <Input
                    type="email"
                    value={form.from_email}
                    onChange={(e) => set({ from_email: e.target.value, smtp_username: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Логин SMTP</Label>
                  <Input
                    value={form.smtp_username}
                    onChange={(e) => set({ smtp_username: e.target.value })}
                  />
                </div>
                <div>
                  <Label>SMTP хост</Label>
                  <Input value={form.smtp_host} onChange={(e) => set({ smtp_host: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Порт</Label>
                    <Input
                      type="number"
                      value={form.smtp_port}
                      onChange={(e) => set({ smtp_port: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Шифрование</Label>
                    <Select value={form.smtp_security} onValueChange={(v) => set({ smtp_security: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ssl">SSL/TLS</SelectItem>
                        <SelectItem value="tls">STARTTLS</SelectItem>
                        <SelectItem value="none">Без шифрования</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>IMAP хост (необязательно)</Label>
                  <Input value={form.imap_host} onChange={(e) => set({ imap_host: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>IMAP порт</Label>
                    <Input
                      type="number"
                      value={form.imap_port}
                      onChange={(e) => set({ imap_port: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>IMAP шифрование</Label>
                    <Select value={form.imap_security} onValueChange={(v) => set({ imap_security: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ssl">SSL/TLS</SelectItem>
                        <SelectItem value="tls">STARTTLS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Пароль</Label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => set({ password: e.target.value })}
                    placeholder={form.id ? "оставьте пустым, чтобы не менять" : ""}
                  />
                </div>
                <div>
                  <Label>Лимит писем в сутки</Label>
                  <Input
                    type="number"
                    value={form.daily_limit}
                    onChange={(e) => set({ daily_limit: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Отмена
            </Button>
            <Button
              onClick={submit}
              disabled={
                saving ||
                !form?.label.trim() ||
                !form?.from_email.trim() ||
                !form?.smtp_host.trim() ||
                !form?.smtp_username.trim()
              }
            >
              {saving ? "Сохраняем…" : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
