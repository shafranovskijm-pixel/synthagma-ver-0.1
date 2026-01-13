// Temporary stub - full component needs to be restored from version control
// This is a placeholder to fix build errors

import { Loader2 } from "lucide-react";

interface CompaniesManagerProps {
  organizationId: string;
}

export function CompaniesManager({ organizationId }: CompaniesManagerProps) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-center text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
        <p>Компонент временно недоступен</p>
        <p className="text-sm">Восстановите из истории версий</p>
      </div>
    </div>
  );
}
