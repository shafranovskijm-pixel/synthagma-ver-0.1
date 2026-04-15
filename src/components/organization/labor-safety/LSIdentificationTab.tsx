import React from "react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Camera, Video, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import type { LSVerificationRecord } from "@/hooks/useLaborSafetyStudent";

function getStatusBadge(status: string) {
  switch (status) {
    case "verified": case "signed": return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Подтверждено</Badge>;
    case "rejected": return <Badge variant="destructive">Отклонено</Badge>;
    case "pending": return <Badge variant="outline">На проверке</Badge>;
    default: return <Badge variant="secondary">{status}</Badge>;
  }
}

interface LSIdentificationTabProps {
  hasProfile: boolean;
  verifications: LSVerificationRecord[];
  latestVerification: LSVerificationRecord | null;
  handleManualVerification: (verified: boolean) => void;
}

export function LSIdentificationTab({ hasProfile, verifications, latestVerification, handleManualVerification }: LSIdentificationTabProps) {
  if (!hasProfile) {
    return <div className="text-center py-12 text-muted-foreground"><Camera className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Сначала создайте учётную запись</p></div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-2xl border border-border p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><Video className="w-5 h-5 text-primary" />Журнал идентификации личности</h3>
        {verifications.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground"><Camera className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Идентификация не пройдена</p></div>
        ) : (
          <div className="space-y-4">
            {verifications.map(v => (
              <div key={v.id} className="flex items-start gap-4 p-4 rounded-xl bg-muted/50">
                {v.photo_url && <img src={v.photo_url} alt="Verification" className="w-20 h-20 rounded-xl object-cover" />}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {getStatusBadge(v.status)}
                    <span className="text-xs text-muted-foreground">{format(new Date(v.created_at), "d MMMM yyyy, HH:mm", { locale: ru })}</span>
                  </div>
                  {v.verified_at && <p className="text-sm text-muted-foreground">Проверено: {format(new Date(v.verified_at), "d MMMM yyyy, HH:mm", { locale: ru })}</p>}
                  {v.rejection_reason && <p className="text-sm text-destructive mt-1">Причина: {v.rejection_reason}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-card rounded-2xl border border-border p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${latestVerification?.status === "verified" ? "bg-green-500/10" : "bg-muted"}`}>
              {latestVerification?.status === "verified" ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Video className="w-5 h-5 text-muted-foreground" />}
            </div>
            <div><Label className="font-medium cursor-pointer">Видеоидентификация пройдена</Label><p className="text-xs text-muted-foreground">Отметить вручную</p></div>
          </div>
          <Checkbox checked={latestVerification?.status === "verified"} onCheckedChange={checked => handleManualVerification(!!checked)} className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
