import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan, type PlanInfo } from "@/constants/subscriptionPlans";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { differenceInDays, format } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";

export const PLAN_ORDER: SubscriptionPlan[] = ['free', 'start', 'standard', 'professional', 'maximum'];

export const planGradients: Record<SubscriptionPlan, string> = {
  free: "from-muted to-muted/50",
  start: "from-blue-500/10 to-blue-600/5",
  standard: "from-emerald-500/10 to-emerald-600/5",
  professional: "from-amber-500/10 to-amber-600/5",
  maximum: "from-purple-500/10 to-purple-600/5",
};

export const planAccents: Record<SubscriptionPlan, string> = {
  free: "text-muted-foreground",
  start: "text-blue-500",
  standard: "text-emerald-500",
  professional: "text-amber-500",
  maximum: "text-purple-500",
};

export const planBorders: Record<SubscriptionPlan, string> = {
  free: "border-border",
  start: "border-blue-500/30",
  standard: "border-emerald-500/30",
  professional: "border-amber-500/30",
  maximum: "border-purple-500/30",
};

export interface FeatureHighlight {
  icon: React.ReactNode;
  title: string;
  description: string;
  minPlan: SubscriptionPlan;
  link?: string;
  categoryKey?: string;
}

export interface FeatureRow {
  label: string;
  key?: keyof PlanInfo['limits'];
  link?: string;
  format?: (v: any) => any;
  getValue?: (plan: PlanInfo) => any;
}

export const featureRows: FeatureRow[] = [
  { label: "Курсы", key: "maxCourses", format: (v: number) => v === -1 ? "∞" : String(v) },
  { label: "Ученики", key: "maxStudents", format: (v: number) => v === -1 ? "∞" : String(v) },
  { label: "Настройки курсов", key: "courseSettings", format: (v: boolean) => v, link: "/feature/course-settings" },
  { label: "Чек-лист документов", key: "documentChecklist", format: (v: boolean) => v, link: "/feature/document-checklist" },
  { label: "Видео-идентификация", key: "videoIdentification", format: (v: boolean) => v, link: "/feature/video-id" },
  { label: "Брендирование", key: "branding", format: (v: boolean) => v, link: "/feature/branding" },
  { label: "ИИ-генерация", key: "aiEnabled", format: (v: boolean) => v, link: "/feature/ai-courses" },
  { label: "ИИ-озвучка", key: "aiAudioEnabled", format: (v: boolean) => v },
  { label: "Видеосервис+", key: "kinescopeEnabled", format: (v: boolean) => v, link: "/feature/video-service" },
  { label: "Видео >2 ГБ", key: "videoServicePlus", format: (v: boolean) => v },
  { label: "3D-тренажёры", key: "trainersEnabled", format: (v: boolean) => v },
  { label: "Компании", getValue: (plan) => plan.enabledCategories.includes('companies'), format: (v: boolean) => v },
  { label: "Журналы", getValue: (plan) => plan.enabledCategories.includes('journals'), format: (v: boolean) => v },
  { label: "Документооборот", getValue: (plan) => plan.enabledCategories.includes('documents'), format: (v: boolean) => v, link: "/feature/documents" },
  { label: "Охрана труда", getValue: (plan) => plan.enabledCategories.includes('labor_safety'), format: (v: boolean) => v, link: "/feature/labor-safety" },
  { label: "ФИС ФРДО", getValue: (plan) => plan.enabledCategories.includes('frdo'), format: (v: boolean) => v, link: "/feature/frdo" },
  { label: "Магазин курсов", getValue: (plan) => plan.enabledCategories.includes('services'), format: (v: boolean) => v, link: "/feature/course-store" },
  { label: "Хранилище файлов", getValue: (plan) => plan.enabledCategories.includes('library'), format: (v: boolean) => v },
  { label: "Вебинары", getValue: (plan) => plan.enabledCategories.includes('webinars'), format: (v: boolean) => v },
];

