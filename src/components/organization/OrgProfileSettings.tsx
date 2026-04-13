import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { SUBSCRIPTION_PLANS } from "@/constants/subscriptionPlans";
import {
  Palette, LayoutGrid, Save, Settings,
  ChevronRight, Loader2, Upload,
  X, ExternalLink, Image, Eye, Lock, ArrowUpRight, LogIn, KeyRound,
  Trophy, MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LoginBrandingSettings } from "@/components/organization/LoginBrandingSettings";
import { OrgCredentialsSettings } from "@/components/organization/OrgCredentialsSettings";
import { ThemePersonalization } from "@/components/ui/ThemePersonalization";

interface OrgProfileSettingsProps {
  organizationId: string;
  userId: string;
}

interface BrandingSettings {
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string;
  coverUrl: string;
  coverPosition: 'cover' | 'contain' | 'center' | 'top' | 'bottom';
  showOrgName: boolean;
  customName: string;
  customSubtitle: string;
}



interface StudentDashboardSettings {
  showAchievements: boolean;
  showAiChat: boolean;
  catalogMode: "catalog" | "assigned";
  [key: string]: boolean | string;
}

const DEFAULT_BRANDING: BrandingSettings = {
  primaryColor: '#0d9488',
  secondaryColor: '#8b5cf6',
  logoUrl: '',
  coverUrl: '',
  coverPosition: 'cover',
  showOrgName: true,
  customName: '',
  customSubtitle: '',
};



const DEFAULT_STUDENT: StudentDashboardSettings = {
  showAchievements: false,
  showAiChat: false,
  catalogMode: "catalog",
};

