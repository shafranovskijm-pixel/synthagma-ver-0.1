import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface StudentConfirmDialogsProps {
  showSendConfirm: boolean; setShowSendConfirm: (v: boolean) => void;
  showLoginsConfirm: boolean; setShowLoginsConfirm: (v: boolean) => void;
  showRemindConfirm: boolean; setShowRemindConfirm: (v: boolean) => void;
  showDeleteConfirm: boolean; setShowDeleteConfirm: (v: boolean) => void;
  selectedCount: number;
  getSelectedUserIds: () => string[];
  onBulkSendCredentials?: (ids: string[]) => Promise<void>;
  onBulkCreateCredentials?: (ids: string[]) => Promise<void>;
  onBulkSendDocReminders?: () => Promise<void>;
  onShowBulkDeleteConfirm?: (ids: string[]) => void;
}

export function StudentConfirmDialogs(props: StudentConfirmDialogsProps) {
  return (
    <>
      <AlertDialog open={props.showSendConfirm} onOpenChange={props.setShowSendConfirm}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Отправка данных на почту</AlertDialogTitle><AlertDialogDescription>Вы действительно хотите отправить данные для входа на почту <strong>{props.selectedCount}</strong> {props.selectedCount === 1 ? "ученику" : "ученикам"}?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Нет</AlertDialogCancel><AlertDialogAction onClick={() => { props.onBulkSendCredentials?.(props.getSelectedUserIds()); props.setShowSendConfirm(false); }}>Да, отправить</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={props.showLoginsConfirm} onOpenChange={props.setShowLoginsConfirm}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Генерация логинов и паролей</AlertDialogTitle><AlertDialogDescription>Создать логины и пароли для <strong>{props.selectedCount}</strong> выбранных учеников? Существующие данные будут перезаписаны.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Нет</AlertDialogCancel><AlertDialogAction onClick={() => { props.onBulkCreateCredentials?.(props.getSelectedUserIds()); props.setShowLoginsConfirm(false); }}>Да, создать</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={props.showRemindConfirm} onOpenChange={props.setShowRemindConfirm}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Напоминание о документах</AlertDialogTitle><AlertDialogDescription>Отправить напоминание всем ученикам о загрузке недостающих документов?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Нет</AlertDialogCancel><AlertDialogAction onClick={() => { props.onBulkSendDocReminders?.(); props.setShowRemindConfirm(false); }}>Да, отправить</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={props.showDeleteConfirm} onOpenChange={props.setShowDeleteConfirm}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить учеников?</AlertDialogTitle><AlertDialogDescription>Вы уверены, что хотите удалить <strong>{props.selectedCount}</strong> выбранных учеников? Это действие необратимо.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Нет</AlertDialogCancel><AlertDialogAction onClick={() => { props.onShowBulkDeleteConfirm?.(props.getSelectedUserIds()); props.setShowDeleteConfirm(false); }} className="bg-destructive text-destructive-foreground">Да, удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </>
  );
}