export function useSubscriptionTab() {
  const d = useOrgDashboard();
  const organizationId = d.organizationId;
  const subscriptionLimits = d.subscriptionLimits;
  const nav = useNavigate();

  const [paidUntil, setPaidUntil] = useState<string | null>(null);
  const [tariffCustomLabel, setTariffCustomLabel] = useState<string | null>(null);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [payingOnline, setPayingOnline] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<{ requested_plan: string; created_at: string } | null>(null);
  const [orgContact, setOrgContact] = useState<{ email?: string; phone?: string; contact_name?: string }>({});
  const [customEnabledCategories, setCustomEnabledCategories] = useState<string[]>([]);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);

  const currentPlan = subscriptionLimits.plan;
  const currentPlanInfo = SUBSCRIPTION_PLANS[currentPlan];
  const currentPlanIndex = PLAN_ORDER.indexOf(currentPlan);

  useEffect(() => {
    if (!organizationId) return;
    const fetchOrgDetails = async () => {
      const [orgRes, reqRes] = await Promise.all([
        supabase.from("organizations").select("paid_until, tariff_custom_label, email, phone, contact_name, custom_enabled_categories").eq("id", organizationId).single(),
        supabase.from("subscription_requests" as any).select("requested_plan, created_at").eq("organization_id", organizationId).eq("status", "pending").order("created_at", { ascending: false }).limit(1),
      ]);
      if (orgRes.data?.paid_until) setPaidUntil(orgRes.data.paid_until);
      if ((orgRes.data as any)?.tariff_custom_label) setTariffCustomLabel((orgRes.data as any).tariff_custom_label);
      setOrgContact({ email: orgRes.data?.email, phone: orgRes.data?.phone, contact_name: orgRes.data?.contact_name });
      setCustomEnabledCategories((orgRes.data as any)?.custom_enabled_categories || []);
      if ((reqRes.data as any)?.[0]) setPendingRequest((reqRes.data as any)[0]);
    };
    fetchOrgDetails();
  }, [organizationId]);

  const daysRemaining = useMemo(() => {
    if (!paidUntil) return null;
    return differenceInDays(new Date(paidUntil), new Date());
  }, [paidUntil]);

  const urgencyColor = useMemo(() => {
    if (daysRemaining === null) return "text-muted-foreground";
    if (daysRemaining <= 7) return "text-destructive";
    if (daysRemaining <= 30) return "text-amber-500";
    return "text-emerald-500";
  }, [daysRemaining]);

  const handleRequestUpgrade = async () => {
    if (!organizationId || !selectedPlan) return;
    setSubmitting(true);
    const { error } = await supabase.from("subscription_requests" as any).insert({
      organization_id: organizationId,
      current_plan: currentPlan,
      requested_plan: selectedPlan,
      message: message || null,
    } as any);

    if (error) {
      toast.error("Ошибка", { description: error.message });
    } else {
      toast.success("Заявка отправлена", { description: "Мы свяжемся с вами для оформления перехода на новый тариф" });
      setPendingRequest({ requested_plan: selectedPlan, created_at: new Date().toISOString() });
      setShowUpgradeDialog(false);
      setMessage("");
      setSelectedPlan(null);

      const planInfo = SUBSCRIPTION_PLANS[selectedPlan];
      const orgDisplayName = d.organizationName || organizationId;
      try {
        await supabase.functions.invoke("send-telegram-notification", {
          body: {
            message: `📋 <b>Заявка на повышение тарифа</b>\n\n` +
              `🏢 Организация: ${orgDisplayName}\n` +
              (orgContact.contact_name ? `👤 Контакт: ${orgContact.contact_name}\n` : '') +
              (orgContact.email ? `📧 Email: ${orgContact.email}\n` : '') +
              (orgContact.phone ? `📞 Телефон: ${orgContact.phone}\n` : '') +
              `📊 Текущий тариф: ${SUBSCRIPTION_PLANS[currentPlan]?.name || currentPlan}\n` +
              `🆕 Запрошенный тариф: ${planInfo?.name || selectedPlan}\n` +
              `💰 Стоимость: ${planInfo?.price?.toLocaleString() || '?'} ₽/мес\n` +
              (message ? `💬 Комментарий: ${message}\n` : '') +
              `\n🕐 ${new Date().toLocaleString('ru-RU')}`,
          },
        });
      } catch (tgErr) {
        console.error("Telegram notification failed:", tgErr);
      }
    }
    setSubmitting(false);
  };

  const handleGenerateInvoice = async () => {
    if (!organizationId) return;
    setGeneratingInvoice(true);
    try {
      const { data: orgData } = await supabase
        .from("organizations")
        .select("custom_price, custom_discount")
        .eq("id", organizationId)
        .single();

      const customPrice = (orgData as any)?.custom_price as number | null;
      const customDiscount = (orgData as any)?.custom_discount as number | null;

      const year = new Date().getFullYear();
      const { count } = await supabase
        .from("subscription_invoices")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId);

      const invoiceNum = `СЧ-${year}/${String((count || 0) + 1).padStart(4, "0")}`;
      const basePrice = customPrice ?? currentPlanInfo.price ?? 1990;
      const discount = customDiscount ?? 0;
      const amount = Math.max(0, basePrice - discount);

      const { data: invoice, error: err } = await supabase
        .from("subscription_invoices")
        .insert({
          organization_id: organizationId,
          invoice_number: invoiceNum,
          plan: currentPlan,
          amount,
          period_months: 1,
        } as any)
        .select("id")
        .single();

      if (err) throw err;

      await supabase.from("admin_notifications").insert({
        type: "invoice",
        title: `Новый счёт: ${invoiceNum}`,
        message: `Организация «${d.organizationName || "—"}» сформировала счёт на ${amount.toLocaleString("ru-RU")} ₽ (план: ${currentPlanInfo.name})`,
        related_entity_id: organizationId,
        metadata: { invoice_id: (invoice as any).id, organization_id: organizationId, amount, plan: currentPlan },
      } as any);

      nav(`/invoice/${(invoice as any).id}`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setGeneratingInvoice(false);
    }
  };

  const handlePayOnline = async () => {
    if (!organizationId || !selectedPlan) return;
    setPayingOnline(true);
    try {
      const { data, error } = await supabase.functions.invoke("tbank-init-subscription", {
        body: {
          organization_id: organizationId,
          plan: selectedPlan,
          period_months: 1,
          email: orgContact.email || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error("Не удалось получить ссылку на оплату");
      }
    } catch (e: any) {
      toast.error("Ошибка оплаты", { description: e.message });
    } finally {
      setPayingOnline(false);
    }
  };

  const coursesPercent = subscriptionLimits.limits.maxCourses === -1 ? 0 :
    Math.round((subscriptionLimits.usage.coursesCount / subscriptionLimits.limits.maxCourses) * 100);
  const studentsPercent = subscriptionLimits.limits.maxStudents === -1 ? 0 :
    Math.round((subscriptionLimits.usage.studentsCount / subscriptionLimits.limits.maxStudents) * 100);
  const trainedPercent = subscriptionLimits.limits.maxTrainedPerMonth === -1 ? 0 :
    Math.round(((subscriptionLimits.usage.trainedThisMonth || 0) / subscriptionLimits.limits.maxTrainedPerMonth) * 100);

  return {
    subscriptionLimits,
    currentPlan,
    currentPlanInfo,
    currentPlanIndex,
    paidUntil,
    tariffCustomLabel,
    daysRemaining,
    urgencyColor,
    pendingRequest,
    customEnabledCategories,
    showUpgradeDialog,
    setShowUpgradeDialog,
    selectedPlan,
    setSelectedPlan,
    message,
    setMessage,
    submitting,
    payingOnline,
    generatingInvoice,
    coursesPercent,
    studentsPercent,
    trainedPercent,
    handleRequestUpgrade,
    handleGenerateInvoice,
    handlePayOnline,
  };
}
