import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { OrganizationCore } from "@/hooks/useOrganizationCore";
import { proxiedAssetUrl } from "@/utils/proxyFetch";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { SUBSCRIPTION_PLANS } from "@/constants/subscriptionPlans";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import {
  Save, Upload, X, Eye, Lock, ArrowUpRight, Image } from "lucide-react";
import { CoverLocationHint, LogoLocationHint, HintBlock } from "@/components/organization/BrandingHints";

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

const DEFAULT_BRANDING: BrandingSettings = {
  primaryColor: '#0d9488',
  secondaryColor: '#8b5cf6',
  logoUrl: '',
  coverUrl: '',
  coverPosition: 'cover',
  showOrgName: true,
  customName: '',
  customSubtitle: '' };

function brandingRecord(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Некорректные настройки брендирования');
  return value as Record<string, unknown>;
}

function editorSettings(value: unknown): BrandingSettings {
  const b = brandingRecord(value);
  return {
    primaryColor: typeof b.primaryColor === 'string' ? b.primaryColor : DEFAULT_BRANDING.primaryColor,
    secondaryColor: typeof b.secondaryColor === 'string' ? b.secondaryColor : DEFAULT_BRANDING.secondaryColor,
    logoUrl: typeof b.logoUrl === 'string' ? b.logoUrl : '',
    coverUrl: typeof b.coverUrl === 'string' ? b.coverUrl : '',
    coverPosition: ['cover', 'contain', 'center', 'top', 'bottom'].includes(String(b.coverPosition))
      ? b.coverPosition as BrandingSettings['coverPosition'] : 'cover',
    showOrgName: typeof b.showOrgName === 'boolean' ? b.showOrgName : true,
    customName: typeof b.customName === 'string' ? b.customName : '',
    customSubtitle: typeof b.customSubtitle === 'string' ? b.customSubtitle : '',
  };
}

interface Props {
  organizationId: string;
  userId: string;
}

