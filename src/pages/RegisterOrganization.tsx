import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Mail, Lock, User, Building, Phone, Search, CheckCircle2, Tag, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { SUBSCRIPTION_PLANS, YEARLY_DISCOUNT, type SubscriptionPlan } from "@/constants/subscriptionPlans";
import { getRefCode, clearRefCode, captureRefFromUrl } from "@/utils/referralCookie";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

const planKeys: SubscriptionPlan[] = ['free', 'start', 'standard', 'professional', 'maximum'];

const RegisterOrganization = () => {
  const [searchParams] = useSearchParams();
  const planParam = searchParams.get('plan') as SubscriptionPlan | null;
  const selectedPlan = planParam && planKeys.includes(planParam) ? planParam : 'free';
  const planInfo = SUBSCRIPTION_PLANS[selectedPlan];

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
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoadingInn, setIsLoadingInn] = useState(false);
  const [innLoaded, setInnLoaded] = useState(false);

  // Promo code state
  const [promoCode, setPromoCode] = useState("");
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoApplied, setPromoApplied] = useState(false);
  const [isCheckingPromo, setIsCheckingPromo] = useState(false);
  
  const { user, userRole, loading, refreshUserRole } = useAuth();
  const navigate = useNavigate();
  // Capture ref code from URL on mount
  useEffect(() => {
    captureRefFromUrl();
  }, []);

  const loadCompanyByInn = async () => {
    if (!inn || inn.length < 10) {
      toast.error("Ошибка", { description: "Введите корректный ИНН (10 или 12 цифр)" });
      return;
    }

    setIsLoadingInn(true);
    try {
      const { data, error } = await safeInvoke<any>('dadata-company', {
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
        
        toast.success("Данные загружены", { description: `Найдена компания: ${company.shortName || company.name}` });
      } else {
        toast.error("Компания не найдена", { description: "Проверьте правильность ИНН" });
      }
    } catch (error: any) {
      console.error("Error loading company:", error);
      toast.error("Ошибка загрузки", { description: error.message || "Не удалось загрузить данные компании" });
    } finally {
      setIsLoadingInn(false);
    }
  };

  useEffect(() => {
    // Don't redirect while registration is in progress (race condition fix)
    if (user && !loading && !isRegistering && userRole) {
      const target = userRole === 'organization' ? '/organization'
        : userRole === 'admin' ? '/admin'
        : userRole === 'company' ? '/company'
        : userRole === 'student' ? '/student'
        : '/';
      navigate(target, { replace: true });
    }
  }, [user, userRole, loading, navigate, isRegistering]);

  const handleCheckPromo = async () => {
    if (!promoCode.trim()) return;
    setIsCheckingPromo(true);
    try {
      const { data, error } = await supabase
        .from("promo_codes")
        .select("*")
        .eq("code", promoCode.trim().toUpperCase())
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        toast.error("Промокод не найден");
        setPromoApplied(false);
        setPromoDiscount(0);
        return;
      }

      const promo = data as any;
      if (promo.valid_until && new Date(promo.valid_until) < new Date()) {
        toast.error("Промокод истёк");
        setPromoApplied(false);
        setPromoDiscount(0);
        return;
      }
      if (promo.max_uses && promo.used_count >= promo.max_uses) {
        toast.error("Промокод исчерпан");
        setPromoApplied(false);
        setPromoDiscount(0);
        return;
      }

      setPromoDiscount(promo.discount_percent);
      setPromoApplied(true);
      toast.success("Скидка ${promo.discount_percent}% применена!");
    } catch {
      toast.error("Ошибка проверки промокода");
    } finally {
      setIsCheckingPromo(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!orgName || !contactName || !email || !phone || !password) {
      toast.error("Ошибка", { description: "Заполните все обязательные поля (включая телефон)" });
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Ошибка", { description: "Пароли не совпадают" });
      return;
    }

    if (password.length < 6) {
      toast.error("Ошибка", { description: "Пароль должен быть не менее 6 символов" });
      return;
    }

    setIsLoading(true);
    setIsRegistering(true);
    
    try {
      // 1. Sign up user first (must be authenticated before creating org)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/organization`,
          data: {
            full_name: contactName } } });

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

        // 2b. Set subscription plan and promo code on the org
        await supabase
          .from('organizations')
          .update({ 
            subscription_plan: selectedPlan,
            promo_code: promoApplied ? promoCode.trim().toUpperCase() : null
          } as any)
          .eq('id', orgId);

        // 2b2. Register referral if ref cookie exists
        const refCode = getRefCode();
        if (refCode) {
          await supabase.rpc('register_referral', { p_ref_code: refCode, p_organization_id: orgId });
          clearRefCode();
        }

        // 2c. Increment promo code usage if applied
        if (promoApplied && promoCode) {
          await supabase.rpc('increment_promo_usage' as any, { p_code: promoCode.trim().toUpperCase() });
        }

        // 3. Update profile with organization_id
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ organization_id: orgId })
          .eq('user_id', authData.user.id);
          
        if (profileError) {
          console.error("Profile update error:", profileError);
          throw new Error("Ошибка привязки профиля к организации: " + profileError.message);
        }

        // 4. Use secure RPC function to upgrade role to 'organization'
        const { error: roleError } = await supabase.rpc('upgrade_to_organization_role', {
          p_user_id: authData.user.id,
          p_organization_id: orgId
        });
        
        if (roleError) {
          console.error("Role upgrade error:", roleError);
          throw new Error("Ошибка назначения роли организации: " + roleError.message);
        }
        
        // Force refresh role with explicit userId (context may not have user yet)
        let confirmedRole = await refreshUserRole(authData.user.id);
        
        // Retry up to 3 times if role hasn't updated yet
        for (let i = 0; i < 3 && confirmedRole !== 'organization'; i++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          confirmedRole = await refreshUserRole(authData.user.id);
        }
        
        if (confirmedRole !== 'organization') {
        }

        // Send Telegram notification (non-blocking)
        try {
          const planLabel = selectedPlan || "free";
          const telegramMessage = `🏢 <b>Новая организация зарегистрирована!</b>

<b>Название:</b> ${orgName}
<b>Контактное лицо:</b> ${contactName || "—"}
<b>Email:</b> ${email}
<b>Телефон:</b> ${phone || "—"}
<b>ИНН:</b> ${inn || "—"}
<b>Тариф:</b> ${planLabel}${promoCode ? `\n<b>Промокод:</b> ${promoCode}` : ""}`;

          await supabase.functions.invoke("send-telegram-notification", {
            body: { message: telegramMessage } });
        } catch (tgErr) {
          console.error("Telegram notification error:", tgErr);
        }

        // Seed welcome course (non-blocking)
        try {
          await supabase.functions.invoke("seed-welcome-course", {
            body: { organizationId: orgId } });
        } catch (seedErr) {
          console.error("Seed welcome course error:", seedErr);
        }
      }

      if (selectedPlan && selectedPlan !== 'free') {
        toast.success("Спасибо за регистрацию!", { description: "Ваш тариф будет подключён после оплаты. Наш менеджер свяжется с вами. Спасибо!" });
      } else {
        toast.success("Успешно!", { description: "Организация зарегистрирована. Добро пожаловать!" });
      }
      
      // Navigate — role should already be refreshed above
      navigate("/organization", { replace: true });
      
    } catch (error: any) {
      let errorMessage = error.message;
      if (error.message?.includes("already registered")) {
        errorMessage = "Пользователь с таким email уже зарегистрирован";
      }
      toast.error("Ошибка регистрации", { description: "errorMessage" });
    }
    
    setIsLoading(false);
    setIsRegistering(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <SigmaSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side - Visual */}
      <div className="hidden lg:flex flex-1 relative bg-gradient-to-br from-primary via-primary/80 to-accent items-center justify-center overflow-hidden">
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
          <p className="text-muted-foreground mb-4">
            Создайте аккаунт для вашей организации
          </p>

          {/* Selected Plan Card */}
          {selectedPlan !== 'free' && (
            <div className="p-4 rounded-xl border-2 border-primary/30 bg-primary/5 mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="font-display font-semibold text-lg">{planInfo.name}</span>
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{planInfo.description}</span>
              </div>
              <div className="flex items-baseline gap-2">
                {promoApplied ? (
                  <>
                    <span className="font-display text-2xl font-bold text-primary">
                      {Math.round(planInfo.price * (1 - promoDiscount / 100)).toLocaleString('ru-RU')} ₽/мес
                    </span>
                    <span className="text-sm text-muted-foreground line-through">
                      {planInfo.price.toLocaleString('ru-RU')} ₽/мес
                    </span>
                    <span className="text-xs font-semibold text-green-600 bg-green-500/10 px-2 py-0.5 rounded-full">
                      −{promoDiscount}%
                    </span>
                  </>
                ) : (
                  <span className="font-display text-2xl font-bold">
                    {planInfo.price.toLocaleString('ru-RU')} ₽/мес
                  </span>
                )}
              </div>

              {/* Promo code input */}
              <div className="mt-3 flex gap-2">
                <div className="relative flex-1">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Промокод"
                    className="pl-9 h-10 rounded-xl uppercase"
                    value={promoCode}
                    onChange={(e) => {
                      setPromoCode(e.target.value.toUpperCase());
                      if (promoApplied) { setPromoApplied(false); setPromoDiscount(0); }
                    }}
                    disabled={isLoading}
                  />
                </div>
                <Button
                  type="button"
                  variant={promoApplied ? "default" : "outline"}
                  className={`h-10 rounded-xl px-4 ${promoApplied ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}
                  onClick={handleCheckPromo}
                  disabled={isLoading || isCheckingPromo || !promoCode.trim()}
                >
                  {isCheckingPromo ? (
                    <SigmaSpinner size="sm" />
                  ) : promoApplied ? (
                    <><Check className="w-4 h-4 mr-1" /> Применён</>
                  ) : (
                    "Применить"
                  )}
                </Button>
              </div>
            </div>
          )}

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
                    <SigmaSpinner size="sm" />
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
                  <SigmaSpinner className="mr-2" />
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
