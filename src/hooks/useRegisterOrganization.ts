import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/constants/subscriptionPlans";
import { getRefCode, clearRefCode, captureRefFromUrl } from "@/utils/referralCookie";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";

const planKeys: SubscriptionPlan[] = ['free', 'start', 'standard', 'professional', 'maximum'];

export function useRegisterOrganization() {
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
  const [promoCode, setPromoCode] = useState("");
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoApplied, setPromoApplied] = useState(false);
  const [isCheckingPromo, setIsCheckingPromo] = useState(false);

  const { user, userRole, loading, refreshUserRole } = useAuth();
  const navigate = useNavigate();

  useEffect(() => { captureRefFromUrl(); }, []);

  useEffect(() => {
    if (user && !loading && !isRegistering && userRole) {
      const target = userRole === 'organization' ? '/organization'
        : userRole === 'admin' ? '/admin'
        : userRole === 'company' ? '/company'
        : userRole === 'student' ? '/student' : '/';
      navigate(target, { replace: true });
    }
  }, [user, userRole, loading, navigate, isRegistering]);

  const loadCompanyByInn = async () => {
    if (!inn || inn.length < 10) {
      toast.error("Ошибка", { description: "Введите корректный ИНН (10 или 12 цифр)" });
      return;
    }
    setIsLoadingInn(true);
    try {
      const { data, error } = await safeInvoke<any>('dadata-company', { body: { inn } });
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
    } catch (error) {
      console.error("Error loading company:", error);
      toast.error("Ошибка загрузки", { description: getErrorMessage(error, "Не удалось загрузить данные компании") });
    } finally { setIsLoadingInn(false); }
  };

  const handleCheckPromo = async () => {
    if (!promoCode.trim()) return;
    setIsCheckingPromo(true);
    try {
      const { data, error } = await supabase.from("promo_codes").select("*").eq("code", promoCode.trim().toUpperCase()).eq("is_active", true).maybeSingle();
      if (error) throw error;
      if (!data) { toast.error("Промокод не найден"); setPromoApplied(false); setPromoDiscount(0); return; }
      const promo = data as any;
      if (promo.valid_until && new Date(promo.valid_until) < new Date()) { toast.error("Промокод истёк"); setPromoApplied(false); setPromoDiscount(0); return; }
      if (promo.max_uses && promo.used_count >= promo.max_uses) { toast.error("Промокод исчерпан"); setPromoApplied(false); setPromoDiscount(0); return; }
      setPromoDiscount(promo.discount_percent);
      setPromoApplied(true);
      toast.success(`Скидка ${promo.discount_percent}% применена!`);
    } catch { toast.error("Ошибка проверки промокода"); }
    finally { setIsCheckingPromo(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName || !contactName || !email || !phone || !password) {
      toast.error("Ошибка", { description: "Заполните все обязательные поля (включая телефон)" });
      return;
    }
    if (password !== confirmPassword) { toast.error("Ошибка", { description: "Пароли не совпадают" }); return; }
    if (password.length < 6) { toast.error("Ошибка", { description: "Пароль должен быть не менее 6 символов" }); return; }

    setIsLoading(true);
    setIsRegistering(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: `${window.location.origin}/organization`, data: { full_name: contactName } },
      });
      if (authError) throw authError;

      if (authData.user) {
        const { data: orgId, error: orgError } = await supabase.rpc('create_organization', {
          p_name: orgName, p_email: email, p_phone: phone || null, p_inn: inn || null,
          p_contact_name: contactName, p_kpp: kpp || null, p_ogrn: ogrn || null,
          p_legal_address: address || null, p_director_name: directorName || null,
        });
        if (orgError) throw orgError;

        await supabase.from('organizations').update({ subscription_plan: selectedPlan, promo_code: promoApplied ? promoCode.trim().toUpperCase() : null } as any).eq('id', orgId);

        const refCode = getRefCode();
        if (refCode) { await supabase.rpc('register_referral', { p_ref_code: refCode, p_organization_id: orgId }); clearRefCode(); }
        if (promoApplied && promoCode) { await supabase.rpc('increment_promo_usage' as any, { p_code: promoCode.trim().toUpperCase() }); }

        const { error: profileError } = await supabase.from('profiles').update({ organization_id: orgId }).eq('user_id', authData.user.id);
        if (profileError) throw new Error("Ошибка привязки профиля к организации: " + profileError.message);

        const { error: roleError } = await supabase.rpc('upgrade_to_organization_role', { p_user_id: authData.user.id, p_organization_id: orgId });
        if (roleError) throw new Error("Ошибка назначения роли организации: " + roleError.message);

        let confirmedRole = await refreshUserRole(authData.user.id);
        for (let i = 0; i < 3 && confirmedRole !== 'organization'; i++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          confirmedRole = await refreshUserRole(authData.user.id);
        }

        try {
          const telegramMessage = `🏢 <b>Новая организация зарегистрирована!</b>\n\n<b>Название:</b> ${orgName}\n<b>Контактное лицо:</b> ${contactName || "—"}\n<b>Email:</b> ${email}\n<b>Телефон:</b> ${phone || "—"}\n<b>ИНН:</b> ${inn || "—"}\n<b>Тариф:</b> ${selectedPlan}${promoCode ? `\n<b>Промокод:</b> ${promoCode}` : ""}`;
          await supabase.functions.invoke("send-telegram-notification", { body: { message: telegramMessage } });
        } catch (tgErr) { console.error("Telegram notification error:", tgErr); }

        try { await supabase.functions.invoke("seed-welcome-course", { body: { organizationId: orgId } }); }
        catch (seedErr) { console.error("Seed welcome course error:", seedErr); }
      }

      if (selectedPlan && selectedPlan !== 'free') {
        toast.success("Спасибо за регистрацию!", { description: "Ваш тариф будет подключён после оплаты. Наш менеджер свяжется с вами. Спасибо!" });
      } else {
        toast.success("Успешно!", { description: "Организация зарегистрирована. Добро пожаловать!" });
      }
      navigate("/organization", { replace: true });
    } catch (error: any) {
      let errorMessage = error.message;
      if (error.message?.includes("already registered")) errorMessage = "Пользователь с таким email уже зарегистрирован";
      toast.error("Ошибка регистрации", { description: errorMessage });
    }
    setIsLoading(false);
    setIsRegistering(false);
  };

  return {
    selectedPlan, planInfo, loading,
    orgName, setOrgName, contactName, setContactName, email, setEmail,
    phone, setPhone, inn, setInn, kpp, setKpp, ogrn, setOgrn,
    address, setAddress, directorName, setDirectorName,
    password, setPassword, confirmPassword, setConfirmPassword,
    isLoading, isLoadingInn, innLoaded,
    promoCode, setPromoCode, promoDiscount, promoApplied, setPromoApplied, setPromoDiscount,
    isCheckingPromo,
    loadCompanyByInn, handleCheckPromo, handleSubmit,
  };
}
