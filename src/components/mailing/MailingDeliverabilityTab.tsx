import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DomainReputationCheck } from "@/components/admin/broadcast/DomainReputationCheck";
import { SuppressionListManager } from "@/components/admin/broadcast/SuppressionListManager";
import { Gauge } from "lucide-react";
import type { MailingSender } from "@/hooks/useMailingSenders";

interface Props {
  organizationId: string | null;
  senders: MailingSender[];
}

export function MailingDeliverabilityTab({ organizationId, senders }: Props) {
  return (
    <div className="space-y-4">
      <DomainReputationCheck />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4 text-primary" />
            Лимиты и throttling по аккаунтам
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {senders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Отправители не подключены.</p>
          ) : (
            senders.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <span className="truncate">{s.from_email}</span>
                <span className="text-muted-foreground">{s.daily_limit} писем/сутки</span>
              </div>
            ))
          )}
          <p className="text-xs text-muted-foreground">
            Рассылка распределяется по суточным лимитам аккаунтов. Ни одна настройка не гарантирует
            100% доставку: результат зависит от репутации домена, качества базы и политики
            принимающей стороны.
          </p>
        </CardContent>
      </Card>

      <SuppressionListManager scope="org" organizationId={organizationId} />
    </div>
  );
}
