import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { nativeWebDestination } from './nativeLearnerScope';

export function NativeWebMaterial({ label = 'Встроенный материал' }: { label?: string }) {
  const location = useLocation();
  return <div className="not-prose rounded-xl border border-border bg-muted/30 p-4 space-y-3">
    <p className="font-medium">{label}</p>
    <p className="text-sm text-muted-foreground">Этот интерактивный материал доступен в веб-версии курса. Откроется внешний браузер; вход из приложения не переносится. После входа выберите нужный урок.</p>
    <Button asChild variant="outline"><a href={nativeWebDestination(location)} target="_self" rel="noopener noreferrer">Открыть курс на сайте</a></Button>
  </div>;
}
