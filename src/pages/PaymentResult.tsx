import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  success: boolean;
}

export default function PaymentResult({ success }: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate("/student", { replace: true });
    }, 5000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center max-w-md space-y-6">
        {success ? (
          <>
            <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto" />
            <h1 className="text-2xl font-bold">Оплата прошла успешно!</h1>
            <p className="text-muted-foreground">
              Курс будет доступен в вашем личном кабинете. Вы будете перенаправлены автоматически через несколько секунд.
            </p>
          </>
        ) : (
          <>
            <XCircle className="w-20 h-20 text-destructive mx-auto" />
            <h1 className="text-2xl font-bold">Оплата не завершена</h1>
            <p className="text-muted-foreground">
              Платёж был отменён или произошла ошибка. Попробуйте ещё раз или свяжитесь с поддержкой.
            </p>
          </>
        )}
        <Button onClick={() => navigate("/student", { replace: true })}>
          Перейти в личный кабинет
        </Button>
      </div>
    </div>
  );
}
