import React from "react";
import { Button } from "@/components/ui/button";
import { FileText, Eye, Trash2 } from "lucide-react";
import { openPrivateFile } from "@/utils/storageHelpers";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import type { LSIdentityDocument } from "@/hooks/useLaborSafetyStudent";

interface LSDocumentsTabProps {
  hasProfile: boolean;
  identityDocs: LSIdentityDocument[];
  handleDeleteDoc: (doc: LSIdentityDocument) => void;
}

export function LSDocumentsTab({ hasProfile, identityDocs, handleDeleteDoc }: LSDocumentsTabProps) {
  if (!hasProfile) {
    return <div className="text-center py-12 text-muted-foreground"><FileText className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Сначала создайте учётную запись</p></div>;
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-6">
      <h3 className="font-semibold mb-4 flex items-center gap-2"><FileText className="w-5 h-5 text-primary" />Документы личности</h3>
      {identityDocs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground"><FileText className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Нет загруженных документов</p></div>
      ) : (
        <div className="space-y-3">
          {identityDocs.map(d => (
            <div key={d.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><FileText className="w-5 h-5 text-primary" /></div>
                <div>
                  <div className="font-medium">{d.name}</div>
                  <div className="text-xs text-muted-foreground">{format(new Date(d.created_at), "d MMMM yyyy, HH:mm", { locale: ru })}</div>
                </div>
              </div>
              {d.file_url && (
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openPrivateFile("student-documents", d.file_url!)} title="Открыть"><Eye className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteDoc(d)} title="Удалить"><Trash2 className="w-4 h-4" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
