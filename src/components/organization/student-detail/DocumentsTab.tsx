import { FileText, Eye, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DocumentsTabProps {
  h: any;
}

export function DocumentsTab({ h }: DocumentsTabProps) {
  return (
    <div className="bg-card rounded-2xl border border-border p-6">
      <h3 className="font-semibold mb-4 flex items-center gap-2"><FileText className="w-5 h-5 text-primary" />Загруженные документы ({h.identityDocs.length})</h3>
      {h.identityDocs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground"><FileText className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Нет загруженных документов</p></div>
      ) : (
        <div className="space-y-3">
          {h.identityDocs.map((doc: any) => (
            <div key={doc.id} className="flex items-center justify-between p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><FileText className="w-5 h-5 text-primary" /></div>
                <div>
                  <div className="font-medium">{doc.name}</div>
                  <div className="text-xs text-muted-foreground">{h.formatDate(doc.created_at)}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => h.handlePreviewDoc(doc)}>{h.isLoadingPreview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}</Button>
                <Button size="sm" variant="ghost" className="rounded-lg text-destructive hover:text-destructive" onClick={() => h.handleDeleteIdentityDoc(doc)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
