import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

const EmailResponse = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const status = searchParams.get("status");
  const message = searchParams.get("message");

  useEffect(() => {
    const baseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!baseUrl) return;

    const params = new URLSearchParams();
    if (token) params.set("token", token);
    if (status) params.set("result", status);
    if (message) params.set("message", message);

    window.location.replace(`${baseUrl}/functions/v1/handle-email-action?${params.toString()}`);
  }, [token, status, message]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card p-10 text-center shadow-lg">
        <Loader2 className="mx-auto mb-6 h-10 w-10 animate-spin text-primary" />
        <h1 className="text-2xl font-bold text-foreground mb-3">Открываем форму</h1>
        <p className="text-muted-foreground leading-relaxed">Если переход не сработал автоматически, обновите страницу.</p>
      </div>
    </div>
  );
};

export default EmailResponse;
