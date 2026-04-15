import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle, AlertCircle, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TokenInfo {
  orgName: string;
  phone: string;
  used: boolean;
}

const EmailResponse = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const resultStatus = searchParams.get("status");
  const resultMessage = searchParams.get("message");

  const [loading, setLoading] = useState(true);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [error, setError] = useState("");
  const [phone, setPhone] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ status: string; message: string } | null>(
    resultStatus && resultMessage ? { status: resultStatus, message: resultMessage } : null
  );

  useEffect(() => {
    if (result || !token) {
      setLoading(false);
      if (!token && !result) setError("Неверная ссылка. Токен не указан.");
      return;
    }

    const fetchToken = async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke("handle-email-action", {
          method: "POST",
          body: { action: "validate", token } });
        if (fnError) throw fnError;
        if (!data?.ok) {
          if (data?.used) {
            setResult({ status: "already", message: data.message || "Ваш запрос уже был принят ранее." });
          } else {
            setError(data?.error || "Ссылка недействительна.");
          }
        } else {
          setTokenInfo({ orgName: data.orgName, phone: data.phone, used: false });
          setPhone(data.phone || "");
        }
      } catch {
        setError("Ошибка при загрузке формы.");
      } finally {
        setLoading(false);
      }
    };
    fetchToken();
  }, [token, result]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError("");

    try {
      const { data, error: fnError } = await supabase.functions.invoke("handle-email-action", {
        method: "POST",
        body: { token, phone: phone.trim(), comment: comment.trim() } });
      if (fnError) throw fnError;
      if (!data?.ok) throw new Error(data?.error || "Ошибка");
      setResult({ status: data.status || "success", message: data.message || "Спасибо!" });
    } catch (err: any) {
      setError(err.message || "Произошла ошибка при отправке.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-orange-50 via-white to-slate-50 p-5">
        <div className="max-w-md w-full rounded-3xl border border-amber-200 bg-white p-10 text-center shadow-xl">
          <SigmaSpinner size="xl" className="mx-auto mb-4 text-orange-500" />
          <p className="text-slate-500">Загрузка формы…</p>
        </div>
      </div>
    );
  }

  if (result) {
    const config = {
      success: { icon: CheckCircle, color: "text-green-600", bg: "bg-green-50", border: "border-green-200" },
      already: { icon: Info, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
      error: { icon: AlertCircle, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" } }[result.status] || { icon: CheckCircle, color: "text-green-600", bg: "bg-green-50", border: "border-green-200" };
    const Icon = config.icon;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-orange-50 via-white to-slate-50 p-5">
        <div className={`max-w-md w-full rounded-3xl border ${config.border} ${config.bg} p-10 text-center shadow-xl`}>
          <Icon className={`mx-auto mb-4 h-12 w-12 ${config.color}`} />
          <h1 className="text-2xl font-bold text-slate-900 mb-3">
            {result.status === "success" ? "Запрос принят!" : result.status === "already" ? "Уже обработано" : "Ошибка"}
          </h1>
          <p className="text-slate-600 leading-relaxed">{result.message}</p>
          <p className="mt-6 text-sm text-slate-400">Платформа Sintagma — sintagma.com.ru</p>
        </div>
      </div>
    );
  }

  if (error && !tokenInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-orange-50 via-white to-slate-50 p-5">
        <div className="max-w-md w-full rounded-3xl border border-amber-200 bg-amber-50 p-10 text-center shadow-xl">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-amber-600" />
          <h1 className="text-2xl font-bold text-slate-900 mb-3">Ошибка</h1>
          <p className="text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-orange-50 via-white to-slate-50 p-5">
      <div className="max-w-[560px] w-full rounded-3xl border border-amber-200 bg-white p-9 shadow-xl">
        <span className="inline-block px-3 py-2 bg-orange-50 text-orange-700 rounded-full text-xs font-bold tracking-wider uppercase">
          Sintagma
        </span>
        <h1 className="mt-5 text-3xl font-bold text-slate-900 leading-tight">Запрос консультации</h1>
        <p className="mt-2 mb-7 text-slate-500 text-base leading-relaxed">
          Если хотите, оставьте номер и комментарий — мы свяжемся с{" "}
          <span className="font-bold text-slate-900">{tokenInfo?.orgName}</span> в удобное время.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 border border-red-200 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-5">
            <label htmlFor="phone" className="block mb-2 text-sm font-bold text-slate-700">
              Телефон для связи
            </label>
            <input
              id="phone"
              type="tel"
              placeholder="+7 (___) ___-__-__"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border border-slate-300 rounded-2xl px-4 py-3.5 text-base text-slate-900 bg-white outline-none transition-all focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15"
            />
            <p className="mt-1.5 text-xs text-slate-400">
              Можно указать номер организации или другой удобный номер.
            </p>
          </div>

          <div className="mb-5">
            <label htmlFor="comment" className="block mb-2 text-sm font-bold text-slate-700">
              Комментарий
            </label>
            <textarea
              id="comment"
              placeholder="Например: удобно перезвонить после 15:00"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              className="w-full border border-slate-300 rounded-2xl px-4 py-3.5 text-base text-slate-900 bg-white outline-none transition-all focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15 resize-y min-h-[120px]"
            />
            <p className="mt-1.5 text-xs text-slate-400">
              Напишите удобное время для звонка или любые детали.
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-2xl py-4 px-5 text-base font-bold text-white bg-gradient-to-r from-amber-500 to-orange-600 shadow-lg shadow-orange-600/20 hover:shadow-xl transition-shadow disabled:opacity-70 disabled:cursor-wait"
          >
            {submitting ? "Отправка…" : "Отправить запрос"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          Платформа Sintagma — sintagma.com.ru
        </p>
      </div>
    </div>
  );
};

export default EmailResponse;
