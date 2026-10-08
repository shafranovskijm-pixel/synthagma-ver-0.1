import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isDeletionReceipt } from "@/components/account/accountDeletion";
import { deletionCleanupEvent, getDeletionCleanupOutcome } from "@/components/account/clearDeletedAccountSession";
import { PendingAccountDeletionLink } from "@/components/account/PendingAccountDeletionLink";

/** Presentation only: visiting a completion URL never mutates an account or its session. */
export default function AccountDeletionComplete() {
  const location = useLocation();
  const receipt: unknown = location.state?.deletionReceipt;
  const verified = isDeletionReceipt(receipt);
  const requestId = verified ? receipt.requestId : "";
  const [localOutcome, setLocalOutcome] = useState(() => getDeletionCleanupOutcome(requestId));
  useEffect(() => {
    const update = () => setLocalOutcome(getDeletionCleanupOutcome(requestId));
    update(); window.addEventListener(deletionCleanupEvent, update);
    return () => window.removeEventListener(deletionCleanupEvent, update);
  }, [requestId]);

  return <main className="min-h-screen bg-background px-4 py-12"><Card className="mx-auto max-w-xl"><CardHeader><CardTitle>{verified ? "Аккаунт удалён" : "Нет подтверждения удаления"}</CardTitle></CardHeader><CardContent className="space-y-4">
    {verified ? <><p>Сервер подтвердил удаление вашей учётной записи.</p><p className="text-sm break-all text-muted-foreground">Номер операции: {receipt.requestId}<br />{new Date(receipt.completedAt).toLocaleString("ru-RU")}</p></> : <p>Открытие этой страницы не удаляет аккаунт. Проверить условия удаления можно в настройках своего аккаунта.</p>}
    {verified && localOutcome === false && <p role="alert">Завершение сессии или очистка локальных данных на этом устройстве не подтверждены. Откройте проверку результата, чтобы повторить очистку.</p>}
    <PendingAccountDeletionLink />
    <Button asChild><Link to={verified ? "/login" : "/account"}>{verified ? "К странице входа" : "Настройки аккаунта"}</Link></Button>
  </CardContent></Card></main>;
}
