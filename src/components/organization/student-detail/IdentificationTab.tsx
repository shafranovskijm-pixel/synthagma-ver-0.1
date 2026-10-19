import { IdentificationPhoto, type useIdentificationState } from "@/hooks/useIdentificationMedia";
import { identificationAssuranceLabel } from "@/lib/identification/contract";
import {
  Video, Camera, CheckCircle2, XCircle, Shield, History, User, Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { getStatusBadge } from "./StatusBadge";

interface IdentificationTabProps {
  h: any;
}

export function IdentificationTab({ h }: IdentificationTabProps) {
  return (
    <div className="space-y-6">
      <div className="bg-card rounded-2xl border border-border p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><Video className="w-5 h-5 text-primary" />Журнал идентификации личности</h3>
        {h.identification.state?.historyTruncated && <p className="text-xs text-muted-foreground mb-3">Показаны последние записи; более ранняя история в этот список не вошла.</p>}
        {h.identification.loading ? <p className="text-sm text-muted-foreground">Загрузка статуса…</p> : h.identification.error ? <p className="text-sm text-destructive">Статус недоступен. <Button variant="link" onClick={() => void h.identification.refresh()}>Повторить</Button></p> : h.verifications.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground"><Camera className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Идентификация не пройдена</p></div>
        ) : (
          <div className="space-y-4">
            {h.verifications.map((v: any) => (
              <div key={v.id} className="flex items-start gap-4 p-4 rounded-xl bg-muted/50">
                <IdentificationPhoto scope={h.identification.scope} record={v.canonical || null} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">{getStatusBadge(v.status)}<span className="text-xs text-muted-foreground">{h.formatDate(v.created_at)}</span></div>
                  {v.canonical && <p className="text-xs text-muted-foreground">{identificationAssuranceLabel(v.canonical)}</p>}
                  {v.verified_at && <p className="text-sm text-muted-foreground">Проверено: {h.formatDate(v.verified_at)}</p>}
                  {v.rejection_reason && <p className="text-sm text-destructive mt-1">Причина: {v.rejection_reason}</p>}
                </div>
                {v.status === "pending" && (
                  <div className="flex gap-2">
                    <Button size="sm" disabled={h.identification.busy || !v.canonical?.capabilities.canReview || v.canonical?.assurance !== "submitted"} className="rounded-lg gap-1" onClick={() => h.handleVerifyIdentification(v.id, "verify")}><CheckCircle2 className="w-4 h-4" />Подтвердить</Button>
                    <Button size="sm" disabled={h.identification.busy || !v.canonical?.capabilities.canReject} variant="destructive" className="rounded-lg gap-1" onClick={() => { const reason = prompt("Причина отклонения:"); if (reason) h.handleVerifyIdentification(v.id, "reject", reason); }}><XCircle className="w-4 h-4" />Отклонить</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual Verification */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${h.latestVerification?.status === "verified" ? "bg-green-500/10" : "bg-muted"}`}>
              {h.latestVerification?.status === "verified" ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Video className="w-5 h-5 text-muted-foreground" />}
            </div>
            <div>
              <Label htmlFor="manual-verification" className="font-medium cursor-pointer">Видеоидентификация пройдена</Label>
              <p className="text-xs text-muted-foreground">Ручная отметка сотрудника — без фотографии</p>
            </div>
          </div>
          <Checkbox id="manual-verification" disabled={h.identification.loading || h.identification.error || h.identification.busy || (h.latestVerification?.status === "verified" ? !h.latestVerification?.canonical?.capabilities.canReset : !h.identification.state?.capabilities.canReview)} checked={h.latestVerification?.status === "verified"} onCheckedChange={(checked) => h.handleManualVerification(!!checked)} className="h-5 w-5" />
        </div>
      </div>

      {/* PEP Agreement */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><Shield className="w-5 h-5 text-primary" />Соглашение об использовании ПЭП</h3>
        {!h.latestPepAgreement ? (
          <div className="text-center py-6 text-muted-foreground">
            <Shield className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>Ученик ещё не принял соглашение об использовании простой электронной подписи</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <span className="font-medium">Принято</span>
              <span className="text-xs text-muted-foreground">версия {h.latestPepAgreement.agreement_version}</span>
            </div>
            <div className="text-sm text-muted-foreground">Принято: {h.formatDate(h.latestPepAgreement.accepted_at)}</div>
            {h.latestPepAgreement.ip_address && <div className="text-xs text-muted-foreground">IP: {h.latestPepAgreement.ip_address}</div>}
            {h.latestPepAgreement.user_agent && <div className="text-xs text-muted-foreground truncate">UA: {h.latestPepAgreement.user_agent}</div>}
          </div>
        )}
      </div>

      {/* Consent History */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><History className="w-5 h-5 text-primary" />История согласий на обработку ПД</h3>
        {h.consents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground"><Shield className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Нет подписанных согласий</p></div>
        ) : (
          <div className="space-y-3">
            {h.consents.map((c: any) => (
              <div key={c.id} className="p-3 rounded-xl bg-muted/50 space-y-1">
                <div className="flex items-center gap-2">
                  {getStatusBadge(c.status)}
                  {c.policy_version && <span className="text-xs text-muted-foreground">{c.policy_version}</span>}
                  <span className="text-xs text-muted-foreground ml-auto">{h.formatDate(c.signed_at || c.created_at)}</span>
                </div>
                {(c.ip_address || c.user_agent) && (
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {c.ip_address && <div>IP: {c.ip_address}</div>}
                    {c.user_agent && <div className="truncate">UA: {c.user_agent}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
