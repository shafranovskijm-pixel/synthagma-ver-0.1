import { Card, CardContent } from "@/components/ui/card";
import { Briefcase } from "lucide-react";

interface Props { organizationId: string }

export function OrgContractsManager(_props: Props) {
  return (
    <Card>
      <CardContent className="p-8 text-center text-muted-foreground space-y-2">
        <Briefcase className="w-10 h-10 mx-auto text-primary/60" />
        <p className="font-medium">Договоры через документооборот — следующий релиз</p>
        <p className="text-sm">
          База данных и edge-функция готовы. UI отправки на подписание из шаблонов и связь «КП → Договор» появятся в следующем шаге.
        </p>
      </CardContent>
    </Card>
  );
}
