import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { SigmaLogo } from "@/components/ui/SigmaLogo";

export default function DemoStudentLogin() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      try {
        // Save current session so user can return to org/admin cabinet.
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.refresh_token && session?.access_token) {
            const ref = document.referrer || '';
            let returnPath = '/organization';
            try {
              const u = new URL(ref);
              if (u.origin === window.location.origin) {
                const p = u.pathname;
                if (p.startsWith('/organization') || p.startsWith('/admin') || p.startsWith('/sales') || p.startsWith('/company')) {
                  returnPath = p + u.search;
                }
              }
            } catch {}
            localStorage.setItem('demoStudentReturn', JSON.stringify({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              returnPath,
            }));
          }
        } catch (e) { console.warn('Failed to capture return session', e); }

        // Always sign out first so we don't keep an admin/org session.
        await supabase.auth.signOut();

        const { data, error: invokeErr } = await supabase.functions.invoke("demo-student-login");
        if (invokeErr) throw invokeErr;
        if (!data?.email || !data?.password) throw new Error("Демо-аккаунт недоступен");

        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });
        if (signInErr) throw signInErr;

        navigate("/student", { replace: true });
      } catch (e: any) {
        console.error("Demo student login failed", e);
        setError(e?.message || "Не удалось войти в демо-кабинет");
      }
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-4 max-w-md">
        <SigmaLogo size="md" />
        {error ? (
          <>
            <h2 className="text-xl font-bold text-destructive">Ошибка</h2>
            <p className="text-muted-foreground">{error}</p>
          </>
        ) : (
          <>
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
            <h2 className="text-lg font-semibold">Открываем демо-кабинет ученика…</h2>
            <p className="text-sm text-muted-foreground">Сейчас вы увидите готовый кабинет с курсами и документами.</p>
          </>
        )}
      </div>
    </div>
  );
}