export function ProfileBrandingTab({ organizationId, userId }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { plan } = useSubscriptionLimits(organizationId);
  const hasBranding = SUBSCRIPTION_PLANS[plan]?.limits?.branding ?? false;
  const [brandingSettings, setBrandingSettings] = useState<BrandingSettings>(DEFAULT_BRANDING);
  const [savedSettings, setSavedSettings] = useState<BrandingSettings>(DEFAULT_BRANDING);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const savingRef = useRef<number | null>(null);
  const uploadingRef = useRef(new Map<'cover' | 'logo', number>());
  const contextGenerationRef = useRef(0);
  const hasUnsavedChanges = Object.keys(DEFAULT_BRANDING).some(key =>
    brandingSettings[key as keyof BrandingSettings] !== savedSettings[key as keyof BrandingSettings],
  );

  useEffect(() => {
    const generation = ++contextGenerationRef.current;
    savingRef.current = null;
    uploadingRef.current.clear();
    setIsSaving(false);
    setIsUploadingCover(false);
    setIsUploadingLogo(false);
    setBrandingSettings(DEFAULT_BRANDING);
    setSavedSettings(DEFAULT_BRANDING);
    setIsLoading(true);
    setLoadError(false);
    const load = async () => {
      try {
        const { data: org, error } = await supabase
          .from("organizations")
          .select("branding")
          .eq("id", organizationId)
          .single();
        if (generation !== contextGenerationRef.current) return;
        if (error || !org) throw error || new Error('Организация не найдена');
        const settings = editorSettings(org.branding);
        setBrandingSettings(settings);
        setSavedSettings(settings);
      } catch {
        if (generation === contextGenerationRef.current) setLoadError(true);
      } finally {
        if (generation === contextGenerationRef.current) setIsLoading(false);
      }
    };
    void load();
    return () => { contextGenerationRef.current += 1; };
  }, [organizationId]);

  const handleSave = async () => {
    if (savingRef.current !== null || uploadingRef.current.size || isLoading || loadError) return;
    const generation = contextGenerationRef.current;
    savingRef.current = generation;
    const settingsToSave = { ...brandingSettings };
    setIsSaving(true);
    try {
      const { data: current, error: currentError } = await supabase
        .from('organizations').select('id, branding').eq('id', organizationId).single();
      if (generation !== contextGenerationRef.current) return;
      if (currentError || current?.id !== organizationId) throw currentError || new Error('Организация не подтверждена');
      const mergedBranding = { ...brandingRecord(current.branding), ...settingsToSave };
      const { data: updated, error } = await supabase
        .from('organizations')
        .update({ branding: mergedBranding as any })
        .eq('id', organizationId)
        .select('id, branding').maybeSingle();
      if (error) throw error;
      if (updated?.id !== organizationId) throw new Error('Сервер не подтвердил сохранение');
      const { data: persisted, error: readError } = await supabase
        .from('organizations').select('id, branding').eq('id', organizationId).single();
      if (readError || persisted?.id !== organizationId) throw readError || new Error('Сохранение не подтверждено');
      const persistedBranding = brandingRecord(persisted.branding);
      if (Object.keys(settingsToSave).some(key => persistedBranding[key] !== settingsToSave[key as keyof BrandingSettings])) {
        throw new Error('Сервер не подтвердил новые настройки');
      }
      qc.setQueryData<OrganizationCore | null>(['org-core', organizationId], currentCore =>
        currentCore ? { ...currentCore, branding: persistedBranding } : currentCore,
      );
      void qc.invalidateQueries({ queryKey: ['org-core', organizationId], exact: true });
      if (generation === contextGenerationRef.current) {
        setSavedSettings(settingsToSave);
        toast.success('Брендирование сохранено');
      }
    } catch {
      if (generation === contextGenerationRef.current) {
        toast.error('Не удалось подтвердить сохранение. Изменения остаются в форме — повторите попытку.');
      }
    } finally {
      if (savingRef.current === generation) {
        savingRef.current = null;
        if (generation === contextGenerationRef.current) setIsSaving(false);
      }
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'cover' | 'logo') => {
    const file = e.target.files?.[0];
    if (!file || savingRef.current !== null || uploadingRef.current.has(type) || isLoading || loadError) return;
    const generation = contextGenerationRef.current;
    uploadingRef.current.set(type, generation);
    const setter = type === 'cover' ? setIsUploadingCover : setIsUploadingLogo;
    setter(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `${organizationId}/${type}_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("org-branding")
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from("org-branding")
        .getPublicUrl(filePath);
      const key = type === 'cover' ? 'coverUrl' : 'logoUrl';
      if (generation === contextGenerationRef.current) {
        setBrandingSettings(prev => ({ ...prev, [key]: urlData.publicUrl }));
      }
    } catch (err: any) {
      if (generation === contextGenerationRef.current) toast.error("Ошибка загрузки: " + err.message);
    } finally {
      if (uploadingRef.current.get(type) === generation) {
        uploadingRef.current.delete(type);
        if (generation === contextGenerationRef.current) setter(false);
      }
      if (e.target) e.target.value = "";
    }
  };

  const LockedOverlay = () => (
    <div className="absolute inset-0 z-10 bg-background/60 backdrop-blur-[2px] rounded-xl lg:rounded-2xl flex items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-center px-4 max-w-sm">
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
          <Lock className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">Доступно от тарифа «Стандарт»</p>
        <ul className="text-left space-y-1 mt-1">
          <li className="flex items-start gap-2 text-xs text-muted-foreground"><span className="text-primary mt-0.5">✓</span>Обложка и логотип вашей организации</li>
          <li className="flex items-start gap-2 text-xs text-muted-foreground"><span className="text-primary mt-0.5">✓</span>Фирменные цвета в интерфейсе</li>
          <li className="flex items-start gap-2 text-xs text-muted-foreground"><span className="text-primary mt-0.5">✓</span>Кастомное название в сайдбаре</li>
        </ul>
        <Button size="sm" variant="outline" className="rounded-xl gap-1.5 text-xs mt-1" onClick={() => navigate('/organization?tab=subscription')}>
          <ArrowUpRight className="w-3.5 h-3.5" /> Сменить тариф
        </Button>
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl">
      <div className="bg-card rounded-2xl border border-border p-6 relative">
        {!hasBranding && <LockedOverlay />}
        <h3 className="font-display font-semibold text-lg flex items-center gap-2 mb-1">
          <Image className="w-5 h-5" /> Брендирование
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Настройте внешний вид кабинета с вашим фирменным стилем
        </p>

        {loadError && <p role="alert" className="mb-4 text-sm text-destructive">Не удалось загрузить брендирование. Обновите страницу перед сохранением.</p>}
        <fieldset disabled={isSaving || isLoading || loadError} className="space-y-6">
          {/* Cover Image */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Обложка организации</Label>
            <p className="text-sm text-muted-foreground mb-3">Изображение отображается в шапке личного кабинета (рекомендуется 1920×400 px)</p>
            <HintBlock
              diagram={<CoverLocationHint className="w-full h-auto" />}
              text="Большое изображение-баннер в верхней части кабинета — между шапкой и основным содержимым. Видят его все сотрудники и ученики при входе."
            />
            <div className="relative">
              {brandingSettings.coverUrl ? (
                <div className="relative rounded-xl overflow-hidden border border-border">
                  <img src={proxiedAssetUrl(brandingSettings.coverUrl)} alt="Обложка" className="w-full h-32"
                    style={{
                      objectFit: brandingSettings.coverPosition === 'contain' ? 'contain' : 'cover',
                      objectPosition: brandingSettings.coverPosition === 'top' ? 'center top' : brandingSettings.coverPosition === 'bottom' ? 'center bottom' : 'center center',
                      backgroundColor: 'hsl(var(--muted))'
                    }}
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <label className="cursor-pointer">
                      <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'cover')} />
                      <Button size="sm" variant="secondary" className="rounded-lg pointer-events-none">Заменить</Button>
                    </label>
                    <Button size="sm" variant="destructive" className="rounded-lg" onClick={() => setBrandingSettings(prev => ({ ...prev, coverUrl: '' }))}>Удалить</Button>
                  </div>
                </div>
              ) : (
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'cover')} />
                  <div className="border-2 border-dashed border-border rounded-xl h-32 flex flex-col items-center justify-center gap-2 hover:border-primary/50 hover:bg-primary/5 transition-colors">
                    {isUploadingCover ? <SigmaSpinner /> : <><Upload className="w-6 h-6 text-muted-foreground" /><span className="text-sm text-muted-foreground">Загрузить обложку</span></>}
                  </div>
                </label>
              )}
              {brandingSettings.coverUrl && (
                <div className="mt-3">
                  <Label className="text-xs text-muted-foreground mb-2 block">Позиционирование обложки</Label>
                  <div className="flex flex-wrap gap-2">
                    {([{ value: 'cover' as const, label: 'Заполнить' }, { value: 'contain' as const, label: 'Вписать' }, { value: 'center' as const, label: 'По центру' }, { value: 'top' as const, label: 'Сверху' }, { value: 'bottom' as const, label: 'Снизу' }]).map(pos => (
                      <Button key={pos.value} size="sm" variant={brandingSettings.coverPosition === pos.value ? 'default' : 'outline'} className="rounded-lg text-xs" onClick={() => setBrandingSettings(prev => ({ ...prev, coverPosition: pos.value }))}>{pos.label}</Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Logo */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Логотип организации</Label>
            <p className="text-sm text-muted-foreground mb-3">Отображается вместо стандартного логотипа Синтагма (рекомендуется квадрат или прозрачный PNG)</p>
            <div className="mb-3">
              <HintBlock
                diagram={<LogoLocationHint className="w-full h-auto" />}
                text="Логотип появится в шапке кабинета (слева) и на странице входа в кабинет вместо стандартного логотипа Синтагма."
              />
            </div>
            <div className="flex items-start gap-4">
              {brandingSettings.logoUrl ? (
                <div className="relative">
                  <img src={proxiedAssetUrl(brandingSettings.logoUrl)} alt="Логотип" className="w-20 h-20 object-contain rounded-xl border border-border bg-background p-2" />
                  <button onClick={() => setBrandingSettings(prev => ({ ...prev, logoUrl: '' }))} className="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center hover:bg-destructive/80">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={e => handleImageUpload(e, 'logo')} />
                  <div className="w-20 h-20 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-1 hover:border-primary/50 hover:bg-primary/5 transition-colors">
                    {isUploadingLogo ? <SigmaSpinner /> : <><Upload className="w-5 h-5 text-muted-foreground" /><span className="text-xs text-muted-foreground">Логотип</span></>}
                  </div>
                </label>
              )}
              <div className="flex-1 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Показывать название</p>
                    <p className="text-xs text-muted-foreground">Отображать название организации рядом с логотипом</p>
                  </div>
                  <button onClick={() => setBrandingSettings(prev => ({ ...prev, showOrgName: !prev.showOrgName }))} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${brandingSettings.showOrgName ? 'bg-primary' : 'bg-muted'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${brandingSettings.showOrgName ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Custom Name */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Кастомное название</Label>
            <p className="text-sm text-muted-foreground mb-3">Отображается вместо "СИНТАГМА" в первой строке сайдбара</p>
            <Input value={brandingSettings.customName || ''} onChange={e => setBrandingSettings(prev => ({ ...prev, customName: e.target.value }))} className="rounded-xl" placeholder="Введите название для отображения..." />
          </div>

          {/* Custom Subtitle */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Подзаголовок</Label>
            <p className="text-sm text-muted-foreground mb-3">Отображается во второй строке под названием</p>
            <Input value={brandingSettings.customSubtitle || ''} onChange={e => setBrandingSettings(prev => ({ ...prev, customSubtitle: e.target.value }))} className="rounded-xl" placeholder="Введите подзаголовок..." />
          </div>

          {/* Colors */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">Основной цвет</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={brandingSettings.primaryColor} onChange={e => setBrandingSettings(prev => ({ ...prev, primaryColor: e.target.value }))} className="w-10 h-10 rounded-lg cursor-pointer border border-border" />
                <Input value={brandingSettings.primaryColor} onChange={e => setBrandingSettings(prev => ({ ...prev, primaryColor: e.target.value }))} className="rounded-xl flex-1" placeholder="#0d9488" />
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block">Дополнительный цвет</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={brandingSettings.secondaryColor} onChange={e => setBrandingSettings(prev => ({ ...prev, secondaryColor: e.target.value }))} className="w-10 h-10 rounded-lg cursor-pointer border border-border" />
                <Input value={brandingSettings.secondaryColor} onChange={e => setBrandingSettings(prev => ({ ...prev, secondaryColor: e.target.value }))} className="rounded-xl flex-1" placeholder="#8b5cf6" />
              </div>
            </div>
          </div>
        </fieldset>

        {!isLoading && !loadError && (
          <p role="status" className="mt-4 text-sm text-muted-foreground">
            {isUploadingCover || isUploadingLogo ? 'Изображение загружается. Дождитесь окончания загрузки.'
              : hasUnsavedChanges ? 'Изменения не сохранены. Нажмите «Сохранить брендирование», чтобы обновить кабинет.'
                : 'Все изменения сохранены.'}
          </p>
        )}

        <div className="mt-6 pt-4 border-t border-border flex gap-3">
          <Button className="btn-gradient rounded-xl gap-2" onClick={handleSave} disabled={isSaving || isLoading || loadError || isUploadingCover || isUploadingLogo}>
            {isSaving ? <><SigmaSpinner size="sm" /> Сохранение...</> : <><Save className="w-4 h-4" /> Сохранить брендирование</>}
          </Button>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" className="rounded-xl gap-2" onClick={() => window.open("/student", "_blank")}>
                  <Eye className="w-4 h-4" /> Предпросмотр
                </Button>
              </TooltipTrigger>
              <TooltipContent>Предпросмотр кабинета ученика</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
