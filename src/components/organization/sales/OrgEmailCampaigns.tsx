import { CampaignsManager } from "@/components/admin/broadcast/CampaignsManager";
import { useOrgSmtp } from "@/hooks/useOrgSmtp";
import { Card, CardContent } from "@/components/ui/card";
import { Mail } from "lucide-react";

interface Props {
  organizationId: string;
  onGoToSmtp: () => void;
}

export function OrgEmailCampaigns({ organizationId, onGoToSmtp }: Props) {
  const { settings, loading } = useOrgSmtp(organizationId);

  if (loading) return <p className="text-sm text-muted-foreground">Загрузка...</p>;

  if (!settings) {
    return (
      <Card className="border-orange-500/30 bg-orange-500/5">
        <CardContent className="p-6 text-center space-y-3">
          <Mail className="w-10 h-10 mx-auto text-orange-500" />
          <h3 className="font-semibold">Сначала настройте SMTP</h3>
          <p className="text-sm text-muted-foreground">
            Чтобы запускать email-кампании, подключите свой SMTP-сервер во вкладке «SMTP».
          </p>
          <button onClick={onGoToSmtp} className="text-primary underline text-sm">
            Перейти к настройкам SMTP →
          </button>
        </CardContent>
      </Card>
    );
  }

  return <CampaignsManager scope="org" organizationId={organizationId} />;
}
