import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Eye,
  Download,
  Trash2,
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  UserPlus,
  UserMinus,
  Calendar,
} from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface OrderDocument {
  id: string;
  type: string;
  name: string;
  file_url: string | null;
  created_at: string;
}

interface OrdersArchiveProps {
  documents: OrderDocument[];
  onDelete: (id: string) => void;
  onView: (url: string) => void;
}

const ITEMS_PER_PAGE = 10;

export function OrdersArchive({ documents, onDelete, onView }: OrdersArchiveProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "enrollment_order" | "expulsion_order">("all");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [currentPage, setCurrentPage] = useState(1);

  // Filter only enrollment and expulsion orders
  const orderDocuments = useMemo(() => {
    return documents.filter(
      (doc) => doc.type === "enrollment_order" || doc.type === "expulsion_order"
    );
  }, [documents]);

  // Apply filters and search
  const filteredDocuments = useMemo(() => {
    let result = orderDocuments;

    // Type filter
    if (typeFilter !== "all") {
      result = result.filter((doc) => doc.type === typeFilter);
    }

    // Search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((doc) => doc.name.toLowerCase().includes(query));
    }

    // Sort by date
    result = [...result].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [orderDocuments, typeFilter, searchQuery, sortOrder]);

  // Pagination
  const totalPages = Math.ceil(filteredDocuments.length / ITEMS_PER_PAGE);
  const paginatedDocuments = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredDocuments.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredDocuments, currentPage]);

  // Reset page when filters change
  const handleFilterChange = (filter: "all" | "enrollment_order" | "expulsion_order") => {
    setTypeFilter(filter);
    setCurrentPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
  };

  const getOrderTypeLabel = (type: string) => {
    return type === "enrollment_order" ? "Зачисление" : "Отчисление";
  };

  const getOrderTypeColor = (type: string) => {
    return type === "enrollment_order" 
      ? "bg-green-500/10 text-green-600 border-green-200" 
      : "bg-orange-500/10 text-orange-600 border-orange-200";
  };

  if (orderDocuments.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>Приказов пока нет</p>
        <p className="text-sm mt-1">Приказы создаются автоматически при зачислении/отчислении студентов</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-secondary/50 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold">{orderDocuments.length}</div>
          <div className="text-xs text-muted-foreground">Всего приказов</div>
        </div>
        <div className="bg-green-500/10 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-green-600">
            {orderDocuments.filter((d) => d.type === "enrollment_order").length}
          </div>
          <div className="text-xs text-muted-foreground">О зачислении</div>
        </div>
        <div className="bg-orange-500/10 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-orange-600">
            {orderDocuments.filter((d) => d.type === "expulsion_order").length}
          </div>
          <div className="text-xs text-muted-foreground">Об отчислении</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по названию..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10 rounded-xl"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => handleFilterChange(v as any)}>
          <SelectTrigger className="w-full sm:w-[180px] rounded-xl">
            <SelectValue placeholder="Тип приказа" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все приказы</SelectItem>
            <SelectItem value="enrollment_order">О зачислении</SelectItem>
            <SelectItem value="expulsion_order">Об отчислении</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={toggleSortOrder}
          className="rounded-xl flex-shrink-0"
          title={sortOrder === "desc" ? "Сначала новые" : "Сначала старые"}
        >
          <ArrowUpDown className="w-4 h-4" />
        </Button>
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        Найдено: {filteredDocuments.length} {filteredDocuments.length === 1 ? "приказ" : "приказов"}
      </div>

      {/* Table */}
      <div className="border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/50">
              <TableHead className="w-[100px]">Тип</TableHead>
              <TableHead>Название</TableHead>
              <TableHead className="w-[140px]">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Дата
                </div>
              </TableHead>
              <TableHead className="w-[120px] text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedDocuments.map((doc) => (
              <TableRow key={doc.id} className="hover:bg-secondary/30">
                <TableCell>
                  <Badge variant="outline" className={getOrderTypeColor(doc.type)}>
                    {doc.type === "enrollment_order" ? (
                      <UserPlus className="w-3 h-3 mr-1" />
                    ) : (
                      <UserMinus className="w-3 h-3 mr-1" />
                    )}
                    {getOrderTypeLabel(doc.type)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="font-medium truncate max-w-[300px]" title={doc.name}>
                    {doc.name}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(doc.created_at), "d MMM yyyy", { locale: ru })}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {doc.file_url && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => onView(doc.file_url!)}
                          title="Просмотр"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            const link = document.createElement("a");
                            link.href = doc.file_url!;
                            link.download = doc.name;
                            link.click();
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
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => onDelete(doc.id)}
                      title="Удалить"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Страница {currentPage} из {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-lg"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Назад
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                    className="w-8 h-8 p-0 rounded-lg"
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-lg"
            >
              Вперёд
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
