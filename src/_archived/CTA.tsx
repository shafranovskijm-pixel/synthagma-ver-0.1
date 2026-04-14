import { useState } from "react";
import { CheckCircle2, Sparkles, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/constants/subscriptionPlans";

const planOptions: { value: SubscriptionPlan; label: string }[] = [
  { value: 'free', label: 'Бесплатный' },
  { value: 'start', label: 'Старт — 3 490 ₽/мес' },
  { value: 'standard', label: 'Стандарт — 6 990 ₽/мес' },
  { value: 'professional', label: 'Профессиональный — 16 990 ₽/мес' },
  { value: 'maximum', label: 'Максимальный — 24 990 ₽/мес' },
];

export function CTA() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [plan, setPlan] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim() || !email.trim() || !phone.trim() || !plan) {
      toast.error("Пожалуйста, заполните все поля");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      toast.error("Введите корректный email");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from("plan_requests" as any).insert({
        full_name: fullName.trim().slice(0, 200),
        email: email.trim().slice(0, 255),
        phone: phone.trim().slice(0, 30),
        plan,
      } as any);

      if (error) throw error;
      setSubmitted(true);
      toast.success("Заявка отправлена!");
    } catch {
      toast.error("Ошибка отправки. Попробуйте позже.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="section-padding relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-foreground" />
      <div className="absolute inset-0 bg-gradient-to-br from-accent/15 via-transparent to-accent/10" />
      <div className="absolute inset-0 bg-gradient-to-tl from-primary/20 via-transparent to-transparent" />

      {/* Radial glow effects */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-accent/10 rounded-full blur-[150px]" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-accent/8 rounded-full blur-[120px]" />

      {/* Decorative pattern */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
        backgroundSize: '32px 32px'
      }} />

      {/* Decorative elements */}
      <motion.div
        className="absolute top-1/4 right-[15%] w-px h-40 bg-gradient-to-b from-transparent via-accent/40 to-transparent"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5 }}
      />
      <motion.div
        className="absolute top-16 left-16 w-20 h-20 border-l border-t border-accent/20 rounded-tl-3xl"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1 }}
      />
      <motion.div
        className="absolute bottom-16 right-16 w-20 h-20 border-r border-b border-accent/20 rounded-br-3xl"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.2 }}
      />

      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-3xl mx-auto text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-accent/30 bg-accent/10 backdrop-blur-sm mb-10"
          >
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="text-sm text-background/90 font-medium">Оставьте заявку</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.1 }}
          >
            <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-medium text-background mb-4 leading-tight tracking-tight">
              Готовы автоматизировать обучение?
            </h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="mb-10"
          >
            <p className="text-lg text-background/60 max-w-xl mx-auto">
              Заполните форму — мы свяжемся с вами и поможем подключиться
            </p>
          </motion.div>

          {/* Form or success */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            {submitted ? (
              <div className="bg-background/10 backdrop-blur-md border border-background/20 rounded-2xl p-10 max-w-md mx-auto">
                <CheckCircle2 className="w-12 h-12 text-accent mx-auto mb-4" />
                <h3 className="font-display text-2xl text-background font-medium mb-2">Заявка отправлена!</h3>
                <p className="text-background/60">Мы свяжемся с вами в ближайшее время</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-background/10 backdrop-blur-md border border-background/20 rounded-2xl p-8 max-w-lg mx-auto space-y-4">
                <Input
                  placeholder="ФИО"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  maxLength={200}
                  className="bg-background/10 border-background/20 text-background placeholder:text-background/40 h-12 rounded-xl focus:border-accent/50"
                />
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={255}
                  className="bg-background/10 border-background/20 text-background placeholder:text-background/40 h-12 rounded-xl focus:border-accent/50"
                />
                <Input
                  type="tel"
                  placeholder="Телефон"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={30}
                  className="bg-background/10 border-background/20 text-background placeholder:text-background/40 h-12 rounded-xl focus:border-accent/50"
                />
                <Select value={plan} onValueChange={setPlan}>
                  <SelectTrigger className="bg-background/10 border-background/20 text-background h-12 rounded-xl focus:border-accent/50 [&>span]:text-background/40 data-[state=open]:border-accent/50">
                    <SelectValue placeholder="Выберите тариф" />
                  </SelectTrigger>
                  <SelectContent>
                    {planOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="submit"
                  disabled={loading}
                  size="lg"
                  className="w-full bg-background text-foreground hover:bg-background/90 rounded-xl h-14 text-base font-medium gap-2 shadow-lg"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Отправить заявку
                      <Send className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </form>
            )}
          </motion.div>

          {/* Trust badges */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="mt-10 flex flex-wrap justify-center gap-6 text-background/60 text-sm"
          >
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-background/5 border border-background/10">
              <CheckCircle2 className="w-4 h-4 text-accent" />
              <span>14 дней бесплатно</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-background/5 border border-background/10">
              <CheckCircle2 className="w-4 h-4 text-accent" />
              <span>Не требуется карта</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-background/5 border border-background/10">
              <CheckCircle2 className="w-4 h-4 text-accent" />
              <span>Настройка за 5 минут</span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
