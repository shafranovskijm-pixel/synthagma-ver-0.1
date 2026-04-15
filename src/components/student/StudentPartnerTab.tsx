import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Send, CheckCircle, Clock, Users } from "lucide-react";
import { toast } from "sonner";

interface Props {
  userId: string;
  userEmail?: string;
  userName?: string;
}

export function StudentPartnerTab({ userId, userEmail, userName }: Props) {
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

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
        comment: comment.trim() || null,
      });
      if (error) throw error;

      // Notify admin
      await supabase.from("admin_notifications").insert({
        type: "partner",
        title: "Новая заявка на партнёрство",
        message: `${fullName.trim()} (${email || "—"}) подал заявку на партнёрство`,
        is_read: false,
      });

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
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (existing) {
    const statusMap: Record<string, { label: string; icon: any; color: string }> = {
      pending: { label: "На рассмотрении", icon: Clock, color: "text-amber-500" },
      approved: { label: "Одобрена", icon: CheckCircle, color: "text-green-500" },
      rejected: { label: "Отклонена", icon: Clock, color: "text-destructive" },
    };
    const st = statusMap[existing.status] || statusMap.pending;
    const Icon = st.icon;

    return (
      <Card className="rounded-2xl border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Партнёрская программа
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-4 rounded-xl bg-muted/50 border border-border">
            <p className="text-sm text-muted-foreground mb-2">Статус заявки</p>
            <div className="flex items-center gap-2">
              <Icon className={`w-5 h-5 ${st.color}`} />
              <span className="font-medium">{st.label}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Отправлена: {new Date(existing.created_at).toLocaleDateString("ru-RU")}
            </p>
          </div>

          <div className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">ФИО:</span> {existing.full_name}</p>
            {existing.email && <p><span className="text-muted-foreground">Email:</span> {existing.email}</p>}
            {existing.phone && <p><span className="text-muted-foreground">Телефон:</span> {existing.phone}</p>}
            {existing.inn && <p><span className="text-muted-foreground">ИНН:</span> {existing.inn}</p>}
            {existing.comment && <p><span className="text-muted-foreground">Комментарий:</span> {existing.comment}</p>}
          </div>

          <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
            <p className="text-sm">
              Приглашайте организации на платформу и получайте от 10% до 25% комиссии с их оплат подписки в течение 2 лет.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Партнёрская программа
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
          <p className="text-sm">
            Приглашайте организации на платформу и получайте от 10% до 25% комиссии с их оплат подписки в течение 2 лет.
            Заполните форму ниже для подачи заявки на партнёрство.
          </p>
        </div>

        <div className="space-y-4">
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
          <Button onClick={handleSubmit} disabled={submitting} className="rounded-xl">
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Отправить заявку на партнёрство
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
