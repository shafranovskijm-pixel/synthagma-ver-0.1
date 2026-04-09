import { useSearchParams } from "react-router-dom";
import { CheckCircle, AlertTriangle, Info } from "lucide-react";

const EmailResponse = () => {
  const [searchParams] = useSearchParams();
  const status = searchParams.get("status") || "error";
  const message = searchParams.get("message") || "Произошла ошибка.";

  const config = {
    success: {
      icon: <CheckCircle className="w-16 h-16 text-green-500" />,
      title: "Запрос принят!",
      bg: "bg-green-50 border-green-200",
    },
    already: {
      icon: <Info className="w-16 h-16 text-blue-500" />,
      title: "Уже обработано",
      bg: "bg-blue-50 border-blue-200",
    },
    error: {
      icon: <AlertTriangle className="w-16 h-16 text-amber-500" />,
      title: "Ошибка",
      bg: "bg-amber-50 border-amber-200",
    },
  }[status] || {
    icon: <AlertTriangle className="w-16 h-16 text-amber-500" />,
    title: "Ошибка",
    bg: "bg-amber-50 border-amber-200",
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className={`max-w-md w-full rounded-2xl border p-10 text-center shadow-lg ${config.bg}`}>
        <div className="flex justify-center mb-6">{config.icon}</div>
        <h1 className="text-2xl font-bold text-foreground mb-3">{config.title}</h1>
        <p className="text-muted-foreground leading-relaxed">{message}</p>
        <p className="mt-8 text-xs text-muted-foreground/60">
          Платформа Sintagma — sintagma.com.ru
        </p>
      </div>
    </div>
  );
};

export default EmailResponse;
