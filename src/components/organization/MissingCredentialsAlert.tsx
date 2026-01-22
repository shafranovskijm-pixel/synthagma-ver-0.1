import { useState, useMemo } from "react";
import { AlertTriangle, KeyRound, X, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Student } from "@/types/shared";

interface MissingCredentialsAlertProps {
  students: Student[];
  isCreating: boolean;
  onCreateCredentials: (userIds: string[]) => Promise<void>;
}

export function MissingCredentialsAlert({ 
  students, 
  isCreating, 
  onCreateCredentials 
}: MissingCredentialsAlertProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  const studentsWithoutCredentials = useMemo(() => {
    return students.filter(s => !s.login || !s.generated_password);
  }, [students]);

  const count = studentsWithoutCredentials.length;

  if (isDismissed || count === 0) {
    return null;
  }

  const handleCreate = async () => {
    const userIds = studentsWithoutCredentials.map(s => s.user_id);
    await onCreateCredentials(userIds);
  };

  return (
    <Alert className="mb-4 border-warning/50 bg-warning/10">
      <AlertTriangle className="h-4 w-4 text-warning" />
      <AlertTitle className="text-warning flex items-center justify-between">
        <span>Ученики без учётных данных</span>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-6 w-6 -mr-2" 
          onClick={() => setIsDismissed(true)}
        >
          <X className="h-4 w-4" />
        </Button>
      </AlertTitle>
      <AlertDescription className="mt-2">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>
              {count} {count === 1 ? "ученик не имеет" : count < 5 ? "ученика не имеют" : "учеников не имеют"} логина и пароля для входа
            </span>
          </div>
          <Button 
            size="sm" 
            variant="outline"
            className="shrink-0 gap-2 border-warning/50 hover:bg-warning/20"
            onClick={handleCreate}
            disabled={isCreating}
          >
            <KeyRound className="h-4 w-4" />
            {isCreating ? "Создание..." : "Создать логины"}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
