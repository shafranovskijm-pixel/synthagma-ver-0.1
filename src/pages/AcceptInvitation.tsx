import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { CheckCircle2, AlertCircle, Mail, LogIn, UserPlus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Stage =
  | "checking"
  | "needs_login"
  | "needs_signup"
  | "email_mismatch"
  | "ready"
  | "accepting"
  | "success"
  | "error";

interface AcceptError {
  message: string;
  code?: string;
  requestId?: string;
  retryable?: boolean;
}

/** Достаёт JSON-тело из FunctionsHttpError, чтобы не показывать "non-2xx status code". */
export async function extractFunctionError(error: unknown, data?: any): Promise<AcceptError> {
  if (data && typeof data === "object" && (data as any).error) {
    return {
      message: String((data as any).error),
      code: (data as any).code,
      requestId: (data as any).request_id,
    };
  }
  const anyErr = error as any;
  const ctx = anyErr?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await ctx.json();
      if (body?.error) {
        return { message: String(body.error), code: body.code, requestId: body.request_id };
      }
    } catch {
      /* ignore */
    }
  }
  const status: number | undefined = ctx?.status;
  if (status === 401) return { message: "Сессия истекла — войдите повторно", code: "SESSION_EXPIRED" };
  if (status === 404) return { message: "Приглашение не найдено", code: "NOT_FOUND" };
  if (status === 409) return { message: "Приглашение уже принято", code: "ALREADY_ACCEPTED" };
  if (status === 410) return { message: "Срок действия приглашения истёк", code: "EXPIRED" };
  if (status && status >= 500) return { message: "Внутренняя ошибка сервера. Попробуйте позже.", code: "INTERNAL" };

  const raw = String(anyErr?.message || "");
  if (/failed to fetch|network/i.test(raw)) {
    return { message: "Нет соединения с сервером. Проверьте интернет и повторите.", code: "NETWORK", retryable: true };
  }
  if (!raw || /non-2xx status code/i.test(raw)) {
    return { message: "Не удалось принять приглашение. Попробуйте ещё раз.", code: "UNKNOWN", retryable: true };
  }
  return { message: raw };
}

