import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, Smartphone, Share, Plus, MoreVertical, Apple, Play, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function Install() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    const android = /Android/.test(navigator.userAgent);
    setIsAndroid(android);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const showBothPlatforms = !isIOS && !isAndroid;

  return (
    <div className="min-h-screen bg-background">
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
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="w-20 h-20 rounded-2xl bg-foreground flex items-center justify-center mx-auto mb-8 shadow-xl">
              <span className="font-display font-bold text-3xl text-background">Σ</span>
            </div>
            <h1 className="font-display text-4xl md:text-5xl font-medium mb-4 tracking-tight">
              Установите приложение
            </h1>
            <p className="text-lg text-muted-foreground mb-12 max-w-md mx-auto">
              Получите быстрый доступ к платформе СИНТАГМА прямо с главного экрана вашего устройства
            </p>
          </motion.div>

          {isInstalled ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-12"
            >
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
              {/* Auto-install button when available */}
              {deferredPrompt && (
                <Button
                  size="lg"
                  onClick={handleInstallClick}
                  className="btn-gradient rounded-xl px-10 h-14 text-base gap-2 shadow-lg"
                >
                  <Download className="w-5 h-5" />
                  Установить приложение
                </Button>
              )}

              {/* iOS Instructions — always show on iOS or unknown */}
              {(isIOS || showBothPlatforms) && (
                <Card className="text-left">
                  <CardContent className="py-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                        <Apple className="w-5 h-5" />
                      </div>
                      <h3 className="font-medium text-lg">Установка на iPhone/iPad</h3>
                    </div>
                    <ol className="space-y-4 text-sm text-muted-foreground">
                      <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-medium shrink-0">1</span>
                        <span>Откройте эту страницу в браузере <strong className="text-foreground">Safari</strong></span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-medium shrink-0">2</span>
                        <span>Нажмите кнопку <Share className="w-4 h-4 inline mx-1" /> «Поделиться» внизу экрана</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-medium shrink-0">3</span>
                        <span>Прокрутите вниз и выберите <Plus className="w-4 h-4 inline mx-1" /> «На экран Домой»</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-medium shrink-0">4</span>
                        <span>Нажмите «Добавить» в правом верхнем углу</span>
                      </li>
                    </ol>
                  </CardContent>
                </Card>
              )}

              {/* Android Instructions — always show on Android or unknown */}
              {(isAndroid || showBothPlatforms) && (
                <Card className="text-left">
                  <CardContent className="py-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                        <Play className="w-5 h-5 fill-current" />
                      </div>
                      <h3 className="font-medium text-lg">Установка на Android</h3>
                    </div>
                    <ol className="space-y-4 text-sm text-muted-foreground">
                      <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-medium shrink-0">1</span>
                        <span>Откройте эту страницу в браузере <strong className="text-foreground">Chrome</strong></span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-medium shrink-0">2</span>
                        <span>Нажмите <MoreVertical className="w-4 h-4 inline mx-1" /> меню в правом верхнем углу</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-medium shrink-0">3</span>
                        <span>Выберите «Установить приложение» или «Добавить на главный экран»</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-medium shrink-0">4</span>
                        <span>Подтвердите установку</span>
                      </li>
                    </ol>
                  </CardContent>
                </Card>
              )}

              {/* Refresh button */}
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
                className="gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Обновить страницу и попробовать снова
              </Button>
            </motion.div>
          )}

          {/* Features */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <h3 className="font-display text-xl font-medium mb-6">Преимущества приложения</h3>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { title: "Быстрый доступ", desc: "Запуск в одно касание" },
                { title: "Работа офлайн", desc: "Доступ без интернета" },
                { title: "Уведомления", desc: "Push-уведомления о курсах" },
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
