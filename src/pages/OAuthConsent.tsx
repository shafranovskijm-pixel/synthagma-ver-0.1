import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck } from "lucide-react";

type ConsentState =
  | { kind: "loading" }
  | { kind: "login" }
  | { kind: "mfa" }
  | { kind: "error"; message: string }
  | { kind: "blocked" }
  | { kind: "ready"; userId: string; email: string; details: OAuthAuthorizationDetails };

const scopeLabels: Record<string, string> = {
  openid: "Идентификатор учётной записи",
  email: "Адрес электронной почты",
  profile: "Данные профиля",
  phone: "Номер телефона",
  offline_access: "Сохранение подключения между сеансами",
};

// Accept only the server-returned callback, never a callback from query parameters.
function oauthRedirectUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

async function currentAdmin() {
  // Do not use the platform's cached admin flag to authorize an OAuth grant.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("session");
  // Both historical has_role overloads share parameter names, so PostgREST
  // cannot disambiguate that RPC. Read only this verified caller's role via RLS.
  const role = await supabase.from("user_roles").select("role")
    .eq("user_id", data.user.id).eq("role", "admin").limit(1);
  if (role.error) throw new Error("role");
  if (!Array.isArray(role.data)) throw new Error("role");
  if (!role.data.some((entry) => entry.role === "admin")) return { user: data.user, allowed: false };
  const blocked = await supabase.rpc("is_user_blocked", { _user_id: data.user.id });
  if (blocked.error || typeof blocked.data !== "boolean") throw new Error("role");
  if (blocked.data) return { user: data.user, allowed: false };
  // Keep the platform's existing global TOTP challenge in force for this route.
  const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error || !assurance.data) throw new Error("session");
  if (assurance.data.nextLevel === "aal2" && assurance.data.currentLevel !== "aal2") throw new Error("mfa");
  return { user: data.user, allowed: true };
}

const navigateToClient = (url: string) => window.location.assign(url);