export function OrgProfileSettings({ organizationId, userId }: OrgProfileSettingsProps) {
  const navigate = useNavigate();
  const { plan } = useSubscriptionLimits(organizationId);
  const hasBranding = SUBSCRIPTION_PLANS[plan]?.limits?.branding ?? false;

  const [organizationName, setOrganizationName] = useState("");
  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  const [brandingSettings, setBrandingSettings] = useState<BrandingSettings>(DEFAULT_BRANDING);
  
  const [studentDashboardSettings, setStudentDashboardSettings] = useState<StudentDashboardSettings>(DEFAULT_STUDENT);
  const [isSavingBranding, setIsSavingBranding] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  useEffect(() => {
    loadOrgData();
  }, [organizationId]);

  const loadOrgData = async () => {
    const { data: org } = await supabase
      .from("organizations")
      .select("name, branding, student_dashboard_settings")
      .eq("id", organizationId)
      .single();
    if (!org) return;

    setOrganizationName(org.name || "");
    
    if (org.branding) {
      const b = org.branding as any;
      setBrandingSettings({
        primaryColor: b.primaryColor || '#0d9488',
        secondaryColor: b.secondaryColor || '#8b5cf6',
        logoUrl: b.logoUrl || '',
        coverUrl: b.coverUrl || '',
        coverPosition: b.coverPosition || 'cover',
        showOrgName: b.showOrgName ?? true,
        customName: b.customName || '',
        customSubtitle: b.customSubtitle || '',
      });
    }
    


    
    if (org.student_dashboard_settings) {
      const s = org.student_dashboard_settings as any;
      setStudentDashboardSettings({
        showAchievements: s.showAchievements ?? false,
        showAiChat: s.showAiChat ?? false,
        catalogMode: s.catalogMode || "catalog",
      });
    }
  };



  const handleSaveStudentSettings = async () => {
    setIsSavingSettings(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ student_dashboard_settings: JSON.parse(JSON.stringify(studentDashboardSettings)) })
        .eq('id', organizationId);
      if (error) throw error;
      toast.success('Настройки сохранены');
    } catch (error) {
      toast.error('Ошибка сохранения настроек');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSaveBranding = async () => {
    setIsSavingBranding(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ branding: brandingSettings as any })
        .eq('id', organizationId);
      if (error) throw error;
      toast.success('Брендирование сохранено');
    } catch (error) {
      toast.error('Ошибка сохранения');
    } finally {
      setIsSavingBranding(false);
    }
  };

  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'cover' | 'logo'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const setter = type === 'cover' ? setIsUploadingCover : setIsUploadingLogo;
    setter(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `${organizationId}/${type}_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("organization-assets")
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from("organization-assets")
        .getPublicUrl(filePath);
      const key = type === 'cover' ? 'coverUrl' : 'logoUrl';
      setBrandingSettings(prev => ({ ...prev, [key]: urlData.publicUrl }));
    } catch (err: any) {
      toast.error("Ошибка загрузки: " + err.message);
    } finally {
      setter(false);
      if (e.target) e.target.value = "";
    }
  };

  const previewStudentDashboard = () => {
    window.open("/student", "_blank");
  };



  const LockedOverlay = ({ requiredPlan = "Старт", features = [] }: { requiredPlan?: string; features?: string[] }) => (
    <div className="absolute inset-0 z-10 bg-background/60 backdrop-blur-[2px] rounded-xl lg:rounded-2xl flex items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-center px-4 max-w-sm">
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
          <Lock className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">Доступно от тарифа «{requiredPlan}»</p>
        {features.length > 0 && (
          <ul className="text-left space-y-1 mt-1">
            {features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="text-primary mt-0.5">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        )}
        <Button
          size="sm"
          variant="outline"
          className="rounded-xl gap-1.5 text-xs mt-1"
          onClick={() => navigate('/organization?tab=subscription')}
        >
          <ArrowUpRight className="w-3.5 h-3.5" />
          Сменить тариф
        </Button>
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl space-y-4 lg:space-y-6">
      {/* Theme Settings */}
      <details className="bg-card rounded-xl lg:rounded-2xl border border-border group">
        <summary className="p-4 lg:p-6 cursor-pointer list-none flex items-center justify-between">
          <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2">
            <Palette className="w-4 h-4 lg:w-5 lg:h-5" />
            Тема оформления
          </h3>
          <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-4 lg:px-6 pb-4 lg:pb-6">
          <ThemePersonalization
            isDarkMode={isDarkMode}
            onToggleDark={(dark) => {
              setIsDarkMode(dark);
              if (dark) {
                document.documentElement.classList.add('dark');
                localStorage.setItem('theme', 'dark');
              } else {
                document.documentElement.classList.remove('dark');
                localStorage.setItem('theme', 'light');
              }
            }}
          />
        </div>
      </details>



      {/* Branding Settings */}
      <details className="bg-card rounded-2xl border border-border group">
        <summary className="p-6 cursor-pointer list-none flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg flex items-center gap-2">
            <Image className="w-5 h-5" />
            Брендирование
          </h3>
          <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-6 pb-6 relative">
          {!hasBranding && <LockedOverlay requiredPlan="Стандарт" features={[
            "Обложка и логотип вашей организации",
            "Фирменные цвета в интерфейсе",
            "Кастомное название в сайдбаре",
          ]} />}
          <p className="text-sm text-muted-foreground mb-4">
            Настройте внешний вид кабинета с вашим фирменным стилем
          </p>
          
          <div className="space-y-6">
            {/* Cover Image */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Обложка организации</Label>
              <p className="text-sm text-muted-foreground mb-3">
                Изображение отображается в шапке личного кабинета (рекомендуется 1920×400 px)
              </p>
              <div className="relative">
                {brandingSettings.coverUrl ? (
                  <div className="relative rounded-xl overflow-hidden border border-border">
                    <img 
                      src={brandingSettings.coverUrl} 
                      alt="Обложка" 
                      className="w-full h-32"
                      style={{
                        objectFit: brandingSettings.coverPosition === 'contain' ? 'contain' : 'cover',
                        objectPosition: 
                          brandingSettings.coverPosition === 'top' ? 'center top' 
                          : brandingSettings.coverPosition === 'bottom' ? 'center bottom' 
                          : brandingSettings.coverPosition === 'contain' ? 'center center'
                          : 'center center',
                        backgroundColor: 'hsl(var(--muted))'
                      }}
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <label className="cursor-pointer">
                        <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'cover')} />
                        <Button size="sm" variant="secondary" className="rounded-lg pointer-events-none">
                          Заменить
                        </Button>
                      </label>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="rounded-lg"
                        onClick={() => setBrandingSettings(prev => ({ ...prev, coverUrl: '' }))}
                      >
                        Удалить
                      </Button>
                    </div>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'cover')} />
                    <div className="border-2 border-dashed border-border rounded-xl h-32 flex flex-col items-center justify-center gap-2 hover:border-primary/50 hover:bg-primary/5 transition-colors">
                      {isUploadingCover ? (
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <Upload className="w-6 h-6 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Загрузить обложку</span>
                        </>
                      )}
                    </div>
                  </label>
                )}
                
                {/* Cover Position Selector */}
                {brandingSettings.coverUrl && (
                  <div className="mt-3">
                    <Label className="text-xs text-muted-foreground mb-2 block">Позиционирование обложки</Label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: 'cover' as const, label: 'Заполнить' },
                        { value: 'contain' as const, label: 'Вписать' },
                        { value: 'center' as const, label: 'По центру' },
                        { value: 'top' as const, label: 'Сверху' },
                        { value: 'bottom' as const, label: 'Снизу' }
                      ].map(pos => (
                        <Button
                          key={pos.value}
                          size="sm"
                          variant={brandingSettings.coverPosition === pos.value ? 'default' : 'outline'}
                          className="rounded-lg text-xs"
                          onClick={() => setBrandingSettings(prev => ({ ...prev, coverPosition: pos.value }))}
                        >
                          {pos.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Logo */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Логотип организации</Label>
              <p className="text-sm text-muted-foreground mb-3">
                Отображается вместо стандартного логотипа (рекомендуется квадрат или прозрачный PNG)
              </p>
              <div className="flex items-start gap-4">
                {brandingSettings.logoUrl ? (
                  <div className="relative">
                    <img src={brandingSettings.logoUrl} alt="Логотип" className="w-20 h-20 object-contain rounded-xl border border-border bg-background p-2" />
                    <button
                      onClick={() => setBrandingSettings(prev => ({ ...prev, logoUrl: '' }))}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center hover:bg-destructive/80"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'logo')} />
                    <div className="w-20 h-20 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-1 hover:border-primary/50 hover:bg-primary/5 transition-colors">
                      {isUploadingLogo ? (
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <Upload className="w-5 h-5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Логотип</span>
                        </>
                      )}
                    </div>
                  </label>
                )}
                <div className="flex-1 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Показывать название</p>
                      <p className="text-xs text-muted-foreground">Отображать название организации рядом с логотипом</p>
                    </div>
                    <button
                      onClick={() => setBrandingSettings(prev => ({ ...prev, showOrgName: !prev.showOrgName }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${brandingSettings.showOrgName ? 'bg-primary' : 'bg-muted'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${brandingSettings.showOrgName ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Custom Organization Name */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Кастомное название</Label>
              <p className="text-sm text-muted-foreground mb-3">
                Отображается вместо "СИНТАГМА" в первой строке сайдбара
              </p>
              <Input
                value={brandingSettings.customName || ''}
                onChange={e => setBrandingSettings(prev => ({ ...prev, customName: e.target.value }))}
                className="rounded-xl"
                placeholder="Введите название для отображения..."
              />
            </div>

            {/* Custom Subtitle */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Подзаголовок</Label>
              <p className="text-sm text-muted-foreground mb-3">
                Отображается во второй строке под названием (оставьте пустым для использования названия организации)
              </p>
              <Input
                value={brandingSettings.customSubtitle || ''}
                onChange={e => setBrandingSettings(prev => ({ ...prev, customSubtitle: e.target.value }))}
                className="rounded-xl"
                placeholder="Введите подзаголовок..."
              />
            </div>

            {/* Colors */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium mb-2 block">Основной цвет</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={brandingSettings.primaryColor}
                    onChange={e => setBrandingSettings(prev => ({ ...prev, primaryColor: e.target.value }))}
                    className="w-10 h-10 rounded-lg cursor-pointer border border-border"
                  />
                  <Input
                    value={brandingSettings.primaryColor}
                    onChange={e => setBrandingSettings(prev => ({ ...prev, primaryColor: e.target.value }))}
                    className="rounded-xl flex-1"
                    placeholder="#0d9488"
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block">Дополнительный цвет</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={brandingSettings.secondaryColor}
                    onChange={e => setBrandingSettings(prev => ({ ...prev, secondaryColor: e.target.value }))}
                    className="w-10 h-10 rounded-lg cursor-pointer border border-border"
                  />
                  <Input
                    value={brandingSettings.secondaryColor}
                    onChange={e => setBrandingSettings(prev => ({ ...prev, secondaryColor: e.target.value }))}
                    className="rounded-xl flex-1"
                    placeholder="#8b5cf6"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-border flex gap-3">
            <Button className="btn-gradient rounded-xl gap-2" onClick={handleSaveBranding} disabled={isSavingBranding}>
              {isSavingBranding ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Сохранение...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Сохранить брендирование
                </>
              )}
            </Button>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" className="rounded-xl gap-2" onClick={previewStudentDashboard}>
                    <Eye className="w-4 h-4" />
                    Предпросмотр
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Предпросмотр кабинета ученика</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </details>

      {/* Login Page Branding */}
      <details className="bg-card rounded-2xl border border-border group">
        <summary className="p-6 cursor-pointer list-none flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg flex items-center gap-2">
            <LogIn className="w-5 h-5" />
            Брендирование страницы входа
          </h3>
          <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-6 pb-6 relative">
          {!hasBranding && <LockedOverlay requiredPlan="Стандарт" features={[
            "Уникальная ссылка для входа учеников",
            "Логотип и цвета на странице авторизации",
          ]} />}
          <p className="text-sm text-muted-foreground mb-4">
            Создайте индивидуальную страницу входа с вашим брендом и уникальной ссылкой
          </p>
          <LoginBrandingSettings 
            organizationId={organizationId} 
            organizationName={organizationName}
            userId={userId}
          />
        </div>
      </details>

      {/* Student Dashboard Settings */}
      <details className="bg-card rounded-2xl border border-border group">
        <summary className="p-6 cursor-pointer list-none flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Настройки личного кабинета ученика
          </h3>
          <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-6 pb-6 relative">
          {!hasBranding && <LockedOverlay requiredPlan="Стандарт" features={[
            "Выбор разделов: хранилище, достижения, ИИ-чат",
            "Кастомизация под вашу программу обучения",
          ]} />}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              Настройте, какие разделы будут отображаться в личном кабинете учеников
            </p>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={previewStudentDashboard}>
                    <ExternalLink className="w-4 h-4" />
                    Просмотр кабинета
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Предпросмотр личного кабинета ученика</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="space-y-4">
            {/* Achievements */}
            <div className="flex items-center justify-between py-3 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sigma-orange/10 flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-sigma-orange" />
                </div>
                <div>
                  <p className="font-medium">Достижения</p>
                  <p className="text-sm text-muted-foreground">Раздел с наградами и достижениями</p>
                </div>
              </div>
              <button
                onClick={() => setStudentDashboardSettings(prev => ({ ...prev, showAchievements: !prev.showAchievements }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${studentDashboardSettings.showAchievements ? 'bg-primary' : 'bg-muted'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${studentDashboardSettings.showAchievements ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            
            {/* AI Chat */}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sigma-cyan/10 flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-sigma-cyan" />
                </div>
                <div>
                  <p className="font-medium">ИИ-помощник</p>
                  <p className="text-sm text-muted-foreground">Чат с ИИ для помощи в обучении</p>
                </div>
              </div>
              <button
                onClick={() => setStudentDashboardSettings(prev => ({ ...prev, showAiChat: !prev.showAiChat }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${studentDashboardSettings.showAiChat ? 'bg-primary' : 'bg-muted'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${studentDashboardSettings.showAiChat ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {/* Catalog Mode */}
            <div className="flex items-center justify-between py-3 border-t border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <LayoutGrid className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Начальный экран ученика</p>
                  <p className="text-sm text-muted-foreground">Что показывать первым при входе</p>
                </div>
              </div>
              <div className="flex gap-1 bg-muted rounded-lg p-0.5">
                <button
                  onClick={() => setStudentDashboardSettings(prev => ({ ...prev, catalogMode: "catalog" }))}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${studentDashboardSettings.catalogMode === "catalog" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Каталог
                </button>
                <button
                  onClick={() => setStudentDashboardSettings(prev => ({ ...prev, catalogMode: "assigned" }))}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${studentDashboardSettings.catalogMode === "assigned" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Назначенные
                </button>
              </div>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-border">
            <Button className="btn-gradient rounded-xl gap-2" onClick={handleSaveStudentSettings} disabled={isSavingSettings}>
              {isSavingSettings ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Сохранение...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Сохранить настройки
                </>
              )}
            </Button>
          </div>
        </div>
      </details>

      {/* Organization Credentials Settings */}
      <details className="bg-card rounded-xl lg:rounded-2xl border border-border group">
        <summary className="p-4 lg:p-6 cursor-pointer list-none flex items-center justify-between">
          <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2">
            <KeyRound className="w-4 h-4 lg:w-5 lg:h-5" />
            Данные для входа
          </h3>
          <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-4 lg:px-6 pb-4 lg:pb-6">
          <p className="text-xs lg:text-sm text-muted-foreground mb-4">
            Измените логин и пароль для входа в личный кабинет организации
          </p>
          <OrgCredentialsSettings organizationId={organizationId} />
        </div>
      </details>



    </div>
  );
}
