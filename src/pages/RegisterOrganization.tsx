import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, Lock, User, Building, Phone, Loader2, Search, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const RegisterOrganization = () => {
  const [orgName, setOrgName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [inn, setInn] = useState("");
  const [kpp, setKpp] = useState("");
  const [ogrn, setOgrn] = useState("");
  const [address, setAddress] = useState("");
  const [directorName, setDirectorName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingInn, setIsLoadingInn] = useState(false);
  const [innLoaded, setInnLoaded] = useState(false);
  
  const { user, loading, refreshUserRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const loadCompanyByInn = async () => {
    if (!inn || inn.length < 10) {
      toast({
        title: "Ошибка",
        description: "Введите корректный ИНН (10 или 12 цифр)",
        variant: "destructive",
      });
      return;
    }

    setIsLoadingInn(true);
    try {
      const { data, error } = await supabase.functions.invoke('dadata-company', {
        body: { inn }
      });

      if (error) throw error;

      if (data?.success && data?.company) {
        const company = data.company;
        setOrgName(company.shortName || company.name || "");
        setKpp(company.kpp || "");
        setOgrn(company.ogrn || "");
        setAddress(company.address || "");
        setDirectorName(company.management || "");
        setInnLoaded(true);
        
        toast({
          title: "Данные загружены",
          description: `Найдена компания: ${company.shortName || company.name}`,
        });
      } else {
        toast({
          title: "Компания не найдена",
          description: "Проверьте правильность ИНН",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Error loading company:", error);
      toast({
        title: "Ошибка загрузки",
        description: error.message || "Не удалось загрузить данные компании",
        variant: "destructive",
      });
    } finally {
      setIsLoadingInn(false);
    }
  };

  useEffect(() => {
    if (user && !loading) {
      navigate("/organization");
    }
  }, [user, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!orgName || !contactName || !email || !phone || !password) {
      toast({
        title: "Ошибка",
        description: "Заполните все обязательные поля (включая телефон)",
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
      // 1. Sign up user first (must be authenticated before creating org)
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

      if (authData.user) {
        // 2. Create organization using RPC function (now requires auth)
        const { data: orgId, error: orgError } = await supabase
          .rpc('create_organization', {
            p_name: orgName,
            p_email: email,
            p_phone: phone || null,
            p_inn: inn || null,
            p_contact_name: contactName,
            p_kpp: kpp || null,
            p_ogrn: ogrn || null,
            p_legal_address: address || null,
            p_director_name: directorName || null
          });

        if (orgError) throw orgError;

        // 3. Update profile with organization_id
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ organization_id: orgId })
          .eq('user_id', authData.user.id);
          
        if (profileError) {
          console.error("Profile update error:", profileError);
        }

        // 4. Use secure RPC function to upgrade role to 'organization'
        const { error: roleError } = await supabase.rpc('upgrade_to_organization_role', {
          p_user_id: authData.user.id,
          p_organization_id: orgId
        });
        
        if (roleError) {
          console.error("Role upgrade error:", roleError);
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
            {/* INN with search button - FIRST and highlighted */}
            <div className="p-4 rounded-xl bg-primary/5 border-2 border-primary/20 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Search className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <Label htmlFor="inn" className="text-base font-medium">Быстрое заполнение по ИНН</Label>
                  <p className="text-xs text-muted-foreground">
                    Введите ИНН и мы заполним данные автоматически
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Input 
                  id="inn" 
                  type="text" 
                  placeholder="Введите ИНН организации" 
                  className="h-12 rounded-xl flex-1 bg-background"
                  value={inn}
                  onChange={(e) => {
                    setInn(e.target.value.replace(/\D/g, '').slice(0, 12));
                    setInnLoaded(false);
                  }}
                  disabled={isLoading || isLoadingInn}
                />
                <Button 
                  type="button"
                  variant={innLoaded ? "default" : "outline"}
                  className={`h-12 rounded-xl px-4 ${innLoaded ? 'bg-sigma-green hover:bg-sigma-green/90' : ''}`}
                  onClick={loadCompanyByInn}
                  disabled={isLoading || isLoadingInn || inn.length < 10}
                >
                  {isLoadingInn ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : innLoaded ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Загружено
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Найти
                    </>
                  )}
                </Button>
              </div>
            </div>

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
                <Label htmlFor="kpp">КПП</Label>
                <Input 
                  id="kpp" 
                  type="text" 
                  placeholder="123456789" 
                  className="h-12 rounded-xl"
                  value={kpp}
                  onChange={(e) => setKpp(e.target.value.replace(/\D/g, '').slice(0, 9))}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ogrn">ОГРН</Label>
                <Input 
                  id="ogrn" 
                  type="text" 
                  placeholder="1234567890123" 
                  className="h-12 rounded-xl"
                  value={ogrn}
                  onChange={(e) => setOgrn(e.target.value.replace(/\D/g, '').slice(0, 15))}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Юридический адрес</Label>
              <Input 
                id="address" 
                type="text" 
                placeholder="г. Москва, ул. Примерная, д. 1" 
                className="h-12 rounded-xl"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="directorName">Руководитель</Label>
              <Input 
                id="directorName" 
                type="text" 
                placeholder="Иванов Иван Иванович" 
                className="h-12 rounded-xl"
                value={directorName}
                onChange={(e) => setDirectorName(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Телефон *</Label>
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
                  required
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
