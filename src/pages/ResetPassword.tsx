import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Lock, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { getErrorMessage } from "@/utils/handleSupabaseError";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [linkExpired, setLinkExpired] = useState(false);

  const navigate = useNavigate();
  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get('access_token');

    if (!accessToken) {
      const queryParams = new URLSearchParams(window.location.search);
      if (!queryParams.get('code')) {
        toast.error("Ошибка", { description: "Недействительная ссылка для сброса пароля" });
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password || !confirmPassword) {
      toast.error("Ошибка", { description: "Заполните все поля" });
      return;
    }

    if (password.length < 8) {
      toast.error("Ошибка", { description: "Пароль должен быть не менее 8 символов" });
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Ошибка", { description: "Пароли не совпадают" });
      return;
    }

    setIsLoading(true);

    const { error } = await supabase.auth.updateUser({
      password: password,
    });

    if (error) {
      const description = getErrorMessage(error);
      toast.error("Не удалось сохранить пароль", { description });
      const lower = (error.message || "").toLowerCase();
      const code = (error as { code?: string }).code;
      if (
        code === "session_not_found" ||
        code === "invalid_token" ||
        code === "otp_expired" ||
        /session|expired|invalid.*flow|invalid.*token/.test(lower)
      ) {
        setLinkExpired(true);
      }
      setPassword("");
      setConfirmPassword("");
    } else {
      setIsSuccess(true);
      toast.success("Успешно!", { description: "Пароль успешно изменён" });

      setTimeout(() => {
        navigate("/login");
      }, 2000);
    }

    setIsLoading(false);
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h1 className="font-display text-2xl font-bold mb-2">Пароль изменён!</h1>
          <p className="text-muted-foreground mb-6">
            Сейчас вы будете перенаправлены на страницу входа
          </p>
          <Link to="/login">
            <Button className="btn-gradient">
              Перейти ко входу
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <Link to="/login" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" />
          Назад ко входу
        </Link>
        
        <SigmaLogo size="lg" className="mb-8" />
        
        <h1 className="font-display text-3xl font-bold mb-2">Новый пароль</h1>
        <p className="text-muted-foreground mb-6">
          Введите новый пароль для вашего аккаунта
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="password">Новый пароль</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input 
                id="password" 
                type="password" 
                placeholder="••••••••" 
                className="pl-10 h-12 rounded-xl"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                autoComplete="new-password"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Минимум 8 символов. Не должен совпадать со старым паролем.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Подтвердите пароль</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input 
                id="confirmPassword" 
                type="password" 
                placeholder="••••••••" 
                className="pl-10 h-12 rounded-xl"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
                autoComplete="new-password"
              />
            </div>
          </div>

          {linkExpired && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm space-y-2">
              <p className="text-destructive font-medium">Ссылка для сброса устарела</p>
              <p className="text-muted-foreground">Запросите новую ссылку для восстановления пароля.</p>
              <Link to="/forgot-password" className="inline-flex text-primary hover:underline">
                Запросить новую ссылку
              </Link>
            </div>
          )}



          <Button 
            type="submit" 
            className="w-full btn-gradient h-12 rounded-xl text-lg"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <SigmaSpinner className="mr-2" />
                Сохранение...
              </>
            ) : (
              "Сохранить пароль"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;