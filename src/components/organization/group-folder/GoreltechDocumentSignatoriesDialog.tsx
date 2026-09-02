import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SIGNABLE_GROUP_DOCUMENTS,
  type GroupDocumentSignatories,
  type GroupDocumentSignatory,
} from "@/lib/group-docs/signatories";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: GroupDocumentSignatories;
  defaultSignatory: GroupDocumentSignatory;
  onChange: (value: GroupDocumentSignatories) => void;
  onConfirm: () => void;
}

export function GoreltechDocumentSignatoriesDialog({
  open,
  onOpenChange,
  value,
  defaultSignatory,
  onChange,
  onConfirm,
}: Props) {
  const update = (
    type: (typeof SIGNABLE_GROUP_DOCUMENTS)[number]["type"],
    field: keyof GroupDocumentSignatory,
    nextValue: string,
  ) => {
    onChange({
      ...value,
      [type]: {
        position: value[type]?.position ?? defaultSignatory.position,
        name: value[type]?.name ?? defaultSignatory.name,
        [field]: nextValue,
      },
    });
  };

  const applyDefaultToAll = () => {
    onChange(Object.fromEntries(
      SIGNABLE_GROUP_DOCUMENTS.map(({ type }) => [type, { ...defaultSignatory }]),
    ) as GroupDocumentSignatories);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Подписанты документов ГОРЭЛТЕХ</DialogTitle>
          <DialogDescription>
            Проверьте должность и ФИО для каждого документа перед формированием.
            В оригиналах ФИО в двух приказах оставлено пустым, а у пропуска подписант не указан.
            Пустое поле можно подтвердить — в Word останется место для ручного заполнения.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {SIGNABLE_GROUP_DOCUMENTS.map(({ type, title }) => {
            const signatory = value[type] ?? defaultSignatory;
            return (
              <div key={type} className="rounded-xl border border-border p-3">
                <div className="mb-2 text-sm font-medium">{title}</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`signatory-position-${type}`}>Должность</Label>
                    <Input
                      id={`signatory-position-${type}`}
                      value={signatory.position}
                      maxLength={200}
                      onChange={(event) => update(type, "position", event.target.value)}
                      placeholder="Генеральный директор"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`signatory-name-${type}`}>ФИО</Label>
                    <Input
                      id={`signatory-name-${type}`}
                      value={signatory.name}
                      maxLength={200}
                      onChange={(event) => update(type, "name", event.target.value)}
                      placeholder="Фамилия Имя Отчество"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={applyDefaultToAll}>
            Руководитель организации — во все документы
          </Button>
          <Button type="button" onClick={onConfirm}>
            Подтвердить подписантов
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
