import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download, Search, Users, CheckCircle2, AlertCircle, XCircle, Filter, FileSpreadsheet } from "lucide-react";
import { FRDOExportDialog } from "./FRDOExportDialog";
import { useFRDOManager } from "@/hooks/useFRDOManager";

export function FRDOManager({ organizationId }: { organizationId: string }) {
  const {
    isLoading, students, courses, searchQuery, setSearchQuery,
    statusFilter, setStatusFilter, courseFilter, setCourseFilter,
    selectedStudents, isExporting, showExportDialog, setShowExportDialog,
    selectedStudentForExport, selectedEnrollmentForExport,
    filteredStudents, getFrdoStatus, toggleStudentSelection, toggleSelectAll,
    handleBulkExport, openStudentExport, hasPOCourses, stats, missingFieldsStats
  } = useFRDOManager(organizationId);

  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-display font-semibold">ФИС ФРДО</h2><p className="text-muted-foreground">Управление данными</p></div>
        <div className="flex items-center gap-2">
          <Button onClick={() => handleBulkExport("dpo")} className="rounded-xl gap-2" disabled={isExporting || students.length === 0}>{isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}Выгрузить ДПО</Button>
          {hasPOCourses && <Button variant="secondary" onClick={() => handleBulkExport("po")} className="rounded-xl gap-2" disabled={isExporting || students.length === 0}>{isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}Выгрузить ПО</Button>}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { icon: Users, color: "text-primary", bg: "bg-primary/10", count: stats.total, label: "Всего" },
          { icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10", count: stats.complete, label: "Заполнено" },
          { icon: AlertCircle, color: "text-amber-500", bg: "bg-amber-500/10", count: stats.incomplete, label: "Частично" },
          { icon: XCircle, color: "text-muted-foreground", bg: "bg-muted", count: stats.empty, label: "Не заполнено" },
        ].map((s, i) => (
          <div key={i} className="bg-card rounded-2xl border border-border p-4">
            <div className="flex items-center gap-3"><div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.bg}`}><s.icon className={`w-5 h-5 ${s.color}`} /></div><div><div className="text-2xl font-semibold">{s.count}</div><div className="text-sm text-muted-foreground">{s.label}</div></div></div>
          </div>
        ))}
      </div>

      {missingFieldsStats.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><AlertCircle className="w-5 h-5 text-amber-500" />Каких данных не хватает</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">{missingFieldsStats.map(([f, c]) => <div key={f} className="flex items-center justify-between p-3 rounded-xl bg-amber-500/5 border border-amber-500/20"><span className="text-sm font-medium">{f}</span><span className="text-sm font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-lg">{c}</span></div>)}</div>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Поиск..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10 rounded-xl" /></div>
          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}><SelectTrigger className="w-44 rounded-xl"><Filter className="w-4 h-4 mr-2" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Все статусы</SelectItem><SelectItem value="complete">Заполнено</SelectItem><SelectItem value="incomplete">Частично</SelectItem><SelectItem value="empty">Не заполнено</SelectItem></SelectContent></Select>
          <Select value={courseFilter} onValueChange={setCourseFilter}><SelectTrigger className="w-48 rounded-xl"><SelectValue placeholder="Все курсы" /></SelectTrigger><SelectContent><SelectItem value="all">Все курсы</SelectItem>{courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent></Select>
        </div>
        {selectedStudents.size > 0 && <div className="flex items-center gap-2"><Button onClick={() => handleBulkExport("dpo")} className="rounded-xl gap-2" disabled={isExporting}>Экспорт ДПО ({selectedStudents.size})</Button>{hasPOCourses && <Button variant="secondary" onClick={() => handleBulkExport("po")} className="rounded-xl gap-2" disabled={isExporting}>Экспорт ПО ({selectedStudents.size})</Button>}</div>}
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {filteredStudents.length === 0 ? <div className="text-center py-12 text-muted-foreground"><FileSpreadsheet className="w-12 h-12 mx-auto mb-4 opacity-50" /><p>Нет студентов</p></div> : (
          <div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b border-border bg-muted/30"><th className="text-left px-4 py-4 w-12"><input type="checkbox" checked={selectedStudents.size === filteredStudents.length && filteredStudents.length > 0} onChange={toggleSelectAll} className="w-4 h-4 rounded" /></th><th className="text-left px-4 py-4 text-sm font-medium text-muted-foreground">Студент</th><th className="text-left px-4 py-4 text-sm font-medium text-muted-foreground">Статус</th><th className="text-left px-4 py-4 text-sm font-medium text-muted-foreground">Курс</th><th className="text-left px-4 py-4 text-sm font-medium text-muted-foreground">Действия</th></tr></thead><tbody>{filteredStudents.map(s => {
            const { status, missingFields } = getFrdoStatus(s.user_id);
            const isSelected = selectedStudents.has(s.user_id);
            return (
              <tr key={s.user_id} className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}>
                <td className="px-4 py-4"><input type="checkbox" checked={isSelected} onChange={() => toggleStudentSelection(s.user_id)} className="w-4 h-4 rounded" /></td>
                <td className="px-4 py-4"><div><div className="font-medium">{s.name}</div><div className="text-sm text-muted-foreground">{s.email}</div></div></td>
                <td className="px-4 py-4">{status === "complete" ? <span className="flex items-center gap-2 text-sm text-green-600"><CheckCircle2 className="w-4 h-4" />Заполнено</span> : status === "incomplete" ? <span className="flex items-center gap-2 text-sm text-amber-600" title={missingFields.join(", ")}><AlertCircle className="w-4 h-4" />Не хватает</span> : <span className="flex items-center gap-2 text-sm text-muted-foreground"><XCircle className="w-4 h-4" />Пусто</span>}</td>
                <td className="px-4 py-4 text-sm">{s.course || "Не зачислен"}</td>
                <td className="px-4 py-4"><Button size="sm" variant="outline" className="rounded-lg gap-1" onClick={() => openStudentExport(s)}><FileSpreadsheet className="w-4 h-4" />Ред.</Button></td>
              </tr>
            );
          })}</tbody></table></div>
        )}
      </div>

      <FRDOExportDialog isOpen={showExportDialog} onOpenChange={setShowExportDialog} student={selectedStudentForExport ? { id: selectedStudentForExport.user_id, user_id: selectedStudentForExport.user_id, name: selectedStudentForExport.name, email: selectedStudentForExport.email } : null} organizationId={organizationId} enrollment={selectedEnrollmentForExport as any} />
    </div>
  );
}
