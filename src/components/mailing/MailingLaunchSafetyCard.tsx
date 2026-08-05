import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldAlert } from "lucide-react";
import { computeMailingLaunchGate, type MailingLaunchGateInput } from "@/lib/mailing/launchGate";

/**
 * Карточка безопасного запуска: показывает все блокеры до отправки.
 * Всегда fail-closed — по умолчанию активен режим тестовой отправки.
 */
export function MailingLaunchSafetyCard(props: MailingLaunchGateInput) {
  const gate = computeMailingLaunchGate(props);

  return (
    <Card data-testid="launch-safety-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4 text-primary" />
          Безопасный запуск
          <Badge variant={gate.allowed ? "secondary" : "outline"}>
            {props.mode === "test" ? "тестовая отправка" : "реальная база"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {gate.allowed ? (
          <p className="text-sm text-emerald-600">Все проверки пройдены.</p>
        ) : (
          <Alert variant="destructive">
            <AlertDescription>
              <ul className="list-disc space-y-1 pl-4 text-sm" data-testid="launch-blockers">
                {gate.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        <p className="text-xs text-muted-foreground">
          По умолчанию письма уходят только на выбранные вручную seed-адреса. Реальная база
          открывается после успешного SMTP-теста отправителя, наличия ссылки отписки, корректных
          переменных и дедупликации базы.
        </p>
      </CardContent>
    </Card>
  );
}
