import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Crown, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  organizationId: string;
  currentOwnerId: string;
}

interface Candidate {
  user_id: string;
  display_name: string;
  role: string;
}

/**
 * Передача владения организацией.
 * - Только текущий владелец (роль 'organization' в user_roles) может выполнить.
 * - Передаём profile.organization_id новому владельцу + повышаем его user_roles.role до 'organization'.
 * - Текущему владельцу понижаем роль до 'admin' (org_staff role) и убираем глобальную роль 'organization'.
 */
export function OwnershipTransfer({ organizationId, currentOwnerId }: Props) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("org_staff")
        .select("user_id, display_name, role")
        .eq("organization_id", organizationId)
        .neq("user_id", currentOwnerId)
        .in("role", ["admin", "school_editor"]);
      setCandidates((data as Candidate[]) || []);
    };
    load();
  }, [organizationId, currentOwnerId]);

  const handleTransfer = async () => {
    if (!selectedId) return;
    setTransferring(true);
    try {
      const { error } = await supabase.functions.invoke("transfer-org-ownership", {
        body: { organization_id: organizationId, new_owner_user_id: selectedId },
      });
      if (error) throw error;
      toast.success("Владение успешно передано. Перезайдите в систему.");
      setConfirmOpen(false);
      setTimeout(() => { window.location.href = "/"; }, 1500);
    } catch (err: any) {
      toast.error("Ошибка передачи: " + (err?.message || err));
    } finally {
      setTransferring(false);
    }
  };

  const selectedCandidate = candidates.find((c) => c.user_id === selectedId);

  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Crown className="h-5 w-5 text-warning" />
          Передача владения организацией
        </CardTitle>
        <CardDescription>
          Передайте полные права на организацию другому сотруднику. После передачи вы станете администратором.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Нет подходящих кандидатов. Сначала добавьте сотрудника с ролью «Администратор» или «Редактор школы».
          </p>
        ) : (
          <>
            <div className="flex gap-2">
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Выберите нового владельца" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.user_id} value={c.user_id}>
                      {c.display_name} — {c.role === "admin" ? "Администратор" : "Редактор школы"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="destructive"
                disabled={!selectedId}
                onClick={() => setConfirmOpen(true)}
              >
                Передать владение
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              <AlertTriangle className="inline w-3 h-3 mr-1" />
              Действие необратимо. Будет создана запись в журнале аудита.
            </p>
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Подтвердите передачу владения</AlertDialogTitle>
            <AlertDialogDescription>
              Вы передаёте полные права на организацию пользователю{" "}
              <strong>{selectedCandidate?.display_name}</strong>.
              <br /><br />
              После этого:
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Новый владелец получит полный доступ ко всем разделам</li>
                <li>Ваша роль изменится на «Администратор»</li>
                <li>Вы потеряете право управлять биллингом и удалять организацию</li>
                <li>Вас принудительно перенаправит на главную</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={transferring}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTransfer}
              disabled={transferring}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {transferring ? "Передаём..." : "Подтвердить передачу"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
