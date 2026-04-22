import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { CheckCircle2, AlertCircle, Mail, LogIn } from "lucide-react";
import { toast } from "sonner";

type Stage = "checking" | "needs_login" | "ready" | "accepting" | "success" | "error";

export default function AcceptInvitation() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";

  const [stage, setStage] = useState<Stage>("checking");
  const [errorMsg, setErrorMsg] = useState("");
  const [redirectPath, setRedirectPath] = useState("/");
  const [invitationEmail, setInvitationEmail] = useState("");

  useEffect(() => {
    const init = async () => {
      if (!token) {
        setErrorMsg("Не указан токен приглашения");
        setStage("error");
        return;
      }
      // Look up invitation in public read (we expose only minimal data via RLS, fallback по edge?)
      const { data: inv } = await supabase
        .from("staff_invitations")
        .select("email, expires_at, accepted_at")
        .eq("token", token)
        .maybeSingle();

      if (!inv) {
        setErrorMsg("Приглашение не найдено или ссылка неверна");
        setStage("error");
        return;
      }
      if (inv.accepted_at) {
        setErrorMsg("Это приглашение уже было принято");
        setStage("error");
        return;
      }
      if (new Date(inv.expires_at).getTime() < Date.now()) {
        setErrorMsg("Срок действия приглашения истёк");
        setStage("error");
        return;
      }
      setInvitationEmail(inv.email);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStage("needs_login");
      } else {
        setStage("ready");
      }
    };
    init();
  }, [token]);

  const handleAccept = async () => {
    setStage("accepting");
    try {
      const { data, error } = await supabase.functions.invoke("accept-staff-invitation", {
        body: { token },
      });
      if (error || data?.error) {
        const msg = data?.error || error?.message || "Не удалось принять приглашение";
        setErrorMsg(msg);
        setStage("error");
        return;
      }
      setRedirectPath(data?.redirect || "/");
      setStage("success");
      toast.success("Приглашение принято");
      setTimeout(() => navigate(data?.redirect || "/"), 2000);
    } catch (e: any) {
      setErrorMsg(e?.message || "Ошибка");
      setStage("error");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/40 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-lg p-8 space-y-6">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary mx-auto">
          <Mail className="w-7 h-7" />
        </div>
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Приглашение в команду</h1>
          {invitationEmail && (
            <p className="text-sm text-muted-foreground">Для адреса <strong>{invitationEmail}</strong></p>
          )}
        </div>

        {stage === "checking" && (
          <div className="flex justify-center py-8"><SigmaSpinner /></div>
        )}

        {stage === "needs_login" && (
          <div className="space-y-4">
            <p className="text-sm text-center text-muted-foreground">
              Чтобы принять приглашение, войдите в аккаунт под этим email.
            </p>
            <Button asChild className="w-full gap-2">
              <Link to={`/login?next=${encodeURIComponent(`/accept-invitation?token=${token}`)}`}>
                <LogIn className="w-4 h-4" />
                Войти и принять
              </Link>
            </Button>
          </div>
        )}

        {stage === "ready" && (
          <div className="space-y-4">
            <p className="text-sm text-center text-muted-foreground">
              Нажмите кнопку, чтобы подтвердить вступление в команду.
            </p>
            <Button onClick={handleAccept} className="w-full">Принять приглашение</Button>
          </div>
        )}

        {stage === "accepting" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <SigmaSpinner />
            <p className="text-sm text-muted-foreground">Принимаем приглашение…</p>
          </div>
        )}

        {stage === "success" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            <p className="font-medium">Готово! Перенаправляем…</p>
            <Button asChild variant="outline" size="sm">
              <Link to={redirectPath}>Перейти сейчас</Link>
            </Button>
          </div>
        )}

        {stage === "error" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <AlertCircle className="w-12 h-12 text-destructive" />
            <p className="font-medium text-destructive">{errorMsg}</p>
            <Button asChild variant="outline" size="sm">
              <Link to="/">На главную</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
