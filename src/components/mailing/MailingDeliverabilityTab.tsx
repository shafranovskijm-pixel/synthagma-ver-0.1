import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DomainReputationCheck } from "@/components/admin/broadcast/DomainReputationCheck";
import { Gauge } from "lucide-react";
import { useOrgSmtp } from "@/hooks/useOrgSmtp";

interface Props {
  organizationId: string | null;
}

export function MailingDeliverabilityTab({ organizationId }: Props) {
  const { settings } = useOrgSmtp(organizationId);

  return (
    <div className="space-y-4">
      <DomainReputationCheck />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4 text-primary" />
            Лимиты и throttling
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {settings ? (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="truncate">{settings.from_email}</span>
              <span className="text-muted-foreground">
                до {settings.provider_daily_limit} писем/сутки
                {settings.safe_warmup_enabled ? " · прогрев включён" : ""}
              </span>
            </div>
          ) : (
            <p className="text-muted-foreground">Отправитель не подключён.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Отписки и bounce-адреса попадают в suppression-список и исключаются из будущих
            рассылок. Ни одна настройка не гарантирует 100% доставку — результат зависит от
            репутации домена, качества базы и политики принимающей стороны.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
