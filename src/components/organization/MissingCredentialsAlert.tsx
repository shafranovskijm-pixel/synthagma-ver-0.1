import { useState, useMemo } from "react";
import { AlertTriangle, KeyRound, X, Users, Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Student } from "@/types/shared";

interface MissingCredentialsAlertProps {
  students: Student[];
  isCreating: boolean;
  onCreateCredentials: (userIds: string[], sendEmails?: boolean) => Promise<void>;
}

export function MissingCredentialsAlert({ 
  students, 
  isCreating, 
  onCreateCredentials 
}: MissingCredentialsAlertProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [sendEmails, setSendEmails] = useState(true);

  const studentsWithoutCredentials = useMemo(() => {
    return students.filter(s => !s.login || !s.generated_password);
  }, [students]);

  const studentsWithEmail = useMemo(() => {
    return studentsWithoutCredentials.filter(s => s.email);
  }, [studentsWithoutCredentials]);

  const count = studentsWithoutCredentials.length;
  const emailCount = studentsWithEmail.length;

  if (isDismissed || count === 0) {
    return null;
  }

  const handleCreate = async () => {
    const userIds = studentsWithoutCredentials.map(s => s.user_id);
    await onCreateCredentials(userIds, sendEmails);
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
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>
              {count} {count === 1 ? "ученик не имеет" : count < 5 ? "ученика не имеют" : "учеников не имеют"} логина и пароля для входа
            </span>
          </div>
          
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {emailCount > 0 && (
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="send-emails" 
                  checked={sendEmails} 
                  onCheckedChange={(checked) => setSendEmails(checked === true)}
                  disabled={isCreating}
                />
                <Label 
                  htmlFor="send-emails" 
                  className="text-sm text-muted-foreground cursor-pointer flex items-center gap-1"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Отправить на email ({emailCount})
                </Label>
              </div>
            )}
            
            <Button 
              size="sm" 
              variant="outline"
              className="shrink-0 gap-2 border-warning/50 hover:bg-warning/20"
              onClick={handleCreate}
              disabled={isCreating}
            >
              {isCreating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              {isCreating ? "Создание..." : "Создать логины"}
            </Button>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
}
