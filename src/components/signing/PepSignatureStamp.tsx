import { CheckCircle2, ShieldCheck } from "lucide-react";

interface PepSignatureStampProps {
  fullName: string;
  email: string;
  signedAt: string | Date;
  ip?: string | null;
  documentHash?: string | null;
  agreementId?: string | null;
}

/**
 * Визуальная плашка подтверждения подписи документа ПЭП.
 * Стиль — лаконичный, премиум, в духе «Госуслуг».
 */
export function PepSignatureStamp({
  fullName,
  email,
  signedAt,
  ip,
  documentHash,
  agreementId,
}: PepSignatureStampProps) {
  const date = typeof signedAt === "string" ? new Date(signedAt) : signedAt;
  const formatted = date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  });
  const shortHash = documentHash ? `${documentHash.slice(0, 8)}…${documentHash.slice(-6)}` : "—";
  const shortAgreement = agreementId ? agreementId.slice(0, 8).toUpperCase() : "—";

  return (
    <div
      className="my-6 rounded-xl border-2 p-5 max-w-md"
      style={{
        borderColor: "hsl(var(--primary))",
        background: "linear-gradient(135deg, hsl(var(--primary) / 0.06), hsl(var(--primary) / 0.02))",
      }}
    >
      <div className="flex items-center gap-2 mb-3 pb-2 border-b" style={{ borderColor: "hsl(var(--primary) / 0.3)" }}>
        <CheckCircle2 className="w-5 h-5 text-primary" />
        <div className="font-bold text-sm uppercase tracking-wide text-primary">
          Документ подписан
        </div>
        <ShieldCheck className="w-4 h-4 ml-auto text-primary opacity-70" />
      </div>
      <div className="text-xs text-muted-foreground mb-2">Простой электронной подписью (63-ФЗ)</div>
      <dl className="text-xs space-y-1.5">
        <div className="grid grid-cols-[110px_1fr] gap-2">
          <dt className="text-muted-foreground">ФИО:</dt>
          <dd className="font-medium text-foreground">{fullName}</dd>
        </div>
        <div className="grid grid-cols-[110px_1fr] gap-2">
          <dt className="text-muted-foreground">Email:</dt>
          <dd className="text-foreground">{email}</dd>
        </div>
        <div className="grid grid-cols-[110px_1fr] gap-2">
          <dt className="text-muted-foreground">Дата:</dt>
          <dd className="text-foreground">{formatted} (МСК)</dd>
        </div>
        {ip && (
          <div className="grid grid-cols-[110px_1fr] gap-2">
            <dt className="text-muted-foreground">IP:</dt>
            <dd className="font-mono text-foreground">{ip}</dd>
          </div>
        )}
        <div className="grid grid-cols-[110px_1fr] gap-2">
          <dt className="text-muted-foreground">Соглашение:</dt>
          <dd className="font-mono text-foreground">PEP-{shortAgreement}</dd>
        </div>
        <div className="grid grid-cols-[110px_1fr] gap-2">
          <dt className="text-muted-foreground">Хеш SHA-256:</dt>
          <dd className="font-mono text-foreground break-all">{shortHash}</dd>
        </div>
      </dl>
    </div>
  );
}
