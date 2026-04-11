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
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99] bg-black/30 backdrop-blur-sm"
            onClick={dismiss}
          />

          {/* Centered popup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          >
            <div className="w-[400px] max-w-full bg-card rounded-2xl shadow-2xl overflow-hidden">
              {/* Gradient top accent */}
              <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-accent" />

              <div className="p-6 relative">
                <button
                  onClick={dismiss}
                  className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Gift className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-base">Специальные условия</h3>
                    <p className="text-xs text-muted-foreground">для новых клиентов</p>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground mb-5">
                  Оставьте заявку и получите персональное предложение с выгодой до 30%.
                </p>

                <form onSubmit={handleSubmit} className="space-y-3">
                  <Input
                    placeholder="Ваше имя"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-11 rounded-xl"
                    required
                  />
                  <Input
                    placeholder="Телефон"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-11 rounded-xl"
                    type="tel"
                    required
                  />
                  <Button type="submit" className="w-full h-11 rounded-xl font-medium" disabled={sending}>
                    {sending ? "Отправка..." : "Получить предложение"}
                  </Button>
                </form>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
