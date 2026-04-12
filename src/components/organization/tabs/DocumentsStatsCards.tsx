import { useState } from "react";
import { Users, FileText, GraduationCap, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import type { DocumentsStats } from "@/types";

interface DocumentsStatsCardsProps {
  stats: DocumentsStats;
}

export function DocumentsStatsCards({ stats }: DocumentsStatsCardsProps) {
  const [visible, setVisible] = useState(true);

  return (
    <div className="mb-6 lg:mb-8">
      <button
        onClick={() => setVisible(v => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
      >
        {visible ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {visible ? "Скрыть статистику" : "Показать статистику"}
      </button>
      {visible && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4">
          <div className="bg-card rounded-xl lg:rounded-2xl p-3 lg:p-4 border border-border">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="w-4 h-4 lg:w-5 lg:h-5 text-primary" />
              </div>
              <div>
                <div className="text-lg lg:text-2xl font-bold">{stats.total}</div>
                <div className="text-[10px] lg:text-xs text-muted-foreground">Всего</div>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl lg:rounded-2xl p-3 lg:p-4 border border-border">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className={`w-8 h-8 lg:w-10 lg:h-10 rounded-lg flex items-center justify-center ${
                stats.withPassport === stats.total && stats.total > 0 ? 'bg-green-500/10' : 'bg-amber-500/10'
              }`}>
                <FileText className={`w-4 h-4 lg:w-5 lg:h-5 ${
                  stats.withPassport === stats.total && stats.total > 0 ? 'text-green-500' : 'text-amber-500'
                }`} />
              </div>
              <div>
                <div className="text-lg lg:text-2xl font-bold">
                  {stats.withPassport}
                  <span className="text-xs lg:text-sm text-muted-foreground font-normal">/{stats.total}</span>
                </div>
                <div className="text-[10px] lg:text-xs text-muted-foreground">Паспорт</div>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl lg:rounded-2xl p-3 lg:p-4 border border-border">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className={`w-8 h-8 lg:w-10 lg:h-10 rounded-lg flex items-center justify-center ${
                stats.withSnils === stats.total && stats.total > 0 ? 'bg-green-500/10' : 'bg-amber-500/10'
              }`}>
                <FileText className={`w-4 h-4 lg:w-5 lg:h-5 ${
                  stats.withSnils === stats.total && stats.total > 0 ? 'text-green-500' : 'text-amber-500'
                }`} />
              </div>
              <div>
                <div className="text-lg lg:text-2xl font-bold">
                  {stats.withSnils}
                  <span className="text-xs lg:text-sm text-muted-foreground font-normal">/{stats.total}</span>
                </div>
                <div className="text-[10px] lg:text-xs text-muted-foreground">СНИЛС</div>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl lg:rounded-2xl p-3 lg:p-4 border border-border">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className={`w-8 h-8 lg:w-10 lg:h-10 rounded-lg flex items-center justify-center ${
                stats.withEducation === stats.total && stats.total > 0 ? 'bg-green-500/10' : 'bg-amber-500/10'
              }`}>
                <GraduationCap className={`w-4 h-4 lg:w-5 lg:h-5 ${
                  stats.withEducation === stats.total && stats.total > 0 ? 'text-green-500' : 'text-amber-500'
                }`} />
              </div>
              <div>
                <div className="text-lg lg:text-2xl font-bold">
                  {stats.withEducation}
                  <span className="text-xs lg:text-sm text-muted-foreground font-normal">/{stats.total}</span>
                </div>
                <div className="text-[10px] lg:text-xs text-muted-foreground">Образование</div>
              </div>
            </div>
          </div>
          <div className="col-span-2 lg:col-span-1 bg-card rounded-xl lg:rounded-2xl p-3 lg:p-4 border border-border">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className={`w-8 h-8 lg:w-10 lg:h-10 rounded-lg flex items-center justify-center ${
                stats.complete === stats.total && stats.total > 0 ? 'bg-green-500/10' : 'bg-primary/10'
              }`}>
                <CheckCircle2 className={`w-4 h-4 lg:w-5 lg:h-5 ${
                  stats.complete === stats.total && stats.total > 0 ? 'text-green-500' : 'text-primary'
                }`} />
              </div>
              <div>
                <div className="text-lg lg:text-2xl font-bold">
                  {stats.complete}
                  <span className="text-xs lg:text-sm text-muted-foreground font-normal">/{stats.total}</span>
                </div>
                <div className="text-[10px] lg:text-xs text-muted-foreground">Все документы</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
