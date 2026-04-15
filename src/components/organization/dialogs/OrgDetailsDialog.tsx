import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {} from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface Organization {
  id: string;
  name: string;
  email: string;
  contact_name: string | null;
  phone: string | null;
  inn: string | null;
  ai_enabled: boolean;
  created_at: string;
  studentsCount?: number;
  coursesCount?: number;
}

interface Student {
  id: string;
  user_id: string;
  name: string;
  email: string;
}

interface OrgDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization: Organization | null;
  students: Student[];
  isLoading: boolean;
}

export function OrgDetailsDialog({
  open,
  onOpenChange,
  organization,
  students,
  isLoading }: OrgDetailsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-2xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{organization?.name}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <SigmaSpinner size="lg" />
          </div>
        ) : organization && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-secondary/30 rounded-xl p-4">
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{organization.email}</p>
              </div>
              <div className="bg-secondary/30 rounded-xl p-4">
                <p className="text-sm text-muted-foreground">ИНН</p>
                <p className="font-medium">{organization.inn || "—"}</p>
              </div>
              <div className="bg-secondary/30 rounded-xl p-4">
                <p className="text-sm text-muted-foreground">Контактное лицо</p>
                <p className="font-medium">{organization.contact_name || "—"}</p>
              </div>
              <div className="bg-secondary/30 rounded-xl p-4">
                <p className="text-sm text-muted-foreground">Телефон</p>
                <p className="font-medium">{organization.phone || "—"}</p>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-3">Ученики ({students.length})</h3>
              {students.length === 0 ? (
                <p className="text-muted-foreground text-sm">Нет учеников</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-auto">
                  {students.map(s => (
                    <div key={s.id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-xl">
                      <div>
                        <div className="font-medium">{s.name}</div>
                        <div className="text-sm text-muted-foreground">{s.email}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
