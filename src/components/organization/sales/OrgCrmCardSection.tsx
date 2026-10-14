import { Button } from "@/components/ui/button";
import { useOrgCrmAccess } from "@/hooks/useOrgCrmAccess";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import { OrgCrmContextPanel } from "./OrgCrmContextPanel";

interface Props {
  organizationId: string;
  entityType: "company" | "student";
  entityId: string;
  entityName: string;
}

/** Mount CRM data only after the source card, role and tariff are confirmed. */
export function OrgCrmCardSection(props: Props) {
  const { can, loading, error } = useStaffPermissions();
  const canRead = can("sales.read") && can(props.entityType === "student" ? "students.read" : "companies.read");
  const plan = useOrgCrmAccess(!loading && !error && canRead && props.entityId ? props.organizationId : null);

  if (loading) return <p role="status" className="rounded-xl border p-6">Проверка доступа к CRM…</p>;
  if (error) return <p role="alert" className="rounded-xl border p-6">Не удалось подтвердить права доступа. Повторите проверку прав или обновите страницу.</p>;
  if (!props.organizationId || !props.entityId || !canRead) {
    return <p role="alert" className="rounded-xl border p-6">Нет доступа к CRM этой карточки.</p>;
  }
  if (plan.loading) return <p role="status" className="rounded-xl border p-6">Проверка доступности CRM по тарифу…</p>;
  if (plan.error) return <div role="alert" className="space-y-3 rounded-xl border p-6">
    <p>{plan.error}</p><Button variant="outline" onClick={() => { void plan.refresh(); }}>Повторить проверку</Button>
  </div>;
  if (!plan.enabled) return <p role="status" className="rounded-xl border p-6">CRM доступна с тарифа «Стандарт». Обратитесь к администратору организации.</p>;

  return <OrgCrmContextPanel key={`${props.organizationId}:${props.entityType}:${props.entityId}`} {...props}
    canWrite={can("sales.write")} canOpenDocuments={can("documents.read")} />;
}
