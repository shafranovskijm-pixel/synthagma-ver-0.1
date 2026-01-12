import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, Lock, User, Building, Phone, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const RegisterOrganization = () => {
  const [orgName, setOrgName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [inn, setInn] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const { user, loading, refreshUserRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (user && !loading) {
      navigate("/organization");
    }
  }, [user, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!orgName || !contactName || !email || !password) {
      toast({
        title: "Ошибка",
        description: "Заполните все обязательные поля",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Ошибка",
        description: "Пароли не совпадают",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Ошибка",
        description: "Пароль должен быть не менее 6 символов",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    try {
      // 1. Create organization using RPC function (bypasses RLS)
      const { data: orgId, error: orgError } = await supabase
        .rpc('create_organization', {
          p_name: orgName,
          p_email: email,
          p_phone: phone || null,
          p_inn: inn || null,
          p_contact_name: contactName
        });

      if (orgError) throw orgError;
      
      const orgData = { id: orgId };

      // 2. Sign up user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/organization`,
          data: {
            full_name: contactName,
          },
        },
      });

      if (authError) throw authError;

      // 3. Update profile with organization_id and upgrade role securely
      if (authData.user) {
        // Update profile with organization_id
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ organization_id: orgData.id })
          .eq('user_id', authData.user.id);
          
        if (profileError) {
          console.error("Profile update error:", profileError);
        }

        // 4. Use secure RPC function to upgrade role to 'organization'
        const { error: roleError } = await supabase.rpc('upgrade_to_organization_role', {
          p_user_id: authData.user.id,
          p_organization_id: orgData.id
        });
        
        if (roleError) {
          console.error("Role upgrade error:", roleError);
          // Don't throw - user is created, just role upgrade failed
        }
        
        // Wait a bit for role to be set, then refresh
        await new Promise(resolve => setTimeout(resolve, 500));
        await refreshUserRole();
      }

      toast({
        title: "Успешно!",
        description: "Организация зарегистрирована. Добро пожаловать!",
      });
      
      // Force reload to get fresh auth state
      window.location.href = "/organization";
      
    } catch (error: any) {
      let errorMessage = error.message;
      if (error.message?.includes("already registered")) {
        errorMessage = "Пользователь с таким email уже зарегистрирован";
      }
      toast({
        title: "Ошибка регистрации",
        description: errorMessage,
        variant: "destructive",
      });
    }
    
    setIsLoading(false);
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
      {/* Left side - Visual */}
      <div className="hidden lg:flex flex-1 relative bg-gradient-to-br from-sigma-blue via-primary to-sigma-cyan items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0wLTZoLTJWNmgydjR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-30" />
        
        <div className="relative z-10 text-center text-white px-12">
          <div className="w-32 h-32 rounded-3xl bg-white/20 backdrop-blur-xl flex items-center justify-center mx-auto mb-8">
            <Building className="w-16 h-16" />
          </div>
          <h2 className="font-display text-4xl font-bold mb-4">
            Для организаций
          </h2>
          <p className="text-white/80 text-lg max-w-md">
            Создавайте курсы, управляйте учениками и получайте детальную аналитику
          </p>
        </div>

        {/* Decorative circles */}
        <div className="absolute top-20 right-20 w-40 h-40 rounded-full border border-white/20" />
        <div className="absolute bottom-20 left-20 w-60 h-60 rounded-full border border-white/10" />
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex flex-col justify-center px-8 lg:px-16 py-10 overflow-y-auto">
        <div className="max-w-md w-full mx-auto">
          <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8">
            <ArrowLeft className="w-4 h-4" />
            Назад
          </Link>
          
          <SigmaLogo size="lg" className="mb-8" />
          
          <h1 className="font-display text-3xl font-bold mb-2">Регистрация организации</h1>
          <p className="text-muted-foreground mb-8">
            Создайте аккаунт для вашей организации
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">Название организации *</Label>
              <div className="relative">
                <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  id="orgName" 
                  type="text" 
                  placeholder="ООО «Компания»" 
                  className="pl-10 h-12 rounded-xl"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactName">Контактное лицо *</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  id="contactName" 
                  type="text" 
                  placeholder="Иван Иванов" 
                  className="pl-10 h-12 rounded-xl"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Телефон</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input 
                    id="phone" 
                    type="tel" 
                    placeholder="+7 (999) 123-45-67" 
                    className="pl-10 h-12 rounded-xl"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="inn">ИНН</Label>
                <Input 
                  id="inn" 
                  type="text" 
                  placeholder="1234567890" 
                  className="h-12 rounded-xl"
                  value={inn}
                  onChange={(e) => setInn(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="org@company.com" 
                  className="pl-10 h-12 rounded-xl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Пароль *</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  id="password" 
                  type="password" 
                  placeholder="Минимум 6 символов" 
                  className="pl-10 h-12 rounded-xl"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Подтвердите пароль *</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  id="confirmPassword" 
                  type="password" 
                  placeholder="Повторите пароль" 
                  className="pl-10 h-12 rounded-xl"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
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
                  Регистрация...
                </>
              ) : (
                "Зарегистрировать организацию"
              )}
            </Button>
          </form>

          <p className="text-center text-muted-foreground mt-8">
            Уже есть аккаунт?{" "}
            <Link to="/login" className="text-primary hover:underline font-medium">
              Войти
            </Link>
          </p>
          
        </div>
      </div>
    </div>
  );
};

export default RegisterOrganization;
