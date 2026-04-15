import { useState, useEffect } from "react";
import { 
  Image, Save, Upload, X, ExternalLink, Eye, 
  Globe, Palette, Type, Link as LinkIcon, Copy, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { getBaseUrl } from "@/utils/getBaseUrl";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface LoginBranding {
  backgroundUrl: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  welcomeText: string;
  description: string;
}

interface LoginBrandingSettingsProps {
  organizationId: string;
  organizationName: string;
  userId: string;
}

export function LoginBrandingSettings({ 
  organizationId, 
  organizationName,
  userId 
}: LoginBrandingSettingsProps) {
  const [branding, setBranding] = useState<LoginBranding>({
    backgroundUrl: '',
    logoUrl: '',
    primaryColor: '#0d9488',
    secondaryColor: '#14b8a6',
    welcomeText: '',
    description: ''
  });
  const [loginSlug, setLoginSlug] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingBg, setIsUploadingBg] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [copied, setCopied] = useState(false);

  // Load existing settings
  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('organizations')
          .select('login_branding, login_slug, website_url')
          .eq('id', organizationId)
          .single();
        
        if (error) throw error;
        
        if (data?.login_branding && typeof data.login_branding === 'object') {
          const b = data.login_branding as Record<string, unknown>;
          setBranding({
            backgroundUrl: (b.backgroundUrl as string) || '',
            logoUrl: (b.logoUrl as string) || '',
            primaryColor: (b.primaryColor as string) || '#0d9488',
            secondaryColor: (b.secondaryColor as string) || '#14b8a6',
            welcomeText: (b.welcomeText as string) || '',
            description: (b.description as string) || ''
          });
        }
        setLoginSlug(data?.login_slug || '');
        setWebsiteUrl(data?.website_url || '');
      } catch (error) {
        console.error('Error loading login branding:', error);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [organizationId]);

  const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Файл слишком большой. Максимум 5 МБ');
      return;
    }

    setIsUploadingBg(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${userId}/login-background.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('org-branding')
        .upload(filePath, file, { upsert: true });
      
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage
        .from('org-branding')
        .getPublicUrl(filePath);
      
      setBranding(prev => ({ ...prev, backgroundUrl: publicUrl }));
      toast.success('Фоновое изображение загружено');
    } catch (error) {
      console.error('Error uploading background:', error);
      toast.error('Ошибка загрузки изображения');
    } finally {
      setIsUploadingBg(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Файл слишком большой. Максимум 2 МБ');
      return;
    }

    setIsUploadingLogo(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${userId}/login-logo.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('org-branding')
        .upload(filePath, file, { upsert: true });
      
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage
        .from('org-branding')
        .getPublicUrl(filePath);
      
      setBranding(prev => ({ ...prev, logoUrl: publicUrl }));
      toast.success('Логотип загружен');
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error('Ошибка загрузки логотипа');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Validate slug format
      const cleanSlug = loginSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      
      if (cleanSlug && cleanSlug.length < 3) {
        toast.error('Уникальная ссылка должна содержать минимум 3 символа');
        setIsSaving(false);
        return;
      }

      const { error } = await supabase
        .from('organizations')
        .update({
          login_branding: JSON.parse(JSON.stringify(branding)) as Json,
          login_slug: cleanSlug || null,
          website_url: websiteUrl || null
        })
        .eq('id', organizationId);
      
      if (error) {
        if (error.code === '23505') {
          toast.error('Эта ссылка уже занята другой организацией');
        } else {
          throw error;
        }
        return;
      }
      
      setLoginSlug(cleanSlug);
      toast.success('Настройки брендирования страницы входа сохранены');
    } catch (error) {
      console.error('Error saving login branding:', error);
      toast.error('Ошибка сохранения настроек');
    } finally {
      setIsSaving(false);
    }
  };

  const getLoginUrl = () => {
    if (!loginSlug) return '';
    return `${getBaseUrl()}/login/${loginSlug}`;
  };

  const copyLoginUrl = () => {
    const url = getLoginUrl();
    if (url) {
      navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Ссылка скопирована');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <SigmaSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Unique Link */}
      <div className="space-y-3">
        <Label className="flex items-center gap-2">
          <LinkIcon className="w-4 h-4" />
          Уникальная ссылка для входа
        </Label>
        <p className="text-sm text-muted-foreground">
          Создайте уникальную ссылку на страницу входа для вашей организации
        </p>
        <div className="flex gap-2">
          <div className="flex-1">
            <div className="flex items-center">
              <span className="bg-muted px-3 h-10 flex items-center text-sm text-muted-foreground rounded-l-lg border border-r-0 border-border">
                {getBaseUrl()}/login/
              </span>
              <Input
                value={loginSlug}
                onChange={(e) => setLoginSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="my-organization"
                className="rounded-l-none"
              />
            </div>
          </div>
        </div>
        {loginSlug && (
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-muted px-3 py-2 rounded-lg text-sm break-all">
              {getLoginUrl()}
            </code>
            <Button size="icon" variant="outline" onClick={copyLoginUrl}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
            <Button size="icon" variant="outline" asChild>
              <a href={getLoginUrl()} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4" />
              </a>
            </Button>
          </div>
        )}
      </div>

      {/* Website URL */}
      <div className="space-y-3">
        <Label className="flex items-center gap-2">
          <Globe className="w-4 h-4" />
          Сайт организации
        </Label>
        <p className="text-sm text-muted-foreground">
          Ссылка на официальный сайт будет отображаться на странице входа
        </p>
        <Input
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          placeholder="https://example.com"
          type="url"
        />
      </div>

      {/* Background Image */}
      <div className="space-y-3">
        <Label className="flex items-center gap-2">
          <Image className="w-4 h-4" />
          Фоновое изображение
        </Label>
        <p className="text-sm text-muted-foreground">
          Изображение для правой части страницы входа (рекомендуется 1920×1080 px)
        </p>
        {branding.backgroundUrl ? (
          <div className="relative rounded-xl overflow-hidden border border-border">
            <img src={branding.backgroundUrl} alt="Фон" className="w-full h-40 object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <label className="cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={handleBackgroundUpload} />
                <Button size="sm" variant="secondary" className="rounded-lg pointer-events-none">
                  Заменить
                </Button>
              </label>
              <Button
                size="sm"
                variant="destructive"
                className="rounded-lg"
                onClick={() => setBranding(prev => ({ ...prev, backgroundUrl: '' }))}
              >
                Удалить
              </Button>
            </div>
          </div>
        ) : (
          <label className="cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={handleBackgroundUpload} />
            <div className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center hover:border-primary/50 transition-colors">
              {isUploadingBg ? (
                <SigmaSpinner size="lg" />
              ) : (
                <>
                  <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">Нажмите для загрузки</span>
                </>
              )}
            </div>
          </label>
        )}
      </div>

      {/* Logo */}
      <div className="space-y-3">
        <Label className="flex items-center gap-2">
          <Image className="w-4 h-4" />
          Логотип
        </Label>
        <p className="text-sm text-muted-foreground">
          Логотип организации для страницы входа (рекомендуется PNG с прозрачным фоном)
        </p>
        {branding.logoUrl ? (
          <div className="relative w-32 h-32 rounded-xl overflow-hidden border border-border bg-muted">
            <img src={branding.logoUrl} alt="Логотип" className="w-full h-full object-contain p-2" />
            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
              <Button
                size="sm"
                variant="destructive"
                className="rounded-lg"
                onClick={() => setBranding(prev => ({ ...prev, logoUrl: '' }))}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          <label className="cursor-pointer inline-block">
            <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            <div className="w-32 h-32 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center hover:border-primary/50 transition-colors">
              {isUploadingLogo ? (
                <SigmaSpinner />
              ) : (
                <>
                  <Upload className="w-6 h-6 text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground">Загрузить</span>
                </>
              )}
            </div>
          </label>
        )}
      </div>

      {/* Colors */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Palette className="w-4 h-4" />
            Основной цвет
          </Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={branding.primaryColor}
              onChange={(e) => setBranding(prev => ({ ...prev, primaryColor: e.target.value }))}
              className="w-10 h-10 rounded-lg border border-border cursor-pointer"
            />
            <Input
              value={branding.primaryColor}
              onChange={(e) => setBranding(prev => ({ ...prev, primaryColor: e.target.value }))}
              className="flex-1"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Palette className="w-4 h-4" />
            Дополнительный цвет
          </Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={branding.secondaryColor}
              onChange={(e) => setBranding(prev => ({ ...prev, secondaryColor: e.target.value }))}
              className="w-10 h-10 rounded-lg border border-border cursor-pointer"
            />
            <Input
              value={branding.secondaryColor}
              onChange={(e) => setBranding(prev => ({ ...prev, secondaryColor: e.target.value }))}
              className="flex-1"
            />
          </div>
        </div>
      </div>

      {/* Welcome Text */}
      <div className="space-y-3">
        <Label className="flex items-center gap-2">
          <Type className="w-4 h-4" />
          Текст приветствия
        </Label>
        <Input
          value={branding.welcomeText}
          onChange={(e) => setBranding(prev => ({ ...prev, welcomeText: e.target.value }))}
          placeholder={`Добро пожаловать в ${organizationName}`}
        />
      </div>

      {/* Description */}
      <div className="space-y-3">
        <Label className="flex items-center gap-2">
          <Type className="w-4 h-4" />
          Описание
        </Label>
        <Textarea
          value={branding.description}
          onChange={(e) => setBranding(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Войдите в личный кабинет для доступа к курсам"
          rows={2}
        />
      </div>

      {/* Preview & Save */}
      <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-border">
        {loginSlug && (
          <Button variant="outline" className="gap-2" asChild>
            <a href={getLoginUrl()} target="_blank" rel="noopener noreferrer">
              <Eye className="w-4 h-4" />
              Предпросмотр
            </a>
          </Button>
        )}
        <Button 
          className="btn-gradient gap-2 flex-1 sm:flex-none" 
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <SigmaSpinner size="sm" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Сохранить настройки
        </Button>
      </div>
    </div>
  );
}
