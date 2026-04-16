import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { SigmaLogo } from '@/components/ui/SigmaLogo';
import { Badge } from '@/components/ui/badge';
import { Monitor, BookOpen, Users, Settings, BarChart3, FileText } from 'lucide-react';

const DEMO_FEATURES = [
  { icon: BookOpen, label: 'Курсы', desc: 'Создание и управление курсами с ИИ-генерацией' },
  { icon: Users, label: 'Ученики', desc: 'Управление учениками, группы, зачисления' },
  { icon: FileText, label: 'Документы', desc: 'ФРДО, удостоверения, дипломы' },
  { icon: BarChart3, label: 'Аналитика', desc: 'Отслеживание прогресса и статистика' },
  { icon: Settings, label: 'Настройки', desc: 'Брендирование, интеграции, тарифы' },
];

export function DemoDashboard() {
  const location = useLocation();
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const kinescopeLiveId = (location.state as any)?.kinescopeLiveId || searchParams.get('kinescope');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between px-4 h-14 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <SigmaLogo size="sm" showText={false} />
            <span className="font-display font-bold">Демонстрация платформы</span>
            <Badge variant="secondary">ДЕМО</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-primary" />
            <span className="text-sm text-primary font-medium">Трансляция</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Kinescope Live Player */}
        {kinescopeLiveId ? (
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="aspect-video w-full bg-black">
                <iframe
                  src={`https://player.kinescope.io/live/${kinescopeLiveId}`}
                  className="w-full h-full"
                  allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                  allowFullScreen
                  title="Демо-трансляция"
                />
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <Monitor className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <h3 className="font-semibold text-lg">Ожидание трансляции</h3>
              <p className="text-muted-foreground text-sm mt-1">
                Ведущий скоро начнёт демонстрацию платформы
              </p>
            </CardContent>
          </Card>
        )}

        {/* Features preview */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Возможности платформы</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {DEMO_FEATURES.map(f => (
              <Card key={f.label} className="hover:border-primary/30 transition-colors">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <f.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{f.label}</p>
                    <p className="text-xs text-muted-foreground">{f.desc}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-6 text-center">
            <h3 className="font-semibold text-lg mb-2">Готовы начать?</h3>
            <p className="text-muted-foreground text-sm">
              После демонстрации наш менеджер свяжется с вами для обсуждения подключения
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default DemoDashboard;
