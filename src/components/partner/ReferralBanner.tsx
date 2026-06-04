import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, AlertTriangle, Gift } from "lucide-react";

type Props = {
  code: string | null;
  context?: "register" | "partner";
};

/**
 * Shows the user that they arrived via a referral link and validates the code.
 * - Green banner when the code is valid (partner is active).
 * - Amber banner when the code does not exist or partner inactive.
 * Hidden entirely when no code is present.
 */
export function ReferralBanner({ code, context = "register" }: Props) {
  const [status, setStatus] = useState<"loading" | "valid" | "invalid">("loading");
  const [partnerLabel, setPartnerLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!code) return;
    setStatus("loading");
    (async () => {
      try {
        const { data } = await supabase
          .from("referral_partners")
          .select("code, status")
          .eq("code", code.trim())
          .maybeSingle();
        if (cancelled) return;
        if (data && data.status === "active") {
          setStatus("valid");
          setPartnerLabel(data.code);
        } else {
          setStatus("invalid");
        }
      } catch {
        if (!cancelled) setStatus("invalid");
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  if (!code) return null;

  if (status === "loading") {
    return (
      <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
        <Gift className="h-4 w-4" />
        Проверяем партнёрский код «{code}»…
      </div>
    );
  }

  if (status === "valid") {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <div className="font-medium">Вы пришли по приглашению партнёра {partnerLabel}</div>
          <div className="text-xs opacity-90 mt-0.5">
            {context === "partner"
              ? "После регистрации в качестве партнёра вы попадёте во второй уровень его сети."
              : "Регистрация будет автоматически засчитана партнёру — никаких лишних действий не нужно."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <div>
        <div className="font-medium">Партнёрский код «{code}» не найден или неактивен</div>
        <div className="text-xs opacity-90 mt-0.5">
          Регистрация продолжится, но не будет привязана к партнёру. Проверьте правильность ссылки у того, кто её отправил.
        </div>
      </div>
    </div>
  );
}
