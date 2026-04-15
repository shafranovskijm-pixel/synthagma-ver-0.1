import { useState } from "react";
import { FileText, Eye, Trash2, Upload, Save, User, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatSnils, isValidSnils } from "@/utils/formatSnils";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface DocumentsTabProps {
  h: any;
}

const DOC_TYPES = [
  { type: "passport", label: "Паспорт" },
  { type: "snils", label: "СНИЛС" },
  { type: "education_document", label: "Документ об образовании" },
  { type: "birth_certificate", label: "Свидетельство о рождении" },
];

export function DocumentsTab({ h }: DocumentsTabProps) {
  const [snilsValue, setSnilsValue] = useState(h.frdoData?.snils || "");
  const [lastName, setLastName] = useState(h.frdoData?.last_name || "");
  const [firstName, setFirstName] = useState(h.frdoData?.first_name || "");
  const [middleName, setMiddleName] = useState(h.frdoData?.middle_name || "");
  const [birthDate, setBirthDate] = useState(h.frdoData?.birth_date || "");

  // Sync from h.frdoData when it changes
  useState(() => {
    if (h.frdoData) {
      if (h.frdoData.snils) setSnilsValue(h.frdoData.snils);
      if (h.frdoData.last_name) setLastName(h.frdoData.last_name);
      if (h.frdoData.first_name) setFirstName(h.frdoData.first_name);
      if (h.frdoData.middle_name) setMiddleName(h.frdoData.middle_name);
      if (h.frdoData.birth_date) setBirthDate(h.frdoData.birth_date);
    }
  });

  const handleSnilsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSnilsValue(formatSnils(e.target.value));
  };

  return (
    <div className="space-y-6">
      {/* Upload documents section */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Upload className="w-5 h-5 text-primary" />
          Загрузить документы
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {DOC_TYPES.map((doc) => {
            const existing = h.identityDocs.find((d: any) => d.type === doc.type);
            return (
              <Button
                key={doc.type}
                variant={existing ? "outline" : "default"}
                className="justify-start gap-2 rounded-xl h-auto py-3"
                disabled={h.uploadingType === doc.type}
                onClick={() => h.handleUploadClick(doc.type)}
              >
                {h.uploadingType === doc.type ? (
                  <SigmaSpinner size="sm" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                <span className="text-left">
                  {doc.label}
                  {existing && <span className="block text-xs opacity-60">Загружен</span>}
                </span>
              </Button>
            );
          })}
        </div>
        <input
          ref={h.fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.doc,.docx"
          onChange={h.handleFileChange}
        />
      </div>

      {/* SNILS & Personal data section */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-primary" />
          Персональные данные (ФРДО)
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Фамилия</Label>
            <div className="flex gap-2">
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Иванов" />
              <Button size="sm" variant="ghost" className="shrink-0" disabled={h.savingFrdoField === "last_name"} onClick={() => h.saveFrdoField("last_name", lastName)}>
                {h.savingFrdoField === "last_name" ? <SigmaSpinner size="sm" /> : <Save className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Имя</Label>
            <div className="flex gap-2">
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Иван" />
              <Button size="sm" variant="ghost" className="shrink-0" disabled={h.savingFrdoField === "first_name"} onClick={() => h.saveFrdoField("first_name", firstName)}>
                {h.savingFrdoField === "first_name" ? <SigmaSpinner size="sm" /> : <Save className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Отчество</Label>
            <div className="flex gap-2">
              <Input value={middleName} onChange={(e) => setMiddleName(e.target.value)} placeholder="Иванович" />
              <Button size="sm" variant="ghost" className="shrink-0" disabled={h.savingFrdoField === "middle_name"} onClick={() => h.saveFrdoField("middle_name", middleName)}>
                {h.savingFrdoField === "middle_name" ? <SigmaSpinner size="sm" /> : <Save className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Дата рождения</Label>
            <div className="flex gap-2">
              <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
              <Button size="sm" variant="ghost" className="shrink-0" disabled={h.savingFrdoField === "birth_date"} onClick={() => h.saveFrdoField("birth_date", birthDate)}>
                {h.savingFrdoField === "birth_date" ? <SigmaSpinner size="sm" /> : <Save className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2 col-span-2">
            <Label>СНИЛС</Label>
            <div className="flex gap-2">
              <Input value={snilsValue} onChange={handleSnilsChange} placeholder="XXX-XXX-XXX XX" maxLength={14} className="max-w-xs" />
              <Button size="sm" variant="ghost" className="shrink-0" disabled={h.savingFrdoField === "snils" || (snilsValue && !isValidSnils(snilsValue))} onClick={() => h.saveFrdoField("snils", snilsValue)}>
                {h.savingFrdoField === "snils" ? <SigmaSpinner size="sm" /> : <Save className="w-4 h-4" />}
              </Button>
            </div>
            {snilsValue && !isValidSnils(snilsValue) && (
              <p className="text-xs text-destructive">СНИЛС должен содержать 11 цифр</p>
            )}
          </div>
        </div>
      </div>

      {/* Existing documents list */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          Загруженные документы ({h.identityDocs.length})
        </h3>
        {h.identityDocs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Нет загруженных документов</p>
          </div>
        ) : (
          <div className="space-y-3">
            {h.identityDocs.map((doc: any) => (
              <div key={doc.id} className="flex items-center justify-between p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium">{doc.name}</div>
                    <div className="text-xs text-muted-foreground">{h.formatDate(doc.created_at)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => h.handlePreviewDoc(doc)}>
                    {h.isLoadingPreview ? <SigmaSpinner size="sm" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button size="sm" variant="ghost" className="rounded-lg text-destructive hover:text-destructive" onClick={() => h.handleDeleteIdentityDoc(doc)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
