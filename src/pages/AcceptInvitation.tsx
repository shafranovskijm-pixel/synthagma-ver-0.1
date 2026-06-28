import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { CheckCircle2, AlertCircle, Mail, LogIn, UserPlus } from "lucide-react";
import { toast } from "sonner";

type Stage = "checking" | "needs_login" | "needs_signup" | "ready" | "accepting" | "success" | "error";

export default function AcceptInvitation() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";

  const [stage, setStage] = useState<Stage>("checking");
  const [errorMsg, setErrorMsg] = useState("");
  const [redirectPath, setRedirectPath] = useState("/");
  const [invitationEmail, setInvitationEmail] = useState("");
  const [invitationType, setInvitationType] = useState<string>("");
  const [invitationFullName, setInvitationFullName] = useState<string>("");

  // Signup fields for "sales" invitations
  const [suFullName, setSuFullName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suBusy, setSuBusy] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (!token) {
        setErrorMsg("Не указан токен приглашения");
        setStage("error");
        return;
      }
      const { data, error } = await supabase.rpc("lookup_staff_invitation", { _token: token });
      const inv = Array.isArray(data) ? data[0] : data;
      if (error || !inv) {
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
      setInvitationEmail(inv.email || "");
      setInvitationType(inv.invitation_type || "");
      setInvitationFullName(inv.full_name || "");
      setSuFullName(inv.full_name || "");

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStage(inv.invitation_type === "sales" ? "needs_signup" : "needs_login");
      } else {
        setStage("ready");
      }
    };
    init();
  }, [token]);

  const handleSignUpAndAccept = async () => {
    if (!suEmail.trim() || !suPassword || !suFullName.trim()) {
      toast.error("Заполните все поля");
      return;
    }
    if (suPassword.length < 6) {
      toast.error("Пароль минимум 6 символов");
      return;
    }
    setSuBusy(true);
    try {
      const { data: signUp, error: suErr } = await supabase.auth.signUp({
        email: suEmail.trim().toLowerCase(),
        password: suPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/accept-invitation?token=${token}`,
          data: { full_name: suFullName.trim() },
        },
      });
      if (suErr) {
        toast.error(suErr.message);
        return;
      }
      // If session immediate (auto-confirm), accept right away
      if (signUp.session) {
        setStage("accepting");
        await acceptNow();
      } else {
        // Try sign-in (auto-confirm might still allow this)
        const { data: signIn, error: siErr } = await supabase.auth.signInWithPassword({
          email: suEmail.trim().toLowerCase(),
          password: suPassword,
        });
        if (siErr || !signIn.session) {
          toast.success("Подтвердите email и снова откройте ссылку");
          return;
        }
        setStage("accepting");
        await acceptNow();
      }
    } finally {
      setSuBusy(false);
    }
  };

  const acceptNow = async () => {
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
          <h1 className="text-2xl font-bold">
            {invitationType === "sales" ? "Приглашение в команду продаж" : "Приглашение в команду"}
          </h1>
          {invitationType !== "sales" && invitationEmail && (
            <p className="text-sm text-muted-foreground">Для адреса <strong>{invitationEmail}</strong></p>
          )}
          {invitationType === "sales" && (
            <p className="text-sm text-muted-foreground">Зарегистрируйтесь, чтобы получить доступ к CRM Синтагмы.</p>
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

        {stage === "needs_signup" && (
          <div className="space-y-3">
            <div>
              <Label>ФИО</Label>
              <Input value={suFullName} onChange={e => setSuFullName(e.target.value)} placeholder="Иванов Иван Иванович" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={suEmail} onChange={e => setSuEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div>
              <Label>Пароль</Label>
              <Input type="password" value={suPassword} onChange={e => setSuPassword(e.target.value)} placeholder="Минимум 6 символов" />
            </div>
            <Button onClick={handleSignUpAndAccept} disabled={suBusy} className="w-full gap-2">
              <UserPlus className="w-4 h-4" />
              {suBusy ? "Создаём…" : "Зарегистрироваться и войти"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Уже есть аккаунт?{" "}
              <Link to={`/login?next=${encodeURIComponent(`/accept-invitation?token=${token}`)}`} className="text-primary underline">
                Войти
              </Link>
            </p>
          </div>
        )}

        {stage === "ready" && (
          <div className="space-y-4">
            <p className="text-sm text-center text-muted-foreground">
              Нажмите кнопку, чтобы подтвердить вступление в команду.
            </p>
            <Button onClick={acceptNow} className="w-full">Принять приглашение</Button>
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
            <CheckCircle2 className="w-12 h-12 text-primary" />
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
