 import { useState, useEffect } from "react";
 import { 
   Globe, Save, Loader2, RefreshCw, ExternalLink, 
   FileText, Image, Search, ChevronRight, Copy, Check
 } from "lucide-react";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { Textarea } from "@/components/ui/textarea";
 import { toast } from "sonner";
 import { supabase } from "@/integrations/supabase/client";
 
 interface PageSEO {
   path: string;
   title: string;
   description: string;
   keywords: string;
   ogImage: string;
 }
 
 const DEFAULT_PAGES: PageSEO[] = [
   {
     path: "/",
     title: "СИНТАГМА — Система дистанционного обучения и документооборота",
     description: "Современная СДО для организаций. Создавайте курсы с ИИ, автоматизируйте документооборот, выгружайте в ФРДО. Соответствует 273-ФЗ. От 8 000 ₽/мес.",
     keywords: "СДО, дистанционное обучение, документооборот, ФРДО, 273-ФЗ, онлайн курсы, образовательная платформа, ДПО",
     ogImage: "/og-image.png"
   },
   {
     path: "/about",
     title: "О платформе СИНТАГМА — СДО нового поколения",
     description: "Узнайте больше о платформе СИНТАГМА: история создания, команда разработчиков, преимущества для образовательных организаций.",
     keywords: "о нас, СИНТАГМА, образовательная платформа, команда разработчиков",
     ogImage: "/og-image.png"
   },
   {
     path: "/features",
     title: "Возможности СИНТАГМА — Полный набор инструментов для ДПО",
     description: "AI-генерация курсов, автоматический документооборот, интеграция с ФРДО, журналы и протоколы. Всё для работы образовательной организации.",
     keywords: "возможности СДО, AI курсы, документооборот, ФРДО интеграция, автоматизация обучения",
     ogImage: "/og-image.png"
   },
   {
     path: "/blog",
     title: "Блог СИНТАГМА — Новости и статьи об онлайн-образовании",
     description: "Актуальные статьи о дистанционном обучении, законодательстве в сфере ДПО, best practices для образовательных организаций.",
     keywords: "блог, образование, ДПО, онлайн обучение, статьи",
     ogImage: "/og-image.png"
   },
   {
     path: "/register-organization",
     title: "Регистрация организации — СИНТАГМА СДО",
     description: "Зарегистрируйте свою образовательную организацию в СИНТАГМА. Бесплатный пробный период 14 дней. Быстрая настройка за 5 минут.",
     keywords: "регистрация, образовательная организация, СДО, бесплатный период",
     ogImage: "/og-image.png"
   }
 ];
 
 export function SEOSettingsManager() {
   const [pages, setPages] = useState<PageSEO[]>(DEFAULT_PAGES);
   const [selectedPage, setSelectedPage] = useState<string>("/");
   const [isSaving, setIsSaving] = useState(false);
   const [copied, setCopied] = useState<string | null>(null);
 
   const currentPage = pages.find(p => p.path === selectedPage) || pages[0];
 
   const handlePageChange = (field: keyof PageSEO, value: string) => {
     setPages(prev => prev.map(p => 
       p.path === selectedPage ? { ...p, [field]: value } : p
     ));
   };
 
   const handleSave = async () => {
     setIsSaving(true);
     try {
       // In a real implementation, save to database
       localStorage.setItem('seo_settings', JSON.stringify(pages));
       toast.success('SEO настройки сохранены');
     } catch (error) {
       toast.error('Ошибка сохранения');
     } finally {
       setIsSaving(false);
     }
   };
 
   const copyToClipboard = async (text: string, label: string) => {
     await navigator.clipboard.writeText(text);
     setCopied(label);
     toast.success('Скопировано в буфер обмена');
     setTimeout(() => setCopied(null), 2000);
   };
 
   useEffect(() => {
     const saved = localStorage.getItem('seo_settings');
     if (saved) {
       try {
         setPages(JSON.parse(saved));
       } catch {}
     }
   }, []);
 
   const siteUrl = "https://synthagma-bloom.lovable.app";
 
   return (
     <div className="space-y-6">
       {/* SEO Overview Cards */}
       <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         <div className="bg-card rounded-xl border border-border p-4">
           <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
               <FileText className="w-5 h-5 text-primary" />
             </div>
             <div>
               <p className="text-sm text-muted-foreground">Sitemap</p>
               <p className="font-medium">sitemap.xml</p>
             </div>
           </div>
           <div className="mt-3 flex gap-2">
             <Button 
               variant="outline" 
               size="sm" 
               className="rounded-lg text-xs flex-1"
               onClick={() => window.open(`${siteUrl}/sitemap.xml`, '_blank')}
             >
               <ExternalLink className="w-3 h-3 mr-1" />
               Открыть
             </Button>
             <Button 
               variant="outline" 
               size="sm" 
               className="rounded-lg text-xs flex-1"
               onClick={() => copyToClipboard(`${siteUrl}/sitemap.xml`, 'sitemap')}
             >
               {copied === 'sitemap' ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
               URL
             </Button>
           </div>
         </div>
 
         <div className="bg-card rounded-xl border border-border p-4">
           <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
               <Search className="w-5 h-5 text-green-500" />
             </div>
             <div>
               <p className="text-sm text-muted-foreground">Robots</p>
               <p className="font-medium">robots.txt</p>
             </div>
           </div>
           <div className="mt-3 flex gap-2">
             <Button 
               variant="outline" 
               size="sm" 
               className="rounded-lg text-xs flex-1"
               onClick={() => window.open(`${siteUrl}/robots.txt`, '_blank')}
             >
               <ExternalLink className="w-3 h-3 mr-1" />
               Открыть
             </Button>
             <Button 
               variant="outline" 
               size="sm" 
               className="rounded-lg text-xs flex-1"
               onClick={() => copyToClipboard(`${siteUrl}/robots.txt`, 'robots')}
             >
               {copied === 'robots' ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
               URL
             </Button>
           </div>
         </div>
 
         <div className="bg-card rounded-xl border border-border p-4">
           <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
               <Image className="w-5 h-5 text-blue-500" />
             </div>
             <div>
               <p className="text-sm text-muted-foreground">OG Image</p>
               <p className="font-medium">1200×630</p>
             </div>
           </div>
           <div className="mt-3 flex gap-2">
             <Button 
               variant="outline" 
               size="sm" 
               className="rounded-lg text-xs flex-1"
               onClick={() => window.open(`${siteUrl}/og-image.png`, '_blank')}
             >
               <ExternalLink className="w-3 h-3 mr-1" />
               Открыть
             </Button>
             <Button 
               variant="outline" 
               size="sm" 
               className="rounded-lg text-xs flex-1"
               onClick={() => copyToClipboard(`${siteUrl}/og-image.png`, 'og')}
             >
               {copied === 'og' ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
               URL
             </Button>
           </div>
         </div>
       </div>
 
       {/* Page SEO Editor */}
       <div className="bg-card rounded-xl border border-border">
         <div className="p-4 border-b border-border">
           <h3 className="font-display font-semibold flex items-center gap-2">
             <Globe className="w-5 h-5" />
             Мета-теги страниц
           </h3>
         </div>
 
         <div className="flex flex-col md:flex-row">
           {/* Page List */}
           <div className="md:w-64 border-b md:border-b-0 md:border-r border-border">
             <div className="p-2">
               {pages.map((page) => (
                 <button
                   key={page.path}
                   onClick={() => setSelectedPage(page.path)}
                   className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                     selectedPage === page.path 
                       ? 'bg-primary text-primary-foreground' 
                       : 'hover:bg-secondary'
                   }`}
                 >
                   <span className="truncate">{page.path}</span>
                   <ChevronRight className="w-4 h-4 shrink-0" />
                 </button>
               ))}
             </div>
           </div>
 
           {/* Editor */}
           <div className="flex-1 p-4 space-y-4">
             <div>
               <Label className="text-sm">Title (до 60 символов)</Label>
               <Input
                 value={currentPage.title}
                 onChange={(e) => handlePageChange('title', e.target.value)}
                 className="mt-1 rounded-xl"
                 maxLength={60}
               />
               <p className="text-xs text-muted-foreground mt-1">
                 {currentPage.title.length}/60 символов
               </p>
             </div>
 
             <div>
               <Label className="text-sm">Description (до 160 символов)</Label>
               <Textarea
                 value={currentPage.description}
                 onChange={(e) => handlePageChange('description', e.target.value)}
                 className="mt-1 rounded-xl resize-none"
                 rows={3}
                 maxLength={160}
               />
               <p className="text-xs text-muted-foreground mt-1">
                 {currentPage.description.length}/160 символов
               </p>
             </div>
 
             <div>
               <Label className="text-sm">Keywords (через запятую)</Label>
               <Input
                 value={currentPage.keywords}
                 onChange={(e) => handlePageChange('keywords', e.target.value)}
                 className="mt-1 rounded-xl"
                 placeholder="ключевое слово 1, ключевое слово 2"
               />
             </div>
 
             <div>
               <Label className="text-sm">OG Image URL</Label>
               <Input
                 value={currentPage.ogImage}
                 onChange={(e) => handlePageChange('ogImage', e.target.value)}
                 className="mt-1 rounded-xl"
                 placeholder="/og-image.png"
               />
             </div>
 
             {/* Preview */}
             <div className="mt-6 p-4 bg-secondary/50 rounded-xl">
               <p className="text-xs text-muted-foreground mb-2">Предпросмотр в поиске Google:</p>
               <div className="space-y-1">
                 <p className="text-blue-600 dark:text-blue-400 text-lg truncate hover:underline cursor-pointer">
                   {currentPage.title || 'Заголовок страницы'}
                 </p>
                 <p className="text-green-700 dark:text-green-500 text-sm">
                   {siteUrl}{currentPage.path}
                 </p>
                 <p className="text-sm text-muted-foreground line-clamp-2">
                   {currentPage.description || 'Описание страницы будет отображаться здесь...'}
                 </p>
               </div>
             </div>
           </div>
         </div>
 
         <div className="p-4 border-t border-border flex justify-end gap-2">
           <Button variant="outline" className="rounded-xl gap-2" onClick={() => setPages(DEFAULT_PAGES)}>
             <RefreshCw className="w-4 h-4" />
             Сбросить
           </Button>
           <Button className="btn-gradient rounded-xl gap-2" onClick={handleSave} disabled={isSaving}>
             {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
             Сохранить
           </Button>
         </div>
       </div>
 
       {/* SEO Tips */}
       <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
         <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">💡 SEO рекомендации</h4>
         <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
           <li>• Title должен содержать ключевое слово в начале</li>
           <li>• Description должен быть уникальным для каждой страницы</li>
           <li>• Используйте 3-5 ключевых слов на страницу</li>
           <li>• OG Image должен быть размером 1200×630 пикселей</li>
           <li>• Добавьте сайт в Google Search Console и Яндекс.Вебмастер</li>
         </ul>
       </div>
     </div>
   );
 }