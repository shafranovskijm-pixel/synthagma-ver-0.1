import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface StudentConfirmDialogsProps {
  showSendConfirm: boolean; setShowSendConfirm: (v: boolean) => void;
  showLoginsConfirm: boolean; setShowLoginsConfirm: (v: boolean) => void;
  selectedCount: number;
  getSelectedUserIds: () => string[];
  onBulkSendCredentials?: (ids: string[]) => Promise<void>;
  onBulkCreateCredentials?: (ids: string[]) => Promise<void>;
}

export function StudentConfirmDialogs(props: StudentConfirmDialogsProps) {
  return (
    <>
      <AlertDialog open={props.showSendConfirm} onOpenChange={props.setShowSendConfirm}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Отправка данных на почту</AlertDialogTitle><AlertDialogDescription>Вы действительно хотите отправить данные для входа на почту <strong>{props.selectedCount}</strong> {props.selectedCount === 1 ? "ученику" : "ученикам"}?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Нет</AlertDialogCancel><AlertDialogAction onClick={() => { props.onBulkSendCredentials?.(props.getSelectedUserIds()); props.setShowSendConfirm(false); }}>Да, отправить</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={props.showLoginsConfirm} onOpenChange={props.setShowLoginsConfirm}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Генерация логинов и паролей</AlertDialogTitle><AlertDialogDescription>Будут созданы только недостающие логины и пароли для <strong>{props.selectedCount}</strong> выбранных учеников. Ученики, у которых уже есть логин и пароль, останутся без изменений.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Нет</AlertDialogCancel><AlertDialogAction onClick={() => { props.onBulkCreateCredentials?.(props.getSelectedUserIds()); props.setShowLoginsConfirm(false); }}>Да, создать</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </>
  );
}
