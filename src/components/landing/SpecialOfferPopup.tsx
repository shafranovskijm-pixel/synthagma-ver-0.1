import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import specialOfferBg from "@/assets/special-offer-bg.jpg";
import { toast } from "sonner";

const PRIVATE_PREFIXES = ["/student", "/organization", "/admin", "/company", "/sales", "/course/", "/partner/dashboard"];

interface PopupConfig {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  badge_text: string;
  cta_text: string;
  image_url: string | null;
  delay_seconds: number;
  storage_key: string;
  show_for_authenticated: boolean;
  source_tag: string;
}

export function SpecialOfferPopup() {
  const [popup, setPopup] = useState<PopupConfig | null>(null);
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const location = useLocation();

  const isPrivatePage = PRIVATE_PREFIXES.some(p => location.pathname.startsWith(p));

  useEffect(() => {
    if (isPrivatePage) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      const { data } = await supabase
        .from("landing_popups")
        .select("id, title, subtitle, description, badge_text, cta_text, image_url, delay_seconds, storage_key, show_for_authenticated, source_tag")
        .eq("enabled", true)
        .order("sort_order", { ascending: true })
        .limit(1);

      const cfg = data?.[0] as PopupConfig | undefined;
      if (!cfg || cancelled) return;
      if (localStorage.getItem(cfg.storage_key)) return;

      const { data: sess } = await supabase.auth.getSession();
      if (sess?.session?.user && !cfg.show_for_authenticated) return;
      if (cancelled) return;

      setPopup(cfg);
      timer = setTimeout(() => setShow(true), Math.max(0, cfg.delay_seconds) * 1000);
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isPrivatePage]);

  const dismiss = () => {
    setShow(false);
    if (popup) localStorage.setItem(popup.storage_key, "1");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !popup) return;
    setSending(true);
    try {
      const { error } = await supabase.from("plan_requests").insert({
        full_name: name.trim(),
        phone: phone.trim(),
        email: `${phone.trim()}@lead.local`,
        plan: popup.source_tag || "special_offer",
      });
      if (error) throw error;

      try {
        await supabase.functions.invoke("send-telegram-notification", {
          body: {
            message: `🎁 <b>Заявка со спецпредложения</b>\n\n<b>Имя:</b> ${name.trim()}\n<b>Телефон:</b> ${phone.trim()}\n<b>Источник:</b> Попап «${popup.title}»`,
          },
        });
      } catch {
        // best-effort
      }

      toast.success("Заявка отправлена!", { description: "Мы свяжемся с вами в ближайшее время." });
      dismiss();
    } catch {
      toast.error("Ошибка", { description: "Попробуйте позже" });
    } finally {
      setSending(false);
    }
  };

  if (!popup) return null;
  const imageSrc = popup.image_url || specialOfferBg;

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99] bg-black/40 backdrop-blur-sm"
            onClick={dismiss}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          >
            <div className="relative w-[560px] max-w-full bg-card rounded-3xl shadow-2xl overflow-hidden border border-primary/10">
              <button
                onClick={dismiss}
                aria-label="Закрыть"
                className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-background/95 shadow-md ring-1 ring-border flex items-center justify-center text-foreground/80 hover:text-foreground hover:bg-background transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex flex-col sm:flex-row">
                <div className="relative sm:w-[220px] h-[160px] sm:h-auto flex-shrink-0 overflow-hidden">
                  <img src={imageSrc} alt={popup.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-card/80 via-transparent to-transparent" />
                  {popup.badge_text && (
                    <div className="absolute bottom-3 left-3 sm:bottom-auto sm:top-6 sm:left-4">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/90 text-primary-foreground text-xs font-bold shadow-lg">
                        <Sparkles className="w-3.5 h-3.5" />
                        {popup.badge_text}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex-1 p-5 sm:p-6 relative">
                  <h3 className="text-lg font-bold mb-1">{popup.title}</h3>
                  {popup.subtitle && (
                    <p className="text-[11px] font-medium text-primary/80 mb-1">{popup.subtitle}</p>
                  )}
                  {popup.description && (
                    <p className="text-xs text-muted-foreground mb-4">{popup.description}</p>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-3">
                    <Input placeholder="Ваше имя" value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl" required />
                    <Input placeholder="Телефон" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 rounded-xl" type="tel" required />
                    <Button
                      type="submit"
                      className="w-full h-11 rounded-xl font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/20"
                      disabled={sending}
                    >
                      {sending ? "Отправка..." : popup.cta_text}
                    </Button>
                  </form>

                  <p className="text-[10px] text-muted-foreground/60 mt-3 text-center">
                    Нажимая кнопку, вы соглашаетесь на{" "}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground/70 transition-colors">
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
