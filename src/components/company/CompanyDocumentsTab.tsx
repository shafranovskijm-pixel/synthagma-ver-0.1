import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Receipt, FileCheck, Download, CheckCircle2, Clock, ExternalLink } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface CompanyDoc {
  id: string;
  name: string;
  type: string;
  file_url: string | null;
  amount: number | null;
  is_paid: boolean | null;
  uploaded_at: string;
  contract_number: string | null;
  contract_date: string | null;
}

interface Props {
  companyId: string;
}

export function CompanyDocumentsTab({ companyId }: Props) {
  const [documents, setDocuments] = useState<CompanyDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("company_documents")
      .select("id, name, type, file_url, amount, is_paid, uploaded_at, contract_number, contract_date")
      .eq("company_id", companyId)
      .order("uploaded_at", { ascending: false });
    setDocuments(data || []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  const getByType = (type: string) => documents.filter((d) => d.type === type);
  const formatDate = (d: string) => new Date(d).toLocaleDateString("ru-RU");
  const formatAmount = (a: number | null) => a ? new Intl.NumberFormat("ru-RU").format(a) + " ₽" : "—";

  if (loading) {
    return <div className="flex items-center justify-center py-12"><SigmaSpinner size="lg" /></div>;
  }

  const DocTable = ({ docs, showPayment }: { docs: CompanyDoc[]; showPayment?: boolean }) => (
    docs.length === 0 ? (
      <p className="text-center py-8 text-muted-foreground text-sm">Нет документов</p>
    ) : (
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Номер</TableHead>
              <TableHead>Дата</TableHead>
              {showPayment && <TableHead>Сумма</TableHead>}
              {showPayment && <TableHead>Оплата</TableHead>}
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell className="font-medium">{doc.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{doc.contract_number || "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{doc.contract_date ? formatDate(doc.contract_date) : formatDate(doc.uploaded_at)}</TableCell>
                {showPayment && <TableCell className="text-sm">{formatAmount(doc.amount)}</TableCell>}
                {showPayment && (
                  <TableCell>
                    {doc.is_paid ? (
                      <Badge className="bg-green-500/10 text-green-500 border-green-500/20"><CheckCircle2 className="w-3 h-3 mr-1" />Оплачен</Badge>
                    ) : (
                      <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Не оплачен</Badge>
                    )}
                  </TableCell>
                )}
                <TableCell>
                  {doc.file_url && (
                    <Button variant="ghost" size="icon" asChild>
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                        <Download className="w-4 h-4" />
                      </a>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  );

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <FileText className="w-5 h-5" />
        Документы
      </h2>
      <Tabs defaultValue="contracts">
        <TabsList>
          <TabsTrigger value="contracts" className="gap-2"><FileText className="w-4 h-4" />Договоры ({getByType("contract").length})</TabsTrigger>
          <TabsTrigger value="invoices" className="gap-2"><Receipt className="w-4 h-4" />Счета ({getByType("invoice").length})</TabsTrigger>
          <TabsTrigger value="acts" className="gap-2"><FileCheck className="w-4 h-4" />Акты ({getByType("act").length})</TabsTrigger>
        </TabsList>
        <TabsContent value="contracts"><DocTable docs={getByType("contract")} /></TabsContent>
        <TabsContent value="invoices"><DocTable docs={getByType("invoice")} showPayment /></TabsContent>
        <TabsContent value="acts"><DocTable docs={getByType("act")} /></TabsContent>
      </Tabs>
    </div>
  );
}
