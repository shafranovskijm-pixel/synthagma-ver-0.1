import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Mail, Clock, Users, Play, Pause, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface Sequence {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

interface Step {
  id: string;
  sequence_id: string;
  step_order: number;
  delay_days: number;
  delay_hours: number;
  subject: string;
  html: string;
}

interface Subscriber {
  id: string;
  email: string;
  recipient_name: string | null;
  status: string;
  current_step: number;
  next_send_at: string;
  subscribed_at: string;
}

export function DripCampaignsManager() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSeq, setActiveSeq] = useState<Sequence | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const [stepOpen, setStepOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<Partial<Step> | null>(null);

  const [addSubsOpen, setAddSubsOpen] = useState(false);
  const [subsEmails, setSubsEmails] = useState("");

  const fetchSequences = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("email_drip_sequences")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) {
      setSequences(data as Sequence[]);
      // Load subscriber counts
      const c: Record<string, number> = {};
      for (const seq of data as Sequence[]) {
        const { count } = await supabase
          .from("email_drip_subscribers")
          .select("id", { count: "exact", head: true })
          .eq("sequence_id", seq.id)
          .eq("status", "active");
        c[seq.id] = count || 0;
      }
      setCounts(c);
    }
    setLoading(false);
  };

  useEffect(() => { fetchSequences(); }, []);

  const loadSeqDetails = async (seq: Sequence) => {
    setActiveSeq(seq);
    const [stepsRes, subsRes] = await Promise.all([
      supabase.from("email_drip_steps").select("*").eq("sequence_id", seq.id).order("step_order"),
      supabase.from("email_drip_subscribers").select("*").eq("sequence_id", seq.id).order("subscribed_at", { ascending: false }).limit(100),
    ]);
    setSteps((stepsRes.data || []) as Step[]);
    setSubscribers((subsRes.data || []) as Subscriber[]);
  };

  const createSequence = async () => {
    if (!newName.trim()) { toast.error("Введите название"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("email_drip_sequences")
      .insert({ name: newName.trim(), description: newDesc.trim() || null, created_by: user?.id })
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    toast.success("Последовательность создана");
    setCreateOpen(false);
    setNewName(""); setNewDesc("");
    fetchSequences();
    if (data) loadSeqDetails(data as Sequence);
  };

  const toggleActive = async (seq: Sequence) => {
    const { error } = await supabase
      .from("email_drip_sequences")
      .update({ is_active: !seq.is_active })
      .eq("id", seq.id);
    if (error) { toast.error(error.message); return; }
    toast.success(seq.is_active ? "Приостановлено" : "Запущено");
    fetchSequences();
    if (activeSeq?.id === seq.id) setActiveSeq({ ...seq, is_active: !seq.is_active });
  };

  const deleteSequence = async (seq: Sequence) => {
    if (!confirm(`Удалить «${seq.name}» вместе со всеми шагами и подписчиками?`)) return;
    const { error } = await supabase.from("email_drip_sequences").delete().eq("id", seq.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Удалено");
    if (activeSeq?.id === seq.id) setActiveSeq(null);
    fetchSequences();
  };

  const openNewStep = () => {
    setEditingStep({
      step_order: (steps[steps.length - 1]?.step_order || 0) + 1,
      delay_days: steps.length === 0 ? 0 : 3,
      delay_hours: 0,
      subject: "",
      html: "",
    });
    setStepOpen(true);
  };

  const saveStep = async () => {
    if (!activeSeq || !editingStep) return;
    if (!editingStep.subject?.trim() || !editingStep.html?.trim()) {
      toast.error("Заполните тему и тело письма"); return;
    }
    if (editingStep.id) {
      const { error } = await supabase.from("email_drip_steps").update({
        subject: editingStep.subject,
        html: editingStep.html,
        delay_days: editingStep.delay_days || 0,
        delay_hours: editingStep.delay_hours || 0,
      }).eq("id", editingStep.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("email_drip_steps").insert({
        sequence_id: activeSeq.id,
        step_order: editingStep.step_order || 1,
        delay_days: editingStep.delay_days || 0,
        delay_hours: editingStep.delay_hours || 0,
        subject: editingStep.subject,
        html: editingStep.html,
      });
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Шаг сохранён");
    setStepOpen(false);
    setEditingStep(null);
    loadSeqDetails(activeSeq);
  };

  const deleteStep = async (id: string) => {
    if (!confirm("Удалить шаг?")) return;
    const { error } = await supabase.from("email_drip_steps").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    if (activeSeq) loadSeqDetails(activeSeq);
  };

  const addSubscribers = async () => {
    if (!activeSeq) return;
    const emails = subsEmails
      .split(/[\s,;\n]+/)
      .map(e => e.trim().toLowerCase())
      .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (emails.length === 0) { toast.error("Не найдено корректных email"); return; }
    const dedup = Array.from(new Set(emails));
    const rows = dedup.map(email => ({
      sequence_id: activeSeq.id,
      email,
      next_send_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("email_drip_subscribers")
      .upsert(rows, { onConflict: "sequence_id,email", ignoreDuplicates: true });
    if (error) { toast.error(error.message); return; }
    toast.success(`Добавлено ${dedup.length} подписчиков`);
    setAddSubsOpen(false);
    setSubsEmails("");
    loadSeqDetails(activeSeq);
  };

  const triggerNow = async () => {
    toast.info("Запускаю обработку...");
    const { data, error } = await supabase.functions.invoke("process-drip-campaigns");
    if (error) { toast.error(error.message); return; }
    toast.success(`Обработано: ${data?.processed || 0}, отправлено: ${data?.sent || 0}`);
    if (activeSeq) loadSeqDetails(activeSeq);
  };

  if (loading) return <div className="flex justify-center py-8"><SigmaSpinner /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Drip-кампании (последовательности писем)
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={triggerNow}>Запустить сейчас</Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" /> Новая последовательность
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Автоматические цепочки писем с задержками. Например: «1-е письмо сразу → 2-е через 3 дня → 3-е через 7 дней».
            Обработка запускается каждые 5 минут по расписанию.
          </p>

          {sequences.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Последовательностей пока нет</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {sequences.map(seq => (
                <button
                  key={seq.id}
                  onClick={() => loadSeqDetails(seq)}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    activeSeq?.id === seq.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{seq.name}</p>
                      {seq.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{seq.description}</p>
                      )}
                    </div>
                    <Badge variant={seq.is_active ? "default" : "secondary"} className="shrink-0">
                      {seq.is_active ? "Активна" : "На паузе"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" />{counts[seq.id] || 0}</span>
                    <span>{format(new Date(seq.created_at), "d MMM", { locale: ru })}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {activeSeq && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{activeSeq.name}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {steps.length} {steps.length === 1 ? "шаг" : "шагов"} · {subscribers.length} подписчиков
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => toggleActive(activeSeq)} className="gap-2">
                {activeSeq.is_active ? <><Pause className="w-4 h-4" />Пауза</> : <><Play className="w-4 h-4" />Запустить</>}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => deleteSequence(activeSeq)} className="gap-2">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Steps */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Шаги последовательности</h3>
                <Button size="sm" variant="outline" onClick={openNewStep} className="gap-2">
                  <Plus className="w-3 h-3" />Добавить шаг
                </Button>
              </div>
              {steps.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Шагов пока нет. Добавьте первое письмо.</p>
              ) : (
                <div className="space-y-2">
                  {steps.map((step, i) => (
                    <div key={step.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                      <Badge className="shrink-0">#{step.step_order}</Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{step.subject}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {i === 0 ? "Сразу при подписке" : `Через ${step.delay_days}д ${step.delay_hours}ч после предыдущего`}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => { setEditingStep(step); setStepOpen(true); }}>
                        Редактировать
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteStep(step.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Subscribers */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Подписчики</h3>
                <Button size="sm" variant="outline" onClick={() => setAddSubsOpen(true)} className="gap-2">
                  <Plus className="w-3 h-3" />Добавить
                </Button>
              </div>
              {subscribers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Подписчиков пока нет</p>
              ) : (
                <div className="max-h-[400px] overflow-y-auto space-y-1 border rounded-lg p-2">
                  {subscribers.map(sub => (
                    <div key={sub.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted/40">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{sub.email}</p>
                        <p className="text-xs text-muted-foreground">
                          Шаг {sub.current_step}/{steps.length} · след. {format(new Date(sub.next_send_at), "d MMM HH:mm", { locale: ru })}
                        </p>
                      </div>
                      <Badge variant={
                        sub.status === "active" ? "default" :
                        sub.status === "completed" ? "secondary" :
                        sub.status === "unsubscribed" ? "destructive" : "outline"
                      } className="text-xs shrink-0">
                        {sub.status === "active" ? "Активный" :
                         sub.status === "completed" ? "Завершён" :
                         sub.status === "unsubscribed" ? "Отписан" : sub.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Новая последовательность</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Название</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Прогрев новых клиентов" />
            </div>
            <div>
              <Label>Описание</Label>
              <Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button onClick={createSequence}>Создать</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step editor */}
      <Dialog open={stepOpen} onOpenChange={setStepOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingStep?.id ? "Редактировать шаг" : "Новый шаг"} #{editingStep?.step_order}</DialogTitle>
          </DialogHeader>
          {editingStep && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Задержка (дней)</Label>
                  <Input
                    type="number" min={0}
                    value={editingStep.delay_days || 0}
                    onChange={e => setEditingStep({ ...editingStep, delay_days: parseInt(e.target.value) || 0 })}
                    disabled={editingStep.step_order === 1}
                  />
                </div>
                <div>
                  <Label>Задержка (часов)</Label>
                  <Input
                    type="number" min={0} max={23}
                    value={editingStep.delay_hours || 0}
                    onChange={e => setEditingStep({ ...editingStep, delay_hours: parseInt(e.target.value) || 0 })}
                    disabled={editingStep.step_order === 1}
                  />
                </div>
              </div>
              {editingStep.step_order === 1 && (
                <p className="text-xs text-muted-foreground">Первое письмо отправляется сразу после подписки</p>
              )}
              <div>
                <Label>Тема письма</Label>
                <Input
                  value={editingStep.subject || ""}
                  onChange={e => setEditingStep({ ...editingStep, subject: e.target.value })}
                  placeholder="Доступны переменные: {{name}}, {{email}}"
                />
              </div>
              <div>
                <Label>HTML тело</Label>
                <Textarea
                  rows={10}
                  value={editingStep.html || ""}
                  onChange={e => setEditingStep({ ...editingStep, html: e.target.value })}
                  placeholder="<p>Здравствуйте, {{name}}!</p>..."
                  className="font-mono text-xs"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStepOpen(false)}>Отмена</Button>
            <Button onClick={saveStep}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add subscribers */}
      <Dialog open={addSubsOpen} onOpenChange={setAddSubsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Добавить подписчиков</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Email-адреса (через запятую, пробел или с новой строки)</Label>
            <Textarea
              rows={8}
              value={subsEmails}
              onChange={e => setSubsEmails(e.target.value)}
              placeholder="ivan@example.com&#10;maria@example.com"
            />
            <p className="text-xs text-muted-foreground">
              Дубликаты автоматически игнорируются. Первое письмо отправится при ближайшем запуске обработки.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSubsOpen(false)}>Отмена</Button>
            <Button onClick={addSubscribers}>Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
