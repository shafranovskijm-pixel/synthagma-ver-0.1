import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, CheckCircle, Clock, Users, TrendingUp, CalendarClock, Plug, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface Props {
  userId: string;
  userEmail?: string;
  userName?: string;
}

export function StudentPartnerTab({ userId, userEmail, userName }: Props) {
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);

  const [fullName, setFullName] = useState(userName || "");
  const [email, setEmail] = useState(userEmail || "");
  const [phone, setPhone] = useState("");
  const [inn, setInn] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    loadExisting();
  }, [userId]);

  const loadExisting = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("partner_applications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setExisting(data);
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      toast.error("Укажите ФИО");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("partner_applications").insert({
        user_id: userId,
        full_name: fullName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        inn: inn.trim() || null,
        comment: comment.trim() || null });
      if (error) throw error;

      await supabase.from("admin_notifications").insert({
        type: "partner",
        title: "Новая заявка на партнёрство",
        message: `${fullName.trim()} (${email || "—"}) подал заявку на партнёрство`,
        is_read: false });

      toast.success("Заявка на партнёрство отправлена!");
      loadExisting();
    } catch (err) {
      console.error(err);
      toast.error("Ошибка при отправке заявки");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <SigmaSpinner />
      </div>
    );
  }

  const benefits = [
    { icon: TrendingUp, title: "10–25%", desc: "комиссии с оплат", color: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/20" },
    { icon: CalendarClock, title: "2 года", desc: "выплат с каждого клиента", color: "from-blue-500/20 to-blue-500/5 border-blue-500/20" },
    { icon: Plug, title: "Просто", desc: "подключиться и начать", color: "from-violet-500/20 to-violet-500/5 border-violet-500/20" },
  ];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-primary/90 via-primary to-accent/80 p-6 sm:p-8 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-6 h-6" />
            <span className="text-sm font-medium uppercase tracking-wider opacity-80">Партнёрская программа</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">Зарабатывайте с нами</h2>
          <p className="text-white/80 max-w-lg">
            Приглашайте организации на платформу и получайте от 10% до 25% комиссии с их оплат подписки в течение 2 лет.
          </p>
        </div>
      </div>

      {/* Benefits */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {benefits.map((b, i) => (
          <div key={i} className={cn("rounded-xl border bg-gradient-to-b p-4 text-center", b.color)}>
            <b.icon className="w-7 h-7 mx-auto mb-2 text-foreground/70" />
            <p className="text-xl font-bold">{b.title}</p>
            <p className="text-xs text-muted-foreground">{b.desc}</p>
          </div>
        ))}
      </div>

      {/* Status or Form */}
      {existing ? (
        <Card className="rounded-2xl border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Ваша заявка</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(() => {
              const statusMap: Record<string, { label: string; icon: any; color: string }> = {
                pending: { label: "На рассмотрении", icon: Clock, color: "text-amber-500" },
                approved: { label: "Одобрена", icon: CheckCircle, color: "text-green-500" },
                rejected: { label: "Отклонена", icon: Clock, color: "text-destructive" } };
              const st = statusMap[existing.status] || statusMap.pending;
              const Icon = st.icon;
              return (
                <div className="p-4 rounded-xl bg-muted/50 border border-border flex items-center gap-3">
                  <Icon className={cn("w-5 h-5", st.color)} />
                  <div>
                    <p className="font-medium">{st.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Отправлена: {new Date(existing.created_at).toLocaleDateString("ru-RU")}
                    </p>
                  </div>
                </div>
              );
            })()}
            <div className="space-y-1 text-sm">
              <p><span className="text-muted-foreground">ФИО:</span> {existing.full_name}</p>
              {existing.email && <p><span className="text-muted-foreground">Email:</span> {existing.email}</p>}
              {existing.phone && <p><span className="text-muted-foreground">Телефон:</span> {existing.phone}</p>}
              {existing.inn && <p><span className="text-muted-foreground">ИНН:</span> {existing.inn}</p>}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="w-4 h-4" />
              Подать заявку
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>ФИО *</Label>
              <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Иванов Иван Иванович" className="rounded-xl" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>Телефон</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 999 123-45-67" className="rounded-xl" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>ИНН (для ИП/юрлица)</Label>
              <Input value={inn} onChange={e => setInn(e.target.value)} placeholder="1234567890" className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label>Комментарий</Label>
              <Textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Расскажите о себе и опыте" rows={3} className="rounded-xl" />
            </div>
            <Button onClick={handleSubmit} disabled={submitting} className="rounded-xl w-full sm:w-auto">
              {submitting ? <SigmaSpinner size="sm" className="mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Отправить заявку
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Оферта */}
      <Collapsible open={offerOpen} onOpenChange={setOfferOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors text-sm font-medium">
            <span>📄 Оферта партнёрской программы</span>
            <ChevronDown className={cn("w-4 h-4 transition-transform", offerOpen && "rotate-180")} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 p-5 rounded-xl border border-border bg-card text-sm text-muted-foreground space-y-3 leading-relaxed">
            <p className="font-semibold text-foreground">Условия партнёрской программы</p>
            <p>1. Партнёр привлекает новые организации на платформу по персональной реферальной ссылке.</p>
            <p>2. За каждую привлечённую организацию, оформившую платную подписку, партнёру начисляется комиссия в размере от 10% до 25% от суммы оплат.</p>
            <p>3. Комиссионные выплаты производятся в течение 2 (двух) лет с момента первой оплаты привлечённой организацией.</p>
            <p>4. Размер комиссии зависит от количества привлечённых организаций: до 5 — 10%, от 5 до 15 — 15%, от 15 до 30 — 20%, более 30 — 25%.</p>
            <p>5. Выплаты производятся ежемесячно на реквизиты, указанные партнёром, при накоплении суммы от 1 000 ₽.</p>
            <p>6. Платформа оставляет за собой право изменять условия программы с уведомлением партнёров за 30 дней.</p>
            <p>7. Подавая заявку, вы соглашаетесь с данными условиями.</p>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
