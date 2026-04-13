import { useState, useEffect, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, FileText, CreditCard, Handshake, HelpCircle, User, LogOut, Sparkles, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrgDashboardProvider, useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { OrgDashboardFooter } from "@/components/organization/OrgDashboardFooter";
import { OrgSidebar } from "@/components/organization/OrgSidebar";
import { OrgNotifications } from "@/components/organization/OrgNotifications";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { differenceInDays } from "date-fns";
import defaultCoverImg from "@/assets/default-org-cover.jpg";

const LazyDocumentsTab = lazy(() => import("@/components/organization/tabs/DocumentsTab").then(m => ({ default: m.DocumentsTab })));

function getUserInitials(email?: string | null, name?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0][0]?.toUpperCase() || "?";
  }
  if (email) return email[0]?.toUpperCase() || "?";
  return "?";
}

function DocumentsPageInner({ organizationId }: { organizationId: string }) {
  const navigate = useNavigate();
  const d = useOrgDashboard();

  const organizationName = d.organizationName;
  const customName = d.branding.brandingSettings.customName;
  const customSubtitle = d.branding.brandingSettings.customSubtitle;
  const logoUrl = d.branding.brandingSettings.logoUrl;
  const coverUrl = d.branding.brandingSettings.coverUrl;
  const coverPosition = d.branding.brandingSettings.coverPosition;
  const displayCover = coverUrl || defaultCoverImg;

  const [paidUntil, setPaidUntil] = useState<string | null>(null);
  const planName = d.subscriptionLimits?.plan;

  useEffect(() => {
    if (!organizationId) return;
    supabase.from("organizations").select("paid_until").eq("id", organizationId).single()
      .then(({ data }) => { if (data?.paid_until) setPaidUntil(data.paid_until); });
  }, [organizationId]);

  const daysRemaining = paidUntil ? Math.max(0, differenceInDays(new Date(paidUntil), new Date())) : null;
  const planLabel = planName === 'free' ? 'Бесплатный' : planName === 'start' ? 'Старт' : planName === 'standard' ? 'Стандарт' : planName === 'professional' ? 'Профессиональный' : planName === 'maximum' ? 'Максимальный' : 'Тариф';

  const userEmail = d.user?.email;
  const initials = getUserInitials(userEmail);

  return (
    <div className="min-h-screen bg-background flex">
      <OrgSidebar />
      <main className="flex-1 flex flex-col min-w-0 lg:ml-[88px]">
      {/* Sticky header */}
      <header className="sticky top-0 z-30 bg-card border-b border-border">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 lg:px-6 h-14">
          {/* Left: Back + Logo + Org name */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="rounded-xl hover:bg-primary/10 hover:text-primary transition-all duration-200" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2.5">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-8 h-8 object-contain rounded-lg" />
              ) : (
                <SigmaLogo size="sm" showText={false} />
              )}
              <span className="font-display font-bold text-sm hidden sm:inline">{customName || organizationName || "СИНТАГМА"}</span>
            </div>
          </div>

          {/* Right: Tariff + Partner + Notifications + Profile */}
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <button
              onClick={() => navigate("/organization")}
              className="hidden sm:flex items-center gap-2 px-3.5 py-2 bg-primary/10 rounded-full border border-primary/20 hover:bg-primary/20 hover:border-primary/40 hover:shadow-md hover:shadow-primary/10 transition-all duration-200"
            >
              <CreditCard className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-primary">
                {planLabel}
                {daysRemaining !== null && planName !== 'free' && (
                  <span className="ml-1 text-primary/70">— {daysRemaining} дн.</span>
                )}
              </span>
            </button>

            <Button
              variant="ghost"
              size="sm"
              className="hidden lg:flex rounded-full gap-1.5 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 h-9 px-3 transition-all duration-200"
              onClick={() => navigate("/partner")}
            >
              <Handshake className="w-4.5 h-4.5" />
              Партнёрам
            </Button>

            {organizationId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="hover:scale-105 transition-transform">
                    <OrgNotifications organizationId={organizationId} />
                  </div>
                </TooltipTrigger>
                <TooltipContent>Уведомления</TooltipContent>
              </Tooltip>
            )}

            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary hover:bg-primary/25 hover:shadow-md hover:shadow-primary/15 hover:scale-110 transition-all duration-200 font-bold text-sm">
                      {initials}
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Профиль</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-52 rounded-xl">
                <DropdownMenuItem onClick={() => navigate("/organization/profile")} className="rounded-lg gap-2.5 py-2.5">
                  <User className="w-4 h-4" />
                  Профиль
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/organization/settings")} className="rounded-lg gap-2.5 py-2.5">
                  <Settings className="w-4 h-4" />
                  Настройки
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/organization/documents")} className="rounded-lg gap-2.5 py-2.5">
                  <FileText className="w-4 h-4" />
                  Документы
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/whats-new")} className="rounded-lg gap-2.5 py-2.5">
                  <Sparkles className="w-4 h-4" />
                  Что нового?
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.open("https://t.me/sintagma_support", "_blank")} className="rounded-lg gap-2.5 py-2.5">
                  <HelpCircle className="w-4 h-4" />
                  Помощь
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={d.handleLogout} className="rounded-lg gap-2.5 py-2.5 text-destructive">
                  <LogOut className="w-4 h-4" />
                  Выйти
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Hero banner */}
        <div className="relative w-full h-36 lg:h-48 overflow-hidden">
          <img
            src={displayCover}
            alt="Обложка организации"
            className="w-full h-full"
            width={1920}
            height={512}
            style={{
              objectFit: coverUrl ? (coverPosition === 'contain' ? 'contain' : 'cover') : 'cover',
              objectPosition:
                coverPosition === 'top' ? 'center top'
                : coverPosition === 'bottom' ? 'center bottom'
                : 'center center',
              backgroundColor: 'hsl(var(--muted))'
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

          <div className="absolute bottom-4 left-6 flex items-end gap-3">
            {logoUrl && (
              <img src={logoUrl} alt="" className="w-12 h-12 rounded-xl object-contain bg-white/90 p-1 shadow-md" />
            )}
            <div className="text-white">
              {!coverUrl && <span className="text-xs font-medium opacity-70 block mb-0.5">Онлайн-обучение</span>}
              <h2 className="text-lg lg:text-2xl font-bold drop-shadow-md leading-tight">{customName || organizationName}</h2>
              {customSubtitle && <p className="text-xs lg:text-sm opacity-80 mt-0.5">{customSubtitle}</p>}
            </div>
          </div>
        </div>

        {/* Sub-header: page title */}
        <div className="flex items-center justify-between px-4 lg:px-6 h-12 border-t border-border/50 bg-card/95 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <FileText className="w-4.5 h-4.5 text-primary" />
            <h1 className="font-display text-base font-semibold text-foreground/80">Документы</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 max-w-[1400px] w-full mx-auto px-4 lg:px-6 py-6">
        <Suspense fallback={<div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>}>
          <LazyDocumentsTab organizationId={organizationId} organizationName={customName || organizationName || ""} isOrdersEnabled={true} />
        </Suspense>
      </div>

      {/* Footer */}
      <OrgDashboardFooter />
      </main>
    </div>
  );
}

export default function OrganizationDocuments() {
  const { user } = useAuth();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: prof } = await supabase.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
      let orgId = prof?.organization_id || (await supabase.rpc("current_organization_id")).data as string | null;
      if (!orgId) {
        const { data: firstOrg } = await supabase.from("organizations").select("id").limit(1).maybeSingle();
        orgId = firstOrg?.id || null;
      }
      setOrganizationId(orgId);
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  if (!organizationId) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Организация не найдена</div>;
  }

  return (
    <OrgDashboardProvider>
      <DocumentsPageInner organizationId={organizationId} />
    </OrgDashboardProvider>
  );
}
