import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OrgDocumentsManager } from "@/components/organization/OrgDocumentsManager";

interface DocumentsTabProps {
  organizationId: string | null;
}

export function DocumentsTab({ organizationId }: DocumentsTabProps) {
  const [activeDocTab, setActiveDocTab] = useState("org");

  if (!organizationId) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Организация не найдена
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeDocTab} onValueChange={setActiveDocTab}>
        <TabsList className="grid w-full grid-cols-1">
          <TabsTrigger value="org">Документы организации</TabsTrigger>
        </TabsList>
        
        <TabsContent value="org" className="mt-4">
          <OrgDocumentsManager organizationId={organizationId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