export default function OAuthConsent({ redirect = navigateToClient }: { redirect?: (url: string) => void }) {
  const [params] = useSearchParams();
  const ids = params.getAll("authorization_id");
  const authorizationId = ids.length === 1 && /^[a-zA-Z0-9_-]{1,256}$/.test(ids[0]) ? ids[0] : null;
  const [state, setState] = useState<ConsentState>({ kind: "loading" });
  const [refresh, setRefresh] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const actionRunning = useRef(false);
  const accountId = useRef<string | null>(null);

  useEffect(() => {
    // Keep callbacks synchronous: Supabase auth callbacks share the auth lock.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const nextAccountId = session?.user.id ?? null;
      // SIGNED_IN can repeat on tab focus. Re-reading an auto-approved request
      // would fail because Auth has already consumed it and issued its callback.
      if (event === "SIGNED_OUT" || event === "MFA_CHALLENGE_VERIFIED" || ((event === "SIGNED_IN" || event === "USER_UPDATED") && nextAccountId !== accountId.current)) {
        accountId.current = nextAccountId;
        setState({ kind: "loading" });
        setRefresh((value) => value + 1);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;
    setMessage("");
    if (!authorizationId) {
      setState({ kind: "error", message: "В ссылке нет корректного запроса подключения. Вернитесь в ChatGPT и начните подключение заново." });
      return;
    }
    setState({ kind: "loading" });
    void (async () => {
      try {
        const session = await supabase.auth.getSession();
        if (!active) return;
        if (session.error) throw new Error("session");
        if (!session.data.session) {
          accountId.current = null;
          setState({ kind: "login" });
          return;
        }
        accountId.current = session.data.session.user.id;
        const admin = await currentAdmin();
        if (!active) return;
        if (!admin.allowed) {
          setState({ kind: "blocked" });
          return;
        }
        const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
        if (!active) return;
        if (error || !data) throw new Error("authorization");
        // Already-approved requests may contain only a redirect_url.
        if (data.redirect_url) {
          if (!oauthRedirectUrl(data.redirect_url)) throw new Error("redirect");
        } else if (data.authorization_id !== authorizationId || data.user?.id !== admin.user.id || !data.client?.id) {
          throw new Error("authorization");
        }
        setState({ kind: "ready", userId: admin.user.id, email: admin.user.email ?? "", details: data });
      } catch (error) {
        if (!active) return;
        if (error instanceof Error && error.message === "mfa") {
          setState({ kind: "mfa" });
        } else if (error instanceof Error && error.message === "session") {
          accountId.current = null;
          setState({ kind: "login" });
          setMessage("Сеанс входа не подтверждён. Войдите в СИНТАГМУ заново.");
        } else {
          setState({ kind: "error", message: "Не удалось проверить запрос подключения или права доступа. Попробуйте снова. Если ссылка устарела, начните подключение из ChatGPT заново." });
        }
      }
    })();
    return () => { active = false; };
  }, [authorizationId, refresh]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (actionRunning.current) return;
    actionRunning.current = true;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) {
        setMessage(error.code === "invalid_credentials" ? "Email или пароль не подошли." : "Не удалось войти. Проверьте соединение и повторите попытку.");
      } else {
        setPassword("");
        setRefresh((value) => value + 1);
      }
    } catch {
      setMessage("Не удалось войти. Проверьте соединение и повторите попытку.");
    } finally {
      actionRunning.current = false;
      setBusy(false);
    }
  }

  async function decide(approve: boolean) {
    if (state.kind !== "ready" || !authorizationId || actionRunning.current) return;
    actionRunning.current = true;
    setBusy(true);
    setMessage("");
    try {
      const admin = await currentAdmin();
      if (!admin.allowed || admin.user.id !== state.userId) {
        setState({ kind: "blocked" });
        return;
      }
      let callback: unknown;
      if (approve && state.details.redirect_url) {
        callback = state.details.redirect_url;
      } else {
        const result = await (approve
          ? supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
          : supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true }));
        if (result.error) throw new Error("consent");
        callback = result.data?.redirect_url;
      }
      const url = oauthRedirectUrl(callback);
      if (!url) throw new Error("redirect");
      redirect(url);
    } catch {
      setMessage("Подключение не завершено. Не удалось подтвердить решение или вернуться в приложение. Попробуйте снова либо начните подключение заново.");
    } finally {
      actionRunning.current = false;
      setBusy(false);
    }
  }

  async function changeAccount() {
    if (actionRunning.current) return;
    actionRunning.current = true;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw new Error("signout");
      setState({ kind: "login" });
      setPassword("");
    } catch {
      setMessage("Не удалось выйти из учётной записи. Попробуйте снова.");
    } finally {
      actionRunning.current = false;
      setBusy(false);
    }
  }

  const details = state.kind === "ready" ? state.details : null;
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-12 text-foreground">
      <Helmet><title>Подключить СИНТАГМУ к помощнику</title><meta name="robots" content="noindex, nofollow" /><meta name="referrer" content="no-referrer" /></Helmet>
      <section className="mx-auto max-w-lg space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm" aria-labelledby="consent-title">
        <div className="flex items-center gap-3"><ShieldCheck className="h-8 w-8 text-primary" aria-hidden="true" /><span className="text-xl font-semibold">СИНТАГМА</span></div>
        <h1 id="consent-title" className="text-2xl font-semibold">Подключение помощника</h1>
        {state.kind === "loading" && <p role="status" className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Проверяем вход и запрос подключения…</p>}
        {state.kind === "mfa" && <p role="status">Завершите двухфакторную проверку в открытом окне. После подтверждения запрос подключения продолжится.</p>}
        {state.kind === "login" && <form onSubmit={signIn} className="space-y-4">
          <p>Войдите в учётную запись администратора платформы СИНТАГМА. После входа вы увидите запрос доступа.</p>
          <div className="space-y-2"><Label htmlFor="oauth-email">Email</Label><Input id="oauth-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={busy} /></div>
          <div className="space-y-2"><Label htmlFor="oauth-password">Пароль</Label><Input id="oauth-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={busy} /></div>
          <Button type="submit" disabled={busy}>{busy ? "Входим…" : "Войти"}</Button>
        </form>}
        {state.kind === "blocked" && <><p role="alert">Подключать управление документами может только администратор платформы. У текущей учётной записи нет подтверждённого доступа.</p><Button onClick={changeAccount} disabled={busy} variant="outline">Войти другой учётной записью</Button></>}
        {state.kind === "error" && <><p role="alert">{state.message}</p>{authorizationId && <Button onClick={() => setRefresh((value) => value + 1)} variant="outline">Повторить проверку</Button>}</>}
        {state.kind === "ready" && details && <>
          <p>Вы вошли как <strong>{state.email || "администратор платформы"}</strong>.</p>
          {details.redirect_url ? <p>Для этого запроса доступ уже подтверждён. Продолжите, чтобы вернуться в приложение.</p> : <>
            <p>Приложение <strong>{details.client.name || "Без названия"}</strong> запрашивает подключение.</p>
            {details.client.uri && <p className="break-all text-sm text-muted-foreground">Сайт приложения: {details.client.uri}</p>}
            <div><h2 className="font-semibold">Счета и акты СИНТАГМЫ</h2><p className="mt-2">Помощник сможет находить организации, читать их счета и создавать акты к существующим счетам от вашего имени. Отправка клиентам в это подключение не входит.</p></div>
            <div><h2 className="font-semibold">Запрошенные данные учётной записи</h2><ul className="mt-2 list-disc space-y-1 pl-5">{(details.scope ?? "").split(/\s+/).filter(Boolean).map((scope) => <li key={scope}>{scopeLabels[scope] ?? scope}</li>)}</ul></div>
          </>}
          <div className="flex flex-wrap gap-3"><Button onClick={() => decide(true)} disabled={busy}>{busy ? "Проверяем…" : details.redirect_url ? "Продолжить в приложении" : "Разрешить подключение"}</Button>{!details.redirect_url && <Button onClick={() => decide(false)} variant="outline" disabled={busy}>Отклонить</Button>}</div>
          <Button onClick={changeAccount} variant="link" className="px-0" disabled={busy}>Войти другой учётной записью</Button>
        </>}
        {message && <p role="alert" className="text-sm text-red-700">{message}</p>}
      </section>
    </main>
  );
}
