import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import specialOfferBg from "@/assets/special-offer-bg.jpg";
import { toast } from "sonner";

const STORAGE_KEY = "special_offer_dismissed";
const DELAY_MS = 300000;
const PRIVATE_PREFIXES = ["/student", "/organization", "/admin", "/company", "/sales", "/course/", "/partner/dashboard"];

export function SpecialOfferPopup() {
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const location = useLocation();

  const isPrivatePage = PRIVATE_PREFIXES.some(p => location.pathname.startsWith(p));

  useEffect(() => {
    if (isPrivatePage || localStorage.getItem(STORAGE_KEY)) return;

    let timer: ReturnType<typeof setTimeout>;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) return; // Don't show for authenticated users
      timer = setTimeout(() => setShow(true), DELAY_MS);
    });

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

      // Send Telegram notification (non-blocking)
      try {
        await supabase.functions.invoke("send-telegram-notification", {
          body: {
            message: `🎁 <b>Заявка со спецпредложения</b>\n\n<b>Имя:</b> ${name.trim()}\n<b>Телефон:</b> ${phone.trim()}\n<b>Источник:</b> Попап "Специальные условия"`,
          },
        });
      } catch {
        // Telegram notification is best-effort
      }

      toast.success("Заявка отправлена!", { description: Мы свяжемся с вами в ближайшее время. });
      dismiss();
    } catch {
      toast.error("Ошибка", { description: Попробуйте позже });
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
            className="fixed inset-0 z-[99] bg-black/40 backdrop-blur-sm"
            onClick={dismiss}
          />

          {/* Centered popup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          >
            <div className="w-[560px] max-w-full bg-card rounded-3xl shadow-2xl overflow-hidden border border-primary/10">
              {/* Close button */}
              <button
                onClick={dismiss}
                className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white hover:bg-black/50 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex flex-col sm:flex-row">
                {/* Left: Image panel */}
                <div className="relative sm:w-[220px] h-[160px] sm:h-auto flex-shrink-0 overflow-hidden">
                  <img
                    src={specialOfferBg}
                    alt="Специальное предложение"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-card/80 via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-3 sm:bottom-auto sm:top-6 sm:left-4">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/90 text-primary-foreground text-xs font-bold shadow-lg">
                      <Sparkles className="w-3.5 h-3.5" />
                      до 30% выгода
                    </div>
                  </div>
                </div>

                {/* Right: Form panel */}
                <div className="flex-1 p-5 sm:p-6 relative">
                  <button
                    onClick={dismiss}
                    className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors sm:hidden"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  <h3 className="text-lg font-bold mb-1">Специальные условия</h3>
                  <p className="text-[11px] font-medium text-primary/80 mb-1">Только для новых клиентов</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Оставьте заявку и получите персональное предложение для вашей организации
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
                    <Button
                      type="submit"
                      className="w-full h-11 rounded-xl font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/20"
                      disabled={sending}
                    >
                      {sending ? "Отправка..." : "Получить предложение"}
                    </Button>
                  </form>

                  <p className="text-[10px] text-muted-foreground/60 mt-3 text-center">
                    Нажимая кнопку, вы соглашаетесь на{" "}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-foreground/70 transition-colors"
                    >
                      обработку персональных данных
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
