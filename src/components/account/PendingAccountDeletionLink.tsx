import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { loadPendingDeletion, pendingDeletionEvent } from "./pendingDeletion";

export function PendingAccountDeletionLink() {
  const [pending, setPending] = useState(() => !!loadPendingDeletion());
  useEffect(() => {
    const update = () => setPending(!!loadPendingDeletion());
    window.addEventListener("storage", update);
    window.addEventListener(pendingDeletionEvent, update);
    return () => { window.removeEventListener("storage", update); window.removeEventListener(pendingDeletionEvent, update); };
  }, []);
  return pending ? <p className="text-sm py-3"><Link to="/account/deletion-status" className="underline underline-offset-4">Проверить результат удаления аккаунта</Link></p> : null;
}
