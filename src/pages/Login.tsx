import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, Lock, Loader2, Shield, Building2, GraduationCap, User, Eye, EyeOff, RefreshCw } from "lucide-react";
import { forceClientRefresh } from "@/utils/forceClientRefresh";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { getBaseUrl } from "@/utils/getBaseUrl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const DEMO_ACCOUNTS = {
  admin: { email: "admin@demo.sigma", password: "demo123456", role: "admin", label: "Админ", icon: Shield, color: "bg-sigma-purple" },
  organization: { email: "org@demo.sigma", password: "demo123456", role: "organization", label: "Организация", icon: Building2, color: "bg-sigma-blue" },
  student: { email: "student@demo.sigma", password: "demo123456", role: "student", label: "Слушатель", icon: GraduationCap, color: "bg-sigma-green" },
};

const Login = () => {
  const [email, setEmail] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  const [loginMode, setLoginMode] = useState<"email" | "login">("email");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const { signIn, user, userRole, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (user && !loading) {
      // Wait for userRole to be loaded before navigating
      if (userRole) {
        if (userRole === 'admin') {
          navigate("/admin", { replace: true });
        } else if (userRole === 'organization') {
          navigate("/organization", { replace: true });
        } else if (userRole === 'company') {
          navigate("/company", { replace: true });
        } else {
          navigate("/student", { replace: true });
        }
      }
    }
  }, [user, userRole, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (loginMode === "email" && (!email || !password)) {
      toast.error("Ошибка", { description: "Заполните все поля" });
      return;
    }

    if (loginMode === "login" && (!login || !password)) {
      toast.error("Ошибка", { description: "Заполните все поля" });
      return;
    }

    setIsLoading(true);
    
    let signInEmail = email.trim();
    const cleanPassword = password.trim();
    
    // If login mode, find the user's email by login
    if (loginMode === "login") {
      const cleanLogin = login.trim().toLowerCase();
      // Use secure RPC to lookup user by login
      const { data: lookupResult, error: lookupError } = await supabase
        .rpc('public_lookup_user_by_login', { login_input: cleanLogin });
      
      if (lookupError || !lookupResult || lookupResult.length === 0) {
        toast.error("Ошибка входа", { description: "Неверный логин или пароль" });
        setIsLoading(false);
        return;
      }
      
      // For login-based students, use the standardized email format
      signInEmail = `${cleanLogin}@student.local`;
    }
    
    const { error } = await signIn(signInEmail, cleanPassword);
    
    if (error) {
      toast.error("Ошибка входа", { description: "error.message === "Invalid login credentials"" });
    } else {
      toast.success("Успешно!", { description: "Вы вошли в систему" });
      // Role is already loaded in context by signIn, useEffect will navigate
    }
    setIsLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!resetEmail) {
      toast.error("Ошибка", { description: "Введите email" });
      return;
    }

    setIsResetting(true);
    
    try {
      // Use custom SMTP-based password reset
      const response = await safeInvoke<any>('send-password-reset', {
        body: {
          email: resetEmail,
          redirectTo: `${getBaseUrl()}/reset-password`,
        },
      });

      if (response.error) {
        throw response.error;
      }

      toast.success("Письмо отправлено", { description: "Проверьте почту для восстановления пароля" });
      setShowForgotPassword(false);
      setResetEmail("");
    } catch (error: any) {
      console.error("Password reset error:", error);
      toast.error("Ошибка", { description: error.message || "Не удалось отправить письмо" });
    }
    
    setIsResetting(false);
  };

  const handleDemoLogin = async (accountType: keyof typeof DEMO_ACCOUNTS) => {
    const account = DEMO_ACCOUNTS[accountType];
    setDemoLoading(accountType);

    // Try to sign in first
    let { error } = await signIn(account.email, account.password);

    // If user doesn't exist, create them
    if (error?.message === "Invalid login credentials") {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: account.email,
        password: account.password,
        options: {
          data: {
            full_name: account.label + " (Демо)",
          }
        }
      });

      if (signUpError) {
        toast.error("Ошибка", { description: "Не удалось создать демо-аккаунт" });
        setDemoLoading(null);
        return;
      }

      // If organization, create org and upgrade role using secure RPC
      if (accountType === "organization" && signUpData.user) {
        const { data: orgData } = await supabase
          .from("organizations")
          .insert({
            name: "Демо Организация",
            email: account.email,
          })
          .select()
          .single();

        if (orgData) {
          await supabase
            .from("profiles")
            .update({ organization_id: orgData.id })
            .eq("user_id", signUpData.user.id);

          // Use secure RPC function to upgrade role
          await supabase.rpc('upgrade_to_organization_role', {
            p_user_id: signUpData.user.id,
            p_organization_id: orgData.id
          });
        }
      }

      // For admin demo accounts, the admin role must be assigned via database seeding
      // or by an existing admin using admin_update_user_role RPC
      // Client-side admin role creation is intentionally blocked for security
      if (accountType === "admin" && signUpData.user) {
        // Note: Admin role assignment requires existing admin privileges
        // Demo admin accounts should be pre-seeded in the database
      }

      // Sign in with new account
      const { error: loginError } = await signIn(account.email, account.password);
      if (loginError) {
        toast.error("Ошибка", { description: "Не удалось войти" });
        setDemoLoading(null);
        return;
      }
    } else if (error) {
      toast.error("Ошибка входа", { description: error.message });
      setDemoLoading(null);
      return;
    }

    toast.success("Добро пожаловать!", { description: `Вы вошли как ${account.label}` });

    // Navigate based on role
    if (accountType === "admin") {
      navigate("/admin");
    } else if (accountType === "organization") {
      navigate("/organization");
    } else {
      navigate("/student");
    }

    setDemoLoading(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side - Form */}
      <div className="flex-1 flex flex-col justify-center px-8 lg:px-16">
        <div className="max-w-md w-full mx-auto">
          <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8">
            <ArrowLeft className="w-4 h-4" />
            Назад
          </Link>
          
          <SigmaLogo size="lg" className="mb-8" />
          
          <h1 className="font-display text-3xl font-bold mb-2">Вход в систему</h1>
          <p className="text-muted-foreground mb-6">
            Введите свои данные для входа в аккаунт
          </p>


          <Tabs value={loginMode} onValueChange={(v) => setLoginMode(v as "email" | "login")} className="mb-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="email" className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                По email
              </TabsTrigger>
              <TabsTrigger value="login" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                По логину
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <form onSubmit={handleSubmit} className="space-y-6">
            {loginMode === "email" ? (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="your@email.com" 
                    className="pl-10 h-12 rounded-xl"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="login">Логин</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input 
                    id="login" 
                    type="text" 
                    placeholder="student_12345" 
                    className="pl-10 h-12 rounded-xl"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    disabled={isLoading}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    autoComplete="username"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  id="password" 
                  type={showPassword ? "text" : "password"} 
                  placeholder="••••••••" 
                  className="pl-10 pr-10 h-12 rounded-xl"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Забыли пароль?
              </button>
            </div>

            <Button 
              type="submit" 
              className="w-full btn-gradient h-12 rounded-xl text-lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Вход...
                </>
              ) : (
                "Войти"
              )}
            </Button>
          </form>

          {/* Forgot Password Dialog */}
          <Dialog open={showForgotPassword} onOpenChange={setShowForgotPassword}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Восстановление пароля</DialogTitle>
                <DialogDescription>
                  Введите email, на который зарегистрирован аккаунт
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input 
                      id="reset-email" 
                      type="email" 
                      placeholder="your@email.com" 
                      className="pl-10"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      disabled={isResetting}
                    />
                  </div>
                </div>

                <Button 
                  onClick={handleForgotPassword}
                  className="w-full"
                  disabled={isResetting}
                >
                  {isResetting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Отправка...
                    </>
                  ) : (
                    "Отправить ссылку"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <p className="text-center text-muted-foreground mt-8">
            Нет аккаунта?{" "}
            <Link to="/register-organization" className="text-primary hover:underline font-medium">
              Зарегистрировать организацию
            </Link>
          </p>

          <button
            onClick={() => forceClientRefresh()}
            className="flex items-center justify-center gap-2 mx-auto mt-6 px-4 py-2 text-sm text-muted-foreground hover:text-primary border border-border rounded-lg hover:border-primary/50 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Обновить интерфейс
          </button>

          {(window.location.hostname.includes('preview--') || window.location.hostname === 'localhost') && (
            <p className="text-center text-[10px] text-muted-foreground/50 mt-3 font-mono">
              build: {(window as any).__BUILD_VERSION__ || 'unknown'}
            </p>
          )}
        </div>
      </div>

      {/* Right side - Visual */}
      <div className="hidden lg:flex flex-1 relative bg-gradient-to-br from-primary via-accent to-sigma-purple items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0wLTZoLTJWNmgydjR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-30" />
        
        <div className="relative z-10 text-center text-white px-12">
          <div className="w-32 h-32 rounded-3xl bg-white/20 backdrop-blur-xl flex items-center justify-center mx-auto mb-8">
            <span className="font-display text-6xl font-bold">Σ</span>
          </div>
          <h2 className="font-display text-4xl font-bold mb-4">
            Добро пожаловать
          </h2>
          <p className="text-white/80 text-lg max-w-md">
            Современная платформа для дистанционного обучения с ИИ-помощником
          </p>
        </div>

        {/* Decorative circles */}
        <div className="absolute top-20 left-20 w-40 h-40 rounded-full border border-white/20" />
        <div className="absolute bottom-20 right-20 w-60 h-60 rounded-full border border-white/10" />
      </div>
    </div>
  );
};

export default Login;
