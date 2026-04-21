import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, GripVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  type EnrollmentConfig, type EnrollmentField, type EnrollmentMode,
  DEFAULT_ENROLLMENT_CONFIG, DEFAULT_ENROLLMENT_FIELDS,
} from "@/lib/landing-enrollment";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  config: EnrollmentConfig | null | undefined;
  onChange: (next: EnrollmentConfig) => void;
}

/**
 * Боковая панель «Регистрация» — настройка режима онбординга, группы,
 * полей формы и согласия на ПД. Сохраняется родительским редактором в
 * `landing_content.enrollment`.
 */
export function LandingRegistrationPanel({ open, onOpenChange, organizationId, config, onChange }: Props) {
  const cfg: EnrollmentConfig = { ...DEFAULT_ENROLLMENT_CONFIG, ...(config ?? {}) };
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!organizationId || !open) return;
    supabase
      .from("student_groups")
      .select("id, name")
      .eq("organization_id", organizationId)
      .order("name")
      .then(({ data }) => setGroups((data as any[]) ?? []));
  }, [organizationId, open]);

  const update = <K extends keyof EnrollmentConfig>(key: K, value: EnrollmentConfig[K]) => {
    onChange({ ...cfg, [key]: value });
  };

  const updateField = (idx: number, patch: Partial<EnrollmentField>) => {
    const next = [...cfg.fields];
    next[idx] = { ...next[idx], ...patch };
    update("fields", next);
  };

  const addField = () => {
    const idx = cfg.fields.length + 1;
    update("fields", [...cfg.fields, { key: `field_${idx}`, label: "Новое поле", type: "text", required: false }]);
  };

  const removeField = (idx: number) => {
    update("fields", cfg.fields.filter((_, i) => i !== idx));
  };

  const moveField = (idx: number, dir: -1 | 1) => {
    const next = [...cfg.fields];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    update("fields", next);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Регистрация на лендинге</SheetTitle>
          <SheetDescription>
            Настройте, как ученики попадают на курс через форму CTA. Можно оставить заявку на менеджера или сразу зачислять и слать пароль на почту.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Mode */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Режим обработки</Label>
            <div className="space-y-2">
              {(["request", "instant", "payment"] as EnrollmentMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => update("mode", m)}
                  className={cn(
                    "w-full text-left p-3 rounded-md border transition-colors",
                    cfg.mode === m ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                  )}
                >
                  <div className="font-medium text-sm">
                    {m === "request" && "Заявка менеджеру"}
                    {m === "instant" && "Мгновенное зачисление"}
                    {m === "payment" && "Только после оплаты"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {m === "request" && "Создаётся заявка, менеджер подтверждает вручную."}
                    {m === "instant" && "Ученик сразу создаётся и зачисляется. Логин/пароль на email."}
                    {m === "payment" && "Зачисление после успешной оплаты через платёжный шлюз."}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Group */}
          {cfg.mode === "instant" && (
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Группа набора (опционально)</Label>
              <Select
                value={cfg.student_group_id ?? "none"}
                onValueChange={(v) => update("student_group_id", v === "none" ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="Без группы" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без группы</SelectItem>
                  {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Email credentials */}
          {cfg.mode === "instant" && (
            <label className="flex items-center justify-between gap-3 p-3 border rounded-md">
              <div>
                <div className="text-sm font-medium">Слать пароль на email</div>
                <div className="text-xs text-muted-foreground">Иначе ученик сможет восстановить через «Забыли пароль»</div>
              </div>
              <Switch checked={cfg.send_credentials_email} onCheckedChange={(v) => update("send_credentials_email", v)} />
            </label>
          )}

          {/* Fields */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Поля формы</Label>
              <Button size="sm" variant="ghost" onClick={addField}><Plus className="w-3.5 h-3.5 mr-1" />Поле</Button>
            </div>
            <div className="space-y-2">
              {cfg.fields.map((f, idx) => (
                <div key={idx} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <button type="button" className="text-muted-foreground" title="Двигать"
                      onClick={() => moveField(idx, -1)}><GripVertical className="w-4 h-4" /></button>
                    <Input
                      className="h-8"
                      placeholder="Подпись"
                      value={f.label}
                      onChange={(e) => updateField(idx, { label: e.target.value })}
                    />
                    <Button size="icon" variant="ghost" onClick={() => removeField(idx)} title="Удалить">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={f.type} onValueChange={(v) => updateField(idx, { type: v as any })}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Текст</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="phone">Телефон</SelectItem>
                        <SelectItem value="select">Выбор</SelectItem>
                        <SelectItem value="checkbox">Чекбокс</SelectItem>
                        <SelectItem value="inn">ИНН</SelectItem>
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-2 text-xs">
                      <Switch checked={f.required} onCheckedChange={(v) => updateField(idx, { required: v })} />
                      Обязательное
                    </label>
                  </div>
                  {f.type === "select" && (
                    <Input
                      className="h-8"
                      placeholder="Варианты через запятую"
                      value={(f.options ?? []).join(", ")}
                      onChange={(e) => updateField(idx, { options: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                    />
                  )}
                </div>
              ))}
              {cfg.fields.length === 0 && (
                <Button variant="outline" size="sm" onClick={() => update("fields", DEFAULT_ENROLLMENT_FIELDS)}>
                  Использовать стандартные (имя, email, телефон)
                </Button>
              )}
            </div>
          </div>

          {/* Consent */}
          <div className="space-y-2">
            <label className="flex items-center justify-between gap-3 p-3 border rounded-md">
              <div>
                <div className="text-sm font-medium">Согласие на обработку ПД</div>
                <div className="text-xs text-muted-foreground">Чекбокс обязателен по 152-ФЗ</div>
              </div>
              <Switch checked={cfg.consent_required} onCheckedChange={(v) => update("consent_required", v)} />
            </label>
            {cfg.consent_required && (
              <Input
                placeholder="Ссылка на политику ПД"
                value={cfg.consent_url ?? ""}
                onChange={(e) => update("consent_url", e.target.value)}
              />
            )}
          </div>

          {/* Lead-magnet */}
          <div className="space-y-2 rounded-md border p-3 bg-muted/20">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Лид-магнит (PDF/файл)</Label>
            <p className="text-xs text-muted-foreground">
              Высылается на email сразу после сабмита формы. Например, чек-лист или памятка для стимулирования регистрации.
            </p>
            <LeadMagnetUploader
              organizationId={organizationId}
              currentUrl={cfg.lead_magnet_url}
              currentLabel={cfg.lead_magnet_label}
              onChange={(url, label) => onChange({ ...cfg, lead_magnet_url: url, lead_magnet_label: label })}
            />
          </div>

          {/* Telegram */}
          <label className="flex items-center justify-between gap-3 p-3 border rounded-md">
            <div>
              <div className="text-sm font-medium">Уведомлять в Telegram</div>
              <div className="text-xs text-muted-foreground">Будет отправлено боту, привязанному к школе. Настройте chat&nbsp;ID в профиле организации.</div>
            </div>
            <Switch checked={cfg.notify_telegram} onCheckedChange={(v) => update("notify_telegram", v)} />
          </label>

          {/* Success */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Успешный сабмит</Label>
            <Input
              placeholder="Сообщение после отправки"
              value={cfg.success_message ?? ""}
              onChange={(e) => update("success_message", e.target.value)}
            />
            <Input
              placeholder="URL редиректа (опционально)"
              value={cfg.success_url ?? ""}
              onChange={(e) => update("success_url", e.target.value)}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
