import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";
import { Shield, Loader2 } from "lucide-react";

/**
 * Диалог проверки 2FA. Открывается, если у пользователя есть TOTP-фактор,
 * но текущий уровень AAL = aal1. Блокирует UI до прохождения.
 */
export function TwoFactorChallenge() {
  const [open, setOpen] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const checkAAL = async () => {
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!aalData) return;
    const { currentLevel, nextLevel } = aalData;
    // Если nextLevel = aal2 (есть TOTP-фактор), но currentLevel = aal1 — нужна проверка
    if (currentLevel === "aal1" && nextLevel === "aal2") {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.find((f: any) => f.status === "verified");
      if (totp) {
        setFactorId(totp.id);
        setOpen(true);
      }
    } else {
      setOpen(false);
    }
  };

  useEffect(() => {
    checkAAL();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "MFA_CHALLENGE_VERIFIED") {
        setTimeout(checkAAL, 0);
      }
      if (event === "SIGNED_OUT") {
        setOpen(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const verify = async () => {
    if (!factorId || code.length !== 6) return;
    setVerifying(true);
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
    if (chErr) {
      toast.error("Ошибка проверки", { description: getErrorMessage(chErr) });
      setVerifying(false);
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: ch.id,
      code,
    });
    setVerifying(false);
    if (vErr) {
      toast.error("Неверный код");
      setCode("");
      return;
    }
    toast.success("Проверка пройдена");
    setOpen(false);
    setCode("");
  };

  const cancel = async () => {
    await supabase.auth.signOut();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={() => { /* блокируем закрытие */ }}>
      <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Двухфакторная аутентификация</DialogTitle>
          <DialogDescription className="text-center">
            Введите 6-значный код из приложения-аутентификатора
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="sr-only">Код 2FA</Label>
            <Input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              className="text-center text-2xl tracking-widest font-mono"
              maxLength={6}
              onKeyDown={(e) => { if (e.key === "Enter" && code.length === 6) verify(); }}
            />
          </div>
          <Button className="w-full" disabled={verifying || code.length !== 6} onClick={verify}>
            {verifying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Подтвердить
          </Button>
          <Button variant="ghost" className="w-full" onClick={cancel}>
            Выйти
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
