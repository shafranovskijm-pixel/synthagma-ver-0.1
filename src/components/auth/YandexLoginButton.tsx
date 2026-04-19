import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface YandexLoginButtonProps {
  mode: "login" | "link" | "signup-org" | "signup-student";
  redirectTo?: string;
  label?: string;
  className?: string;
  variant?: "default" | "outline";
}

export const YandexLoginButton = ({
  mode,
  redirectTo,
  label,
  className = "",
  variant = "outline",
}: YandexLoginButtonProps) => {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("yandex-oauth-start", {
        body: { mode, redirectTo: redirectTo ?? null },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("Нет URL для редиректа");
      window.location.href = data.url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка";
      toast.error(`Не удалось начать вход через Яндекс: ${msg}`);
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      onClick={handleClick}
      disabled={loading}
      className={`w-full h-12 rounded-xl gap-2 ${className}`}
    >
      {loading ? (
        <SigmaSpinner size="sm" />
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="24" height="24" rx="4" fill="#FC3F1D" />
          <path d="M13.32 18.5h2.18V5.5h-3.17c-3.18 0-4.85 1.64-4.85 4.06 0 1.93.92 3.07 2.56 4.24l-2.85 4.7h2.36l3.17-5.27-1.1-.74c-1.34-.9-1.99-1.6-1.99-3.1 0-1.32.93-2.21 2.71-2.21h.98V18.5z" fill="#fff" />
        </svg>
      )}
      <span>{label ?? "Войти через Яндекс ID"}</span>
    </Button>
  );
};
