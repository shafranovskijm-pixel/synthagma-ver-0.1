import { useEffect, useState } from "react";
import { getBaseUrl } from "@/utils/getBaseUrl";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, Smartphone, RefreshCw, Copy, Globe } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { getBrowserName, getOS, getBrowserInstallInfo, type BrowserName } from "@/utils/browserDetect";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function Install() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [browser, setBrowser] = useState<BrowserName>('unknown');
  const [os, setOs] = useState<'ios' | 'android' | 'desktop'>('desktop');

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }
    setBrowser(getBrowserName());
    setOs(getOS());

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(getBaseUrl() + "/install");
      toast.success("Ссылка скопирована в буфер обмена");
    } catch {
      toast.error("Не удалось скопировать ссылку");
    }
  };

  const installInfo = getBrowserInstallInfo(browser, os);
  const isDesktop = os === 'desktop';

  // On desktop show both iOS and Android guides
  const iosInfo = getBrowserInstallInfo('safari', 'ios');
  const androidInfo = getBrowserInstallInfo('chrome', 'android');

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Установка веб-приложения — СИНТАГМА СДО</title>
        <meta name="description" content="Добавьте веб-приложение СИНТАГМА на главный экран телефона или компьютера для быстрого доступа к платформе." />
        <meta name="keywords" content="установка, приложение, PWA, мобильное приложение" />
        <link rel="canonical" href="https://xn--80aaiswd0ak.xn--p1ai/install" />
        <meta property="og:title" content="Установка веб-приложения — СИНТАГМА СДО" />
        <meta property="og:description" content="Добавьте веб-приложение СИНТАГМА на главный экран телефона или компьютера для быстрого доступа к платформе." />
        <meta property="og:url" content="https://xn--80aaiswd0ak.xn--p1ai/install" />
        <meta property="og:image" content="https://xn--80aaiswd0ak.xn--p1ai/og-registration-organization.jpg" />
      </Helmet>
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Назад на главную</span>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-6 py-16">
        <div className="max-w-2xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="w-20 h-20 rounded-2xl bg-foreground flex items-center justify-center mx-auto mb-8 shadow-xl">
              <span className="font-display font-bold text-3xl text-background">Σ</span>
            </div>
            <h1 className="font-display text-4xl md:text-5xl font-medium mb-4 tracking-tight">
              Установите веб-приложение
            </h1>
            <p className="text-lg text-muted-foreground mb-6 max-w-md mx-auto">
              Получите быстрый доступ к платформе СИНТАГМА прямо с главного экрана вашего устройства
            </p>
            <div className="mb-12 max-w-md mx-auto text-xs text-muted-foreground bg-secondary/40 border border-border/40 rounded-lg px-4 py-3">
              <Globe className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
              Работает на <b>синтагма.рф</b> и <b>sintagma.com.ru</b>. Устанавливайте с того домена,
              которым пользуетесь обычно — иначе на телефоне появятся две иконки (это ограничение браузеров, не наше).
            </div>
          </motion.div>

          {isInstalled ? (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mb-12">
              <Card className="border-accent/30 bg-accent/5">
                <CardContent className="py-8">
                  <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-4">
                    <Smartphone className="w-8 h-8 text-accent" />
                  </div>
                  <h3 className="text-xl font-medium mb-2">Приложение установлено!</h3>
                  <p className="text-muted-foreground">СИНТАГМА уже доступна на вашем устройстве</p>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="space-y-6 mb-12"
            >
              {/* PWA install prompt (Android/desktop) */}
              {deferredPrompt && (
                <Button
                  size="lg"
                  onClick={handleInstallClick}
                  className="btn-gradient rounded-xl px-10 h-14 text-base gap-2 shadow-lg w-full"
                >
                  <Download className="w-5 h-5" />
                  Установить веб-приложение
                </Button>
              )}

              {/* Android: PWA instructions */}
              {(os === 'android' || isDesktop) && (
                <InstructionCard info={isDesktop ? androidInfo : installInfo} label={isDesktop ? "Android (PWA)" : installInfo.name} />
              )}

              {/* iOS: PWA instructions */}
              {(os === 'ios' || isDesktop) && (
                <InstructionCard info={isDesktop ? iosInfo : installInfo} label={isDesktop ? "iPhone / iPad (PWA)" : installInfo.name} />
              )}

              {/* APK download */}
              <Card className="border-accent/30 bg-accent/5">
                <CardContent className="py-6">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                    <span className="text-sm font-medium text-accent">Версия для Android</span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Отдельный APK для Android находится в разработке. Сейчас используйте веб-приложение PWA.
                  </p>
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center justify-center gap-2 w-full px-5 py-4 rounded-xl border border-foreground/20 text-muted-foreground bg-muted/40 cursor-not-allowed text-base font-medium"
                  >
                    <Download className="w-5 h-5" />
                    APK в разработке
                  </button>
                </CardContent>
              </Card>

              {/* Utility buttons */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button variant="outline" onClick={handleCopyLink} className="gap-2">
                  <Copy className="w-4 h-4" />
                  Скопировать ссылку
                </Button>
                <Button variant="outline" onClick={() => window.location.reload()} className="gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Обновить страницу
                </Button>
              </div>
            </motion.div>
          )}

          {/* Features */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.4 }}>
            <h3 className="font-display text-xl font-medium mb-6">Преимущества веб-приложения</h3>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { title: "Быстрый доступ", desc: "Запуск в одно касание" },
                { title: "Быстрый повторный запуск", desc: "Основные файлы приложения кешируются браузером" },
                { title: "Уведомления", desc: "Уведомления внутри кабинета" },
              ].map((feature, index) => (
                <Card key={index} className="text-center">
                  <CardContent className="py-6">
                    <h4 className="font-medium mb-1">{feature.title}</h4>
                    <p className="text-sm text-muted-foreground">{feature.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}

function InstructionCard({ info, label }: { info: { name: string; steps: string[] }; label: string }) {
  return (
    <Card className="text-left">
      <CardContent className="py-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
            <Globe className="w-5 h-5" />
          </div>
          <h3 className="font-medium text-lg">Установка — {label}</h3>
        </div>
        <ol className="space-y-4 text-sm text-muted-foreground">
          {info.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-medium shrink-0">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
