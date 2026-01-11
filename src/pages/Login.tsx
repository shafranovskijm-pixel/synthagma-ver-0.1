import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, Lock, Loader2, Shield, Building2, GraduationCap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const DEMO_ACCOUNTS = {
  admin: { email: "admin@demo.sigma", password: "demo123456", role: "admin", label: "Админ", icon: Shield, color: "bg-sigma-purple" },
  organization: { email: "org@demo.sigma", password: "demo123456", role: "organization", label: "Организация", icon: Building2, color: "bg-sigma-blue" },
  student: { email: "student@demo.sigma", password: "demo123456", role: "student", label: "Слушатель", icon: GraduationCap, color: "bg-sigma-green" },
};

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  
  const { signIn, user, userRole, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (user && !loading && userRole) {
      if (userRole === 'admin') {
        navigate("/admin");
      } else if (userRole === 'organization') {
        navigate("/organization");
      } else {
        navigate("/student");
      }
    }
  }, [user, userRole, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast({
        title: "Ошибка",
        description: "Заполните все поля",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    const { error } = await signIn(email, password);
    
    if (error) {
      toast({
        title: "Ошибка входа",
        description: error.message === "Invalid login credentials" 
          ? "Неверный email или пароль" 
          : error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Успешно!",
        description: "Вы вошли в систему",
      });
      navigate("/student");
    }
    
    setIsLoading(false);
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
        toast({
          title: "Ошибка",
          description: "Не удалось создать демо-аккаунт",
          variant: "destructive",
        });
        setDemoLoading(null);
        return;
      }

      // If organization, create org and assign role
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

          await supabase
            .from("user_roles")
            .insert({
              user_id: signUpData.user.id,
              role: "organization",
            });
        }
      }

      // If admin, assign admin role
      if (accountType === "admin" && signUpData.user) {
        await supabase
          .from("user_roles")
          .insert({
            user_id: signUpData.user.id,
            role: "admin",
          });
      }

      // Sign in with new account
      const { error: loginError } = await signIn(account.email, account.password);
      if (loginError) {
        toast({
          title: "Ошибка",
          description: "Не удалось войти",
          variant: "destructive",
        });
        setDemoLoading(null);
        return;
      }
    } else if (error) {
      toast({
        title: "Ошибка входа",
        description: error.message,
        variant: "destructive",
      });
      setDemoLoading(null);
      return;
    }

    toast({
      title: "Добро пожаловать!",
      description: `Вы вошли как ${account.label}`,
    });

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

          {/* Demo Quick Login */}
          <div className="mb-8 p-4 rounded-xl bg-muted/50 border border-border">
            <p className="text-sm text-muted-foreground mb-3 text-center">Быстрый вход для демо:</p>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(DEMO_ACCOUNTS) as [keyof typeof DEMO_ACCOUNTS, typeof DEMO_ACCOUNTS.admin][]).map(([key, account]) => {
                const Icon = account.icon;
                return (
                  <Button
                    key={key}
                    variant="outline"
                    onClick={() => handleDemoLogin(key)}
                    disabled={demoLoading !== null}
                    className={`flex flex-col items-center gap-1 h-auto py-3 hover:border-primary/50 ${demoLoading === key ? 'opacity-50' : ''}`}
                  >
                    {demoLoading === key ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <div className={`w-8 h-8 rounded-lg ${account.color} flex items-center justify-center`}>
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <span className="text-xs font-medium">{account.label}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">или войдите с email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
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

            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
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
                />
              </div>
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

          <p className="text-center text-muted-foreground mt-8">
            Нет аккаунта?{" "}
            <Link to="/register" className="text-primary hover:underline font-medium">
              Зарегистрироваться
            </Link>
          </p>
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
