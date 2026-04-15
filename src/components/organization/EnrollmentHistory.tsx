import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UserPlus, UserMinus, History, FileSpreadsheet, Filter, X, Calendar, BarChart3 } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend } from "recharts";

interface EnrollmentHistoryItem {
  id: string;
  user_id: string;
  course_id: string;
  action: string;
  created_at: string;
  user_name?: string;
  user_email?: string;
  performed_by_name?: string;
}

interface EnrollmentHistoryProps {
  courseId: string;
  organizationId: string;
  courseName?: string;
}

export function EnrollmentHistory({ courseId, organizationId, courseName }: EnrollmentHistoryProps) {
  const [history, setHistory] = useState<EnrollmentHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showChart, setShowChart] = useState(false);
  
  // Filters
  const [selectedAction, setSelectedAction] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  useEffect(() => {
    fetchHistory();
  }, [courseId]);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const { data: historyData, error } = await supabase
        .from("enrollment_history")
        .select("*")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .eq("organization_id", organizationId);

      const profilesMap = new Map(
        (profiles || []).map(p => [p.user_id, { name: p.full_name, email: p.email }])
      );

      const enrichedHistory = (historyData || []).map(h => ({
        ...h,
        user_name: profilesMap.get(h.user_id)?.name || "Неизвестный",
        user_email: profilesMap.get(h.user_id)?.email || "",
        performed_by_name: h.performed_by ? (profilesMap.get(h.performed_by)?.name || "Система") : "Система"
      }));

      setHistory(enrichedHistory);
    } catch (error) {
      console.error("Error fetching enrollment history:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Filtered data
  const filteredHistory = useMemo(() => {
    return history.filter(item => {
      if (selectedAction !== "all" && item.action !== selectedAction) {
        return false;
      }
      
      if (dateFrom) {
        const itemDate = new Date(item.created_at);
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        if (itemDate < fromDate) return false;
      }
      
      if (dateTo) {
        const itemDate = new Date(item.created_at);
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (itemDate > toDate) return false;
      }
      
      return true;
    });
  }, [history, selectedAction, dateFrom, dateTo]);

  // Chart data - aggregate by date
  const chartData = useMemo(() => {
    const dateMap = new Map<string, { date: string; enrolled: number; unenrolled: number }>();
    
    filteredHistory.forEach(item => {
      const dateKey = format(new Date(item.created_at), "dd.MM", { locale: ru });
      const fullDate = format(new Date(item.created_at), "dd MMM", { locale: ru });
      
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, { date: fullDate, enrolled: 0, unenrolled: 0 });
      }
      
      const entry = dateMap.get(dateKey)!;
      if (item.action === "enrolled") {
        entry.enrolled++;
      } else {
        entry.unenrolled++;
      }
    });
    
    // Sort by date and return as array (reverse to show chronologically)
    return Array.from(dateMap.values()).reverse();
  }, [filteredHistory]);

  const hasActiveFilters = selectedAction !== "all" || dateFrom || dateTo;

  const resetFilters = () => {
    setSelectedAction("all");
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const handleExport = () => {
    import('xlsx').then(XLSX => {
      const exportData = filteredHistory.map(h => ({
        'ФИО': h.user_name,
        'Email': h.user_email,
        'Действие': h.action === 'enrolled' ? 'Зачислен' : 'Отчислен',
        'Дата и время': format(new Date(h.created_at), "dd.MM.yyyy HH:mm", { locale: ru }),
        'Выполнил': h.performed_by_name
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'История зачислений');
      const fileName = courseName 
        ? `история_зачислений_${courseName}_${new Date().toISOString().split('T')[0]}.xlsx`
        : `история_зачислений_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success('История зачислений экспортирована');
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <SigmaSpinner />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>История зачислений пуста</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="w-4 h-4 text-muted-foreground" />
        
        <Select value={selectedAction} onValueChange={setSelectedAction}>
          <SelectTrigger className="w-[140px] h-8 text-sm">
            <SelectValue placeholder="Тип действия" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все действия</SelectItem>
            <SelectItem value="enrolled">Зачислен</SelectItem>
            <SelectItem value="unenrolled">Отчислен</SelectItem>
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {dateFrom ? format(dateFrom, "dd.MM.yy", { locale: ru }) : "От"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarComponent
              mode="single"
              selected={dateFrom}
              onSelect={setDateFrom}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {dateTo ? format(dateTo, "dd.MM.yy", { locale: ru }) : "До"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarComponent
              mode="single"
              selected={dateTo}
              onSelect={setDateTo}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-muted-foreground"
            onClick={resetFilters}
          >
            <X className="w-3.5 h-3.5" />
            Сбросить
          </Button>
        )}

        <div className="flex-1" />

        <Button
          variant={showChart ? "secondary" : "outline"}
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => setShowChart(!showChart)}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          График
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={handleExport}
          disabled={filteredHistory.length === 0}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          Экспорт
        </Button>
      </div>

      {/* Results count */}
      {hasActiveFilters && (
        <p className="text-xs text-muted-foreground">
          Найдено: {filteredHistory.length} из {history.length}
        </p>
      )}

      {/* Chart */}
      {showChart && chartData.length > 0 && (
        <div className="bg-muted/30 rounded-xl p-4">
          <h4 className="text-sm font-medium mb-3">Динамика зачислений</h4>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 11 }} 
                tickLine={false}
                className="text-muted-foreground"
              />
              <YAxis 
                tick={{ fontSize: 11 }} 
                tickLine={false}
                allowDecimals={false}
                className="text-muted-foreground"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px" }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Legend 
                wrapperStyle={{ fontSize: "12px" }}
                formatter={(value) => value === "enrolled" ? "Зачислено" : "Отчислено"}
              />
              <Bar 
                dataKey="enrolled" 
                name="enrolled"
                fill="hsl(142, 76%, 36%)" 
                radius={[4, 4, 0, 0]}
              />
              <Bar 
                dataKey="unenrolled" 
                name="unenrolled"
                fill="hsl(var(--destructive))" 
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* History list */}
      {filteredHistory.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <p className="text-sm">Нет записей по выбранным фильтрам</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-60 overflow-auto">
          {filteredHistory.map(item => (
            <div
              key={item.id}
              className={`flex items-start gap-3 p-3 rounded-xl ${
                item.action === "enrolled" ? "bg-sigma-green/10" : "bg-destructive/10"
              }`}
            >
              <div className={`p-2 rounded-lg ${
                item.action === "enrolled" ? "bg-sigma-green/20 text-sigma-green" : "bg-destructive/20 text-destructive"
              }`}>
                {item.action === "enrolled" ? (
                  <UserPlus className="w-4 h-4" />
                ) : (
                  <UserMinus className="w-4 h-4" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{item.user_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    item.action === "enrolled" 
                      ? "bg-sigma-green/20 text-sigma-green" 
                      : "bg-destructive/20 text-destructive"
                  }`}>
                    {item.action === "enrolled" ? "Зачислен" : "Отчислен"}
                  </span>
                </div>
                {item.user_email && (
                  <p className="text-sm text-muted-foreground truncate">{item.user_email}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(item.created_at), "d MMM yyyy, HH:mm", { locale: ru })}
                  {item.performed_by_name && ` • ${item.performed_by_name}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
