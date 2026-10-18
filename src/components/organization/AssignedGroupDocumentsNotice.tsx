import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function AssignedGroupDocumentsNotice() {
  return <Card><CardContent className="space-y-3 p-4">
    <p className="text-sm text-muted-foreground">Документы учеников доступны в назначенных вам группах.</p>
    <Button variant="outline" size="sm" asChild>
      <a href="/organization?tab=students&studentsView=groups">Перейти к группам</a>
    </Button>
  </CardContent></Card>;
}
