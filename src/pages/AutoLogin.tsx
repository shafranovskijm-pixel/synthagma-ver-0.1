import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { proxiedAssetUrl } from "@/utils/proxyFetch";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

export default function AutoLogin() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setError("Ссылка повреждена");
      return;
    }
    (async () => {
      try {
        const { data, error: invErr } = await supabase.functions.invoke("student-auto-login", {
          body: { token, redirectTo: `${window.location.origin}/student` },
        });
        if (invErr) throw invErr;
        if ((data as any)?.error) throw new Error((data as any).error);
        const url = (data as any)?.action_url as string | undefined;
        if (!url) throw new Error("Не получена ссылка для входа");
        // На синтагма.рф (NGINX-прокси) Supabase-домен заблокирован — переписываем magic-link
        // через same-origin прокси, чтобы 302 на /student отработал без обращения к *.supabase.co
        const finalUrl = proxiedAssetUrl(url) || url;
        window.location.replace(finalUrl);
      } catch (e: any) {
        console.error("auto-login failed", e);
        setError(e?.message || "Ссылка недействительна или отозвана");
        setTimeout(() => navigate("/login?error=auto_login_failed", { replace: true }), 2500);
      }
    })();
  }, [params, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center space-y-4">
        {error ? (
          <>
            <h1 className="text-xl font-semibold text-foreground">Не удалось войти по ссылке</h1>
            <p className="text-muted-foreground">{error}</p>
            <p className="text-sm text-muted-foreground">Перенаправляем на страницу входа…</p>
          </>
        ) : (
          <>
            <SigmaSpinner size="lg" />
            <h1 className="text-xl font-semibold text-foreground">Выполняем вход…</h1>
            <p className="text-muted-foreground">Пожалуйста, подождите.</p>
          </>
        )}
      </div>
    </div>
  );
}
