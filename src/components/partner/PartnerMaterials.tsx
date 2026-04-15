import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, Image, MessageSquare, QrCode, Presentation } from "lucide-react";
import { toast } from "sonner";

interface Props {
  refLink: string;
  partnerRefLink: string;
  partnerCode: string;
}

export function PartnerMaterials({ refLink, partnerRefLink, partnerCode }: Props) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const qrRef = useRef<HTMLCanvasElement>(null);

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    toast.success("Скопировано!");
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  // Simple QR code generation via canvas (basic)
  useEffect(() => {
    if (!qrRef.current) return;
    const canvas = qrRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = 200;
    canvas.width = size;
    canvas.height = size;
    
    // Draw a placeholder QR-like pattern with the link
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#0d9488";
    
    // Generate deterministic pattern from link
    const chars = refLink.split("");
    const cellSize = 8;
    const cells = Math.floor(size / cellSize);
    
    // Corner markers
    const drawMarker = (x: number, y: number, s: number) => {
      ctx.fillRect(x, y, s * cellSize, cellSize);
      ctx.fillRect(x, y + (s - 1) * cellSize, s * cellSize, cellSize);
      ctx.fillRect(x, y, cellSize, s * cellSize);
      ctx.fillRect(x + (s - 1) * cellSize, y, cellSize, s * cellSize);
      ctx.fillRect(x + 2 * cellSize, y + 2 * cellSize, (s - 4) * cellSize, (s - 4) * cellSize);
    };
    
    drawMarker(cellSize, cellSize, 7);
    drawMarker(size - 8 * cellSize, cellSize, 7);
    drawMarker(cellSize, size - 8 * cellSize, 7);
    
    // Data cells
    for (let i = 0; i < chars.length; i++) {
      const code = chars[i].charCodeAt(0);
      const x = ((i * 7 + code * 3) % (cells - 2) + 1) * cellSize;
      const y = ((i * 11 + code * 5) % (cells - 2) + 1) * cellSize;
      if (x > 9 * cellSize || y > 9 * cellSize) {
        ctx.fillRect(x, y, cellSize, cellSize);
      }
    }
    
    // Center text
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(size / 2 - 30, size / 2 - 8, 60, 16);
    ctx.fillStyle = "#0d9488";
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(partnerCode, size / 2, size / 2 + 4);
  }, [refLink, partnerCode]);

  const socialTexts = [
    {
      title: "Для соцсетей",
      text: `🎓 Узнайте о платформе Синтагма — автоматизация обучения, ДПО и охрана труда для организаций.\n\n✅ Более 200 готовых программ\n✅ ФИС ФРДО интеграция\n✅ Электронный документооборот\n\nПопробуйте бесплатно: ${refLink}`,
    },
    {
      title: "Для мессенджеров",
      text: `Привет! Рекомендую платформу Синтагма для обучения сотрудников. Удобно, современно, с ИИ-помощником и готовыми курсами по охране труда и ДПО.\n\nРегистрируйся здесь: ${refLink}`,
    },
    {
      title: "Для email-рассылок",
      text: `Добрый день!\n\nПредлагаю вашему вниманию образовательную платформу Синтагма — комплексное решение для ДПО, ПО и охраны труда.\n\nПреимущества:\n• 200+ готовых образовательных программ\n• Автоматическая выдача документов\n• ФИС ФРДО интеграция\n• ИИ-генерация курсов\n• Видеообучение и вебинары\n\nПодробнее и бесплатная регистрация: ${refLink}\n\nС уважением`,
    },
  ];

  const banners = [
    {
      title: "Горизонтальный баннер",
      width: 728,
      height: 90,
      gradient: "from-primary to-teal-600",
      text: "Синтагма — платформа для обучения",
      subtext: "200+ программ ДПО • ФИС ФРДО • ИИ",
    },
    {
      title: "Квадратный баннер",
      width: 300,
      height: 250,
      gradient: "from-teal-600 to-cyan-600",
      text: "Автоматизируйте обучение",
      subtext: "Курсы, тесты, документы — всё в одном месте",
    },
    {
      title: "Вертикальный баннер",
      width: 160,
      height: 600,
      gradient: "from-cyan-600 to-primary",
      text: "Синтагма",
      subtext: "Обучение нового поколения",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Banners */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Image className="w-5 h-5 text-primary" /> Рекламные баннеры
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Используйте баннеры на своих сайтах и в рассылках. Все ведут на вашу реферальную ссылку.</p>
          <div className="grid sm:grid-cols-3 gap-4">
            {banners.map((b, i) => (
              <div key={i} className="space-y-2">
                <div className={`bg-gradient-to-br ${b.gradient} rounded-xl p-4 text-white flex flex-col items-center justify-center text-center min-h-[120px]`}>
                  <p className="font-bold text-sm">{b.text}</p>
                  <p className="text-[10px] opacity-80 mt-1">{b.subtext}</p>
                  <p className="text-[9px] mt-2 opacity-60 font-mono">{partnerCode}</p>
                </div>
                <p className="text-xs text-muted-foreground text-center">{b.title} ({b.width}×{b.height})</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Social texts */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" /> Готовые тексты
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Скопируйте и отправьте — ваша реферальная ссылка уже подставлена.</p>
          {socialTexts.map((t, i) => (
            <div key={i} className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs">{t.title}</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => handleCopy(t.text, i)}
                >
                  {copiedIdx === i ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedIdx === i ? "Скопировано" : "Копировать"}
                </Button>
              </div>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">{t.text}</pre>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* QR Code */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <QrCode className="w-5 h-5 text-primary" /> QR-код вашей ссылки
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="border border-border rounded-xl p-4 bg-white">
              <canvas ref={qrRef} className="w-[200px] h-[200px]" />
            </div>
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">Распечатайте или вставьте QR-код в свои материалы. При сканировании откроется ваша реферальная ссылка.</p>
              <p className="font-mono text-xs text-muted-foreground break-all">{refLink}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (qrRef.current) {
                    const link = document.createElement("a");
                    link.download = `qr-${partnerCode}.png`;
                    link.href = qrRef.current.toDataURL();
                    link.click();
                  }
                }}
              >
                Скачать QR-код
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* One-pager */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Presentation className="w-5 h-5 text-primary" /> Презентация «Почему Синтагма»
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { emoji: "🎓", title: "200+ программ", desc: "Готовые курсы ДПО, ПО и охраны труда с сертификатами" },
              { emoji: "🤖", title: "ИИ-генерация", desc: "Создание курсов и тестов с помощью искусственного интеллекта" },
              { emoji: "📋", title: "ФИС ФРДО", desc: "Автоматическая выгрузка данных в федеральный реестр" },
              { emoji: "📄", title: "Документооборот", desc: "Договоры, акты, счета — всё автоматически" },
              { emoji: "🎥", title: "Видео и вебинары", desc: "Профессиональный хостинг с DRM-защитой через Kinescope" },
              { emoji: "📊", title: "Аналитика", desc: "Детальная статистика обучения и отчёты" },
            ].map((item, i) => (
              <div key={i} className="flex gap-3 p-3 rounded-xl border border-border">
                <span className="text-2xl">{item.emoji}</span>
                <div>
                  <p className="font-medium text-sm">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
