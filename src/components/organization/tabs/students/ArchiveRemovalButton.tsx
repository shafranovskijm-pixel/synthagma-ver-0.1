import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export function ArchiveRemovalButton({ studentName, onRemove }: { studentName: string; onRemove: () => unknown | Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { if (await onRemove() !== false) setOpen(false); } finally { setBusy(false); }
  };
  return <>
    <Button variant="outline" size="sm" className="rounded-lg text-destructive" onClick={() => setOpen(true)} title="Удалить из архива" aria-label={`Удалить из архива: ${studentName}`}><Trash2 className="w-4 h-4" /></Button>
    <AlertDialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <AlertDialogContent><AlertDialogHeader>
        <AlertDialogTitle>Удалить ученика из архива?</AlertDialogTitle>
        <AlertDialogDescription>Ученик «{studentName}» исчезнет из списка архива и текущих счётчиков учеников. История обучения, результаты тестов и выданные документы сохранятся.</AlertDialogDescription>
      </AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel>
        <Button variant="destructive" onClick={() => void submit()} disabled={busy}>{busy ? "Удаление…" : "Удалить из архива"}</Button>
      </AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </>;
}
