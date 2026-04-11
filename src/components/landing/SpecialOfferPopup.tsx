import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { X, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

const STORAGE_KEY = "special_offer_dismissed";
const DELAY_MS = 30000;
const PRIVATE_PREFIXES = ["/student", "/organization", "/admin", "/company", "/sales", "/course/", "/partner/dashboard"];

export function SpecialOfferPopup() {
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const { toast } = useToast();
  const location = useLocation();

  const isPrivatePage = PRIVATE_PREFIXES.some(p => location.pathname.startsWith(p));

  useEffect(() => {
    if (isPrivatePage || localStorage.getItem(STORAGE_KEY)) return;
    const timer = setTimeout(() => setShow(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, [isPrivatePage]);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(STORAGE_KEY, "1");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    setSending(true);
    try {
      const { error } = await supabase.from("plan_requests").insert({
        full_name: name.trim(),
        phone: phone.trim(),
        email: `${phone.trim()}@lead.local`,
        plan: "special_offer",
      });
      if (error) throw error;
      toast({ title: "Заявка отправлена!", description: "Мы свяжемся с вами в ближайшее время." });
      dismiss();
    } catch {
      toast({ title: "Ошибка", description: "Попробуйте позже", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.95 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-6 right-6 z-[100] w-[380px] max-w-[calc(100vw-3rem)] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Gradient top bar */}
          <div className="h-1.5 bg-gradient-to-r from-primary via-primary/70 to-accent" />
          
          <div className="p-6">
            <button onClick={dismiss} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Gift className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Специальные условия</h3>
                <p className="text-xs text-muted-foreground">для новых клиентов</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Оставьте заявку и получите персональное предложение с выгодой до 30%.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <Input
                placeholder="Ваше имя"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10"
                required
              />
              <Input
                placeholder="Телефон"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-10"
                type="tel"
                required
              />
              <Button type="submit" className="w-full" disabled={sending}>
                {sending ? "Отправка..." : "Получить предложение"}
              </Button>
            </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
