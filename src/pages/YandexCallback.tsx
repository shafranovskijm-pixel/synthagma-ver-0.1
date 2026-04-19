import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle } from "lucide-react";

const YandexCallback = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"loading" | "need_inn" | "linked" | "error" | "signed_in">(
    "loading"
  );
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Form state for "need_inn"
  const [inn, setInn] = useState("");
  const [orgName, setOrgName] = useState("");
  const [contactName, setContactName] = useState(params.get("name") ?? "");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const completionToken = params.get("token") ?? "";

  useEffect(() => {
    const status = params.get("status");

    if (status === "signed_in") {
      // Magic link redirect — Supabase will set session via URL hash
      // Detect session and route based on role
      (async () => {
        // Wait briefly for session establishment
        await new Promise((r) => setTimeout(r, 500));
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          const { data: roleRow } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", data.session.user.id)
            .maybeSingle();
          const role = roleRow?.role;
          if (role === "organization") navigate("/organization", { replace: true });
          else if (role === "admin") navigate("/admin", { replace: true });
          else if (role === "company") navigate("/company", { replace: true });
          else navigate("/student", { replace: true });
        } else {
          setPhase("error");
          setErrorMessage("Не удалось установить сессию");
        }
      })();
      return;
    }

    if (status === "linked") {
      setPhase("linked");
      toast.success("Яндекс ID успешно привязан");
      const redirect = params.get("redirect");
      setTimeout(() => navigate(redirect || "/student", { replace: true }), 1500);
      return;
    }

    if (status === "need_inn") {
      setPhase("need_inn");
      return;
    }

    if (status === "not_linked") {
      setPhase("error");
      setErrorMessage(
        "Этот Яндекс ID ещё не привязан к аккаунту. Войдите обычным способом и привяжите его в личном кабинете."
      );
      return;
    }

    if (status === "error") {
      setPhase("error");
      const msg = params.get("message") ?? "unknown";
      const human: Record<string, string> = {
        yandex_already_linked: "Этот Яндекс ID уже привязан к другому аккаунту.",
        user_already_has_yandex: "У вашего аккаунта уже привязан Яндекс ID.",
        invalid_state: "Сессия OAuth недействительна. Попробуйте снова.",
        state_expired: "Сессия OAuth истекла. Попробуйте снова.",
        state_already_used: "Сессия OAuth уже использована.",
        token_exchange_failed: "Не удалось получить токен от Яндекс.",
        no_email_from_yandex: "Ваш аккаунт Яндекс не предоставил email.",
      };
      setErrorMessage(human[msg] ?? msg);
      return;
    }

    setPhase("error");
    setErrorMessage("Неизвестный статус ответа");
  }, [params, navigate]);

  const handleSubmitInn = async () => {
    if (!inn.trim() || !orgName.trim()) {
      toast.error("ИНН и название организации обязательны");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("yandex-oauth-complete-org", {
        body: {
          token: completionToken,
          inn: inn.trim(),
          orgName: orgName.trim(),
          contactName: contactName.trim(),
          phone: phone.trim(),
          redirectOrigin: window.location.origin,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.loginUrl) {
        window.location.href = data.loginUrl;
      } else {
        throw new Error("Нет ссылки входа");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка";
      toast.error(msg);
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        {phase === "loading" && (
          <div className="text-center">
            <SigmaSpinner size="lg" />
            <p className="text-muted-foreground mt-4">Завершаем вход через Яндекс...</p>
          </div>
        )}

        {phase === "linked" && (
          <div className="text-center">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h1 className="font-display text-2xl font-bold">Яндекс ID привязан</h1>
            <p className="text-muted-foreground mt-2">Перенаправляем...</p>
          </div>
        )}

        {phase === "error" && (
          <div className="text-center p-6 rounded-2xl border bg-card">
            <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
            <h1 className="font-display text-2xl font-bold mb-2">Не удалось войти</h1>
            <p className="text-muted-foreground mb-6">{errorMessage}</p>
            <Button onClick={() => navigate("/login")}>Вернуться ко входу</Button>
          </div>
        )}

        {phase === "need_inn" && (
          <div className="p-6 rounded-2xl border bg-card space-y-4">
            <div>
              <h1 className="font-display text-2xl font-bold mb-1">Регистрация организации</h1>
              <p className="text-sm text-muted-foreground">
                Для завершения регистрации через Яндекс ID укажите ИНН вашей организации
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="y-inn">ИНН организации *</Label>
              <Input
                id="y-inn"
                placeholder="10 или 12 цифр"
                value={inn}
                onChange={(e) => setInn(e.target.value.replace(/\D/g, "").slice(0, 12))}
                disabled={submitting}
                className="h-12 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="y-org-name">Название организации *</Label>
              <Input
                id="y-org-name"
                placeholder="ООО «Компания»"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                disabled={submitting}
                className="h-12 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="y-contact">Контактное лицо</Label>
              <Input
                id="y-contact"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                disabled={submitting}
                className="h-12 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="y-phone">Телефон</Label>
              <Input
                id="y-phone"
                placeholder="+7 (999) 123-45-67"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={submitting}
                className="h-12 rounded-xl"
              />
            </div>

            <Button
              onClick={handleSubmitInn}
              disabled={submitting}
              className="w-full h-12 rounded-xl btn-gradient"
            >
              {submitting ? <SigmaSpinner size="sm" /> : "Завершить регистрацию"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default YandexCallback;
