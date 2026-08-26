import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SigmaLogo } from "@/components/ui/SigmaLogo";

export default function DemoStudentLogin() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-4 max-w-md">
        <SigmaLogo size="md" />
        <ShieldAlert className="w-9 h-9 text-amber-600 mx-auto" />
        <h1 className="text-xl font-bold">Демо-кабинет временно недоступен</h1>
        <p className="text-sm text-muted-foreground">
          Мы обновляем безопасный режим демонстрации. Обычный вход и данные вашей организации не затронуты.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-2">
          <Button asChild>
            <Link to="/login">Перейти ко входу</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/help">Открыть инструкции</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