export default function AcceptInvitation() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const nextPath = `/accept-invitation?token=${token}`;

  const [stage, setStage] = useState<Stage>("checking");
  const [errorMsg, setErrorMsg] = useState("");
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const [requestId, setRequestId] = useState<string | undefined>();
  const [canRetry, setCanRetry] = useState(false);
  const [redirectPath, setRedirectPath] = useState("/");
  const [invitationEmail, setInvitationEmail] = useState("");
  const [currentEmail, setCurrentEmail] = useState("");
  const [invitationType, setInvitationType] = useState<string>("");

  // Signup fields
  const [suFullName, setSuFullName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suBusy, setSuBusy] = useState(false);

  const failWith = (e: AcceptError) => {
    setErrorMsg(e.message);
    setErrorCode(e.code);
    setRequestId(e.requestId);
    setCanRetry(!!e.retryable);
    setStage("error");
  };

  useEffect(() => {
    const init = async () => {
      if (!token) {
        failWith({ message: "Не указан токен приглашения", code: "BAD_REQUEST" });
        return;
      }
      const { data, error } = await supabase.rpc("lookup_staff_invitation", { _token: token });
      const inv = Array.isArray(data) ? data[0] : data;
      if (error || !inv) {
        failWith({ message: "Приглашение не найдено или ссылка неверна", code: "NOT_FOUND" });
        return;
      }
      if (inv.accepted_at) {
        failWith({ message: "Это приглашение уже было принято", code: "ALREADY_ACCEPTED" });
        return;
      }
      if (new Date(inv.expires_at).getTime() < Date.now()) {
        failWith({ message: "Срок действия приглашения истёк", code: "EXPIRED" });
        return;
      }
      const invEmail = (inv.email || "").toLowerCase();
      setInvitationEmail(invEmail);
      setInvitationType(inv.invitation_type || "");
      setSuFullName(inv.full_name || "");
      setSuEmail(inv.invitation_type === "sales" ? "" : invEmail);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStage(inv.invitation_type === "sales" || inv.invitation_type === "organization" ? "needs_signup" : "needs_login");
        return;
      }
      const sessionEmail = (session.user.email || "").toLowerCase();
      setCurrentEmail(sessionEmail);
      if (inv.invitation_type !== "sales" && sessionEmail !== invEmail) {
        setStage("email_mismatch");
        return;
      }
      setStage("ready");
    };
    init();
  }, [token]);

  const switchAccount = async () => {
    await supabase.auth.signOut();
    navigate(`/login?next=${encodeURIComponent(nextPath)}`);
  };

  const acceptNow = useCallback(async () => {
    setStage("accepting");
    try {
      const { data, error } = await supabase.functions.invoke("accept-staff-invitation", {
        body: { token },
      });
      if (error || (data as any)?.error) {
        failWith(await extractFunctionError(error, data));
        return;
      }
      const redirect = (data as any)?.redirect || "/";
      setRedirectPath(redirect);
      setStage("success");
      toast.success("Приглашение принято");
      setTimeout(() => navigate(redirect), 1500);
    } catch (e) {
      failWith(await extractFunctionError(e));
    }
  }, [token, navigate]);

  const handleSignUpAndAccept = async () => {
    const targetEmail = invitationType === "sales" ? suEmail.trim().toLowerCase() : invitationEmail;
    if (!targetEmail || !suPassword || !suFullName.trim()) {
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
        email: targetEmail,
        password: suPassword,
        options: {
          emailRedirectTo: `${window.location.origin}${nextPath}`,
          data: { full_name: suFullName.trim() },
        },
      });
      if (suErr) {
        toast.error(suErr.message);
        return;
      }
      if (!signUp.session) {
        const { data: signIn, error: siErr } = await supabase.auth.signInWithPassword({
          email: targetEmail,
          password: suPassword,
        });
        if (siErr || !signIn.session) {
          toast.success("Подтвердите email и снова откройте ссылку из письма");
          return;
        }
      }
      setCurrentEmail(targetEmail);
      await acceptNow();
    } finally {
      setSuBusy(false);
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
              <Link to={`/login?next=${encodeURIComponent(nextPath)}`}>
                <LogIn className="w-4 h-4" />
                Войти и принять
              </Link>
            </Button>
          </div>
        )}

        {stage === "email_mismatch" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 space-y-2 text-sm">
              <p className="font-medium text-destructive">Вы вошли под другим адресом</p>
              <p className="text-muted-foreground">Приглашение: <strong>{invitationEmail}</strong></p>
              <p className="text-muted-foreground">Текущий аккаунт: <strong>{currentEmail}</strong></p>
            </div>
            <Button onClick={switchAccount} className="w-full gap-2">
              <LogIn className="w-4 h-4" />
              Войти другим аккаунтом
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
              <Input
                type="email"
                value={invitationType === "sales" ? suEmail : invitationEmail}
                onChange={e => setSuEmail(e.target.value)}
                disabled={invitationType !== "sales"}
                placeholder="you@example.com"
              />
              {invitationType !== "sales" && (
                <p className="text-xs text-muted-foreground mt-1">
                  Регистрация возможна только на адрес приглашения.
                </p>
              )}
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
              <Link to={`/login?next=${encodeURIComponent(nextPath)}`} className="text-primary underline">
                Войти
              </Link>
            </p>
          </div>
        )}

        {stage === "ready" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm space-y-1">
              <p className="text-muted-foreground">Приглашение: <strong>{invitationEmail || "—"}</strong></p>
              <p className="text-muted-foreground">Текущий аккаунт: <strong>{currentEmail || "—"}</strong></p>
            </div>
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
            {requestId && (
              <p className="text-xs text-muted-foreground">Код обращения: {requestId}</p>
            )}
            <div className="flex flex-wrap gap-2 justify-center">
              {canRetry && (
                <Button size="sm" onClick={acceptNow} className="gap-2">
                  <RefreshCw className="w-4 h-4" /> Повторить
                </Button>
              )}
              {(errorCode === "SESSION_EXPIRED" || errorCode === "NO_SESSION" || errorCode === "EMAIL_MISMATCH") && (
                <Button size="sm" variant="outline" onClick={switchAccount} className="gap-2">
                  <LogIn className="w-4 h-4" /> Войти другим аккаунтом
                </Button>
              )}
              <Button asChild variant="outline" size="sm">
                <Link to="/">На главную</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
