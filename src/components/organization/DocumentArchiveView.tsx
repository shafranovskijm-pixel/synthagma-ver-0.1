import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from "@/components/ui/select";
import {
  FileText,
  Download,
  Trash2,
  Search,
  Eye,
  FolderOpen,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { OrdersArchive } from "./OrdersArchive";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface OrgDocument {
  id: string;
  type: string;
  name: string;
  file_url: string | null;
  created_at: string;
  updated_at: string;
}

interface DocumentArchiveViewProps {
  organizationId: string;
  categoryId: string;
  title: string;
  docTypes: string[];
}

const ITEMS_PER_PAGE = 15;

export function DocumentArchiveView({
  organizationId,
  categoryId,
  title,
  docTypes }: DocumentArchiveViewProps) {
  const [documents, setDocuments] = useState<OrgDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchDocuments();
  }, [organizationId, docTypes]);

  const fetchDocuments = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("org_documents")
        .select("*")
        .eq("organization_id", organizationId)
        .in("type", docTypes)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error("Error fetching documents:", error);
      toast.error("Ошибка загрузки документов");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm("Переместить документ в корзину? Он будет храниться 30 дней и может быть восстановлен.")) return;

    try {
      const { data, error } = await supabase.rpc("soft_delete_document", {
        p_table: "org_documents",
        p_id: docId,
      });

      if (error) throw error;
      if (!data) throw new Error("Документ не найден или уже удалён");

      setDocuments(documents.filter((d) => d.id !== docId));
      toast.success("Документ перемещён в корзину");
    } catch (error: any) {
      console.error("Error deleting document:", error);
      toast.error("Ошибка удаления", { description: error?.message });
    }
  };

  // Filter and sort documents
  const filteredDocuments = documents
    .filter((doc) =>
      doc.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
    });

  // Pagination
  const totalPages = Math.ceil(filteredDocuments.length / ITEMS_PER_PAGE);
  const paginatedDocuments = filteredDocuments.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Use OrdersArchive for enrollment_orders
  if (categoryId === "enrollment_orders") {
    return (
      <div className="space-y-4">
        <OrdersArchive
          documents={documents}
          onDelete={handleDelete}
          onView={(url) => window.open(url, "_blank")}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <SigmaSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileText className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">{documents.length}</h2>
            <p className="text-sm text-muted-foreground">Всего документов</p>
          </div>
        </div>
      </div>

      {/* Search and Sort */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по названию..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-10 rounded-xl"
          />
        </div>
        <Select
          value={sortOrder}
          onValueChange={(value: "desc" | "asc") => setSortOrder(value)}
        >
          <SelectTrigger className="w-[200px] rounded-xl">
            <ArrowUpDown className="w-4 h-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">Сначала новые</SelectItem>
            <SelectItem value="asc">Сначала старые</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Documents List */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {paginatedDocuments.length === 0 ? (
          <div className="p-12 text-center">
            <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">
              {searchQuery ? "Ничего не найдено" : "Нет документов"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {searchQuery
                ? "Попробуйте изменить поисковый запрос"
                : "В этой категории пока нет загруженных документов"}
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border">
              {paginatedDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-medium truncate block">
                        {doc.name}
                      </span>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(doc.created_at), "d MMMM yyyy, HH:mm", {
                          locale: ru })}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    {doc.file_url && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={async () => {
                            try {
                              const { data } = await supabase.storage.from("org-documents").createSignedUrl(doc.file_url!, 3600);
                              if (!data?.signedUrl) return;
                              const res = await fetch(data.signedUrl);
                              const text = await res.text();
                              const blob = new Blob([text], { type: "text/html;charset=utf-8" });
                              window.open(URL.createObjectURL(blob), "_blank");
                            } catch (e) {
                              console.error("Error viewing document:", e);
                            }
                          }}
                          title="Просмотр"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={async () => {
                            try {
                              const { data } = await supabase.storage.from("org-documents").createSignedUrl(doc.file_url!, 3600);
                              if (!data?.signedUrl) return;
                              const { downloadHtmlFile } = await import("@/utils/downloadHtmlFile");
                              await downloadHtmlFile(data.signedUrl, doc.name);
                            } catch (e) {
                              console.error("Error downloading document:", e);
                            }
                          }}
                          title="Скачать"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(doc.id)}
                      className="text-destructive hover:text-destructive"
                      title="Удалить"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Показано {(currentPage - 1) * ITEMS_PER_PAGE + 1} -{" "}
                  {Math.min(currentPage * ITEMS_PER_PAGE, filteredDocuments.length)} из{" "}
                  {filteredDocuments.length}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="rounded-lg"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-medium px-2">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="rounded-lg"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
