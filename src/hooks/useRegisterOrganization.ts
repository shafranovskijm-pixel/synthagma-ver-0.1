import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/constants/subscriptionPlans";
import { getRefCode, clearRefCode, captureRefFromUrl } from "@/utils/referralCookie";
import { getUtmData } from "@/utils/utmCapture";
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

  const buildAttemptPayload = (extra: Record<string, any> = {}) => {
    const utm = getUtmData() || {};
    const refCode = getRefCode();
    return {
      email, phone: phone || null, org_name: orgName, contact_name: contactName,
      inn: inn || null, selected_plan: selectedPlan,
      promo_code: promoApplied ? promoCode.trim().toUpperCase() : null,
      ref_code: refCode || null,
      utm_source: utm.utm_source || null,
      utm_medium: utm.utm_medium || null,
      utm_campaign: utm.utm_campaign || null,
      utm_term: utm.utm_term || null,
      utm_content: utm.utm_content || null,
      page_url: utm.page_url || (typeof window !== 'undefined' ? window.location.href : null),
      referrer: utm.referrer || (typeof document !== 'undefined' ? document.referrer || null : null),
      ...extra,
    };
  };

  const logAttempt = async (
    step: 'submitted' | 'success' | 'failed',
    extra: Record<string, any> = {},
    attemptId?: string | null,
  ): Promise<string | null> => {
    try {
      const body = { step, attempt_id: attemptId || undefined, ...buildAttemptPayload(extra) };
      const { data, error } = await supabase.functions.invoke('log-registration-attempt', { body });
      if (error) { console.warn('logAttempt error:', error); return attemptId || null; }
      return (data as any)?.attempt_id || attemptId || null;
    } catch (e) {
      console.warn('logAttempt exception:', e);
      return attemptId || null;
    }
  };

  const beaconLogFailure = (errorMessage: string, attemptId?: string | null) => {
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/log-registration-attempt`;
      const body = JSON.stringify({
        step: 'failed', attempt_id: attemptId || undefined, error_message: errorMessage,
        ...buildAttemptPayload(),
      });
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon?.(url, blob);
    } catch (e) { console.warn('beaconLogFailure failed:', e); }
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

    // Step 1: log submission attempt before doing anything risky
    const attemptId = await logAttempt('submitted');

    // Setup safety net: if user closes tab during submit, log a failure via beacon
    const unloadHandler = () => beaconLogFailure('Пользователь закрыл вкладку во время регистрации', attemptId);
    window.addEventListener('beforeunload', unloadHandler);

    try {
      const { data: regData, error: regError } = await supabase.functions.invoke('register-organization', {
        body: {
          email, password, full_name: contactName,
          org_name: orgName, phone: phone || null, inn: inn || null,
          kpp: kpp || null, ogrn: ogrn || null,
          legal_address: address || null, director_name: directorName || null,
          subscription_plan: selectedPlan,
          promo_code: promoApplied ? promoCode.trim().toUpperCase() : null,
        },
      });
      if (regError) throw regError;
      if ((regData as any)?.error) throw new Error((regData as any).error);

      const orgId = (regData as any)?.organization_id;
      const userId = (regData as any)?.user_id;

      // Sign in with the just-created credentials
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      const refCode = getRefCode();
      if (refCode && orgId) { await supabase.rpc('register_referral', { p_ref_code: refCode, p_organization_id: orgId }); clearRefCode(); }
      if (promoApplied && promoCode) { await supabase.rpc('increment_promo_usage' as any, { p_code: promoCode.trim().toUpperCase() }); }

      if (userId) {
        let confirmedRole = await refreshUserRole(userId);
        for (let i = 0; i < 3 && confirmedRole !== 'organization'; i++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          confirmedRole = await refreshUserRole(userId);
        }
      }

      try {
        const telegramMessage = `🏢 <b>Новая организация зарегистрирована!</b>\n\n<b>Название:</b> ${orgName}\n<b>Контактное лицо:</b> ${contactName || "—"}\n<b>Email:</b> ${email}\n<b>Телефон:</b> ${phone || "—"}\n<b>ИНН:</b> ${inn || "—"}\n<b>Тариф:</b> ${selectedPlan}${promoCode ? `\n<b>Промокод:</b> ${promoCode}` : ""}`;
        await supabase.functions.invoke("send-telegram-notification", { body: { message: telegramMessage } });
      } catch (tgErr) { console.error("Telegram notification error:", tgErr); }

      try { if (orgId) await supabase.functions.invoke("seed-welcome-course", { body: { organizationId: orgId } }); }
      catch (seedErr) { console.error("Seed welcome course error:", seedErr); }

      // Mark attempt as successful
      await logAttempt('success', { user_id: userId || null, organization_id: orgId || null }, attemptId);

      if (selectedPlan && selectedPlan !== 'free') {
        toast.success("Спасибо за регистрацию!", { description: "Ваш тариф будет подключён после оплаты. Наш менеджер свяжется с вами. Спасибо!" });
      } else {
        toast.success("Успешно!", { description: "Организация зарегистрирована. Добро пожаловать!" });
      }
      window.removeEventListener('beforeunload', unloadHandler);
      navigate("/organization", { replace: true });
    } catch (error: any) {
      let errorMessage = error.message;
      if (error.message?.includes("already registered")) errorMessage = "Пользователь с таким email уже зарегистрирован";
      // Log failed attempt — this also triggers Telegram alert from edge
      await logAttempt('failed', { error_message: errorMessage }, attemptId);
      window.removeEventListener('beforeunload', unloadHandler);
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
