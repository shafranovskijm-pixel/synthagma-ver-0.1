import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, Smartphone, Share, Plus, MoreVertical, Apple, Play } from "lucide-react";
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
    // Check if app is already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    // Detect iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    // Detect Android
    const android = /Android/.test(navigator.userAgent);
    setIsAndroid(android);

    // Listen for the beforeinstallprompt event
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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
          {/* Hero */}
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

          {/* Install Status */}
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
                  <p className="text-muted-foreground">
                    СИНТАГМА уже доступна на вашем устройстве
                  </p>
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
              {/* Direct Install Button (for Android) */}
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

              {/* iOS Instructions */}
              {isIOS && (
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
                        <span>Нажмите кнопку <Share className="w-4 h-4 inline mx-1" /> «Поделиться» в браузере Safari</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-medium shrink-0">2</span>
                        <span>Прокрутите вниз и выберите <Plus className="w-4 h-4 inline mx-1" /> «На экран Домой»</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-medium shrink-0">3</span>
                        <span>Нажмите «Добавить» в правом верхнем углу</span>
                      </li>
                    </ol>
                  </CardContent>
                </Card>
              )}

              {/* Android Instructions (when no prompt) */}
              {isAndroid && !deferredPrompt && (
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
                        <span>Нажмите <MoreVertical className="w-4 h-4 inline mx-1" /> меню в правом верхнем углу браузера</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-medium shrink-0">2</span>
                        <span>Выберите «Добавить на главный экран» или «Установить приложение»</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-medium shrink-0">3</span>
                        <span>Подтвердите установку</span>
                      </li>
                    </ol>
                  </CardContent>
                </Card>
              )}

              {/* Desktop Instructions */}
              {!isIOS && !isAndroid && !deferredPrompt && (
                <Card className="text-left">
                  <CardContent className="py-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                        <Monitor className="w-5 h-5" />
                      </div>
                      <h3 className="font-medium text-lg">Установка на компьютер или телефон</h3>
                    </div>
                    <div className="space-y-4 text-sm text-muted-foreground">
                      <p>
                        <strong className="text-foreground">На компьютере:</strong> откройте эту страницу в браузере Chrome или Edge и нажмите на иконку установки <Download className="w-4 h-4 inline mx-1" /> в адресной строке.
                      </p>
                      <div className="border-t border-border/50 pt-4">
                        <p className="mb-3">
                          <strong className="text-foreground">На телефоне:</strong> откройте ссылку ниже в мобильном браузере:
                        </p>
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border/30">
                          <Smartphone className="w-4 h-4 shrink-0 text-accent" />
                          <code className="text-xs break-all select-all text-foreground">synthagma-bloom.lovable.app/install</code>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
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
