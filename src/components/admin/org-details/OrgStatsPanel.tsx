import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BookOpen, HardDrive, Sparkles } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import type { Student, Course, UsageData, UsageHistoryItem } from "@/hooks/useOrgDetailsView";

interface OrgStatsPanelProps {
  students: Student[];
  courses: Course[];
  usage: UsageData;
  usageHistory: UsageHistoryItem[];
  storageLimitPercent: number;
  aiGenerationsLimit: number;
  aiGenerationsPercent: number;
  formatBytes: (bytes: number) => string;
  storageLimit: number;
}

const cardClass = "shadow-sm hover:shadow-md transition-shadow duration-200";

export function OrgStatsPanel({
  students, courses, usage, usageHistory,
  storageLimitPercent, aiGenerationsLimit, aiGenerationsPercent,
  formatBytes, storageLimit,
}: OrgStatsPanelProps) {
  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <Card className={cardClass}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-violet-500/10"><Sparkles className="w-5 h-5 text-violet-500" /></div>
              ИИ-генерации
            </CardTitle>
            <CardDescription>Последние 6 месяцев</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={usageHistory}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month_label" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" allowDecimals={false} />
                  <Tooltip formatter={(value: number) => [value, "Генерации"]} contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                  <Bar dataKey="ai_generations_count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className={cardClass}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-cyan-500/10"><HardDrive className="w-5 h-5 text-cyan-500" /></div>
              Использование хранилища
            </CardTitle>
            <CardDescription>Последние 6 месяцев</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={usageHistory}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month_label" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => formatBytes(value)} className="text-muted-foreground" />
                  <Tooltip formatter={(value: number) => [formatBytes(value), "Хранилище"]} contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                  <Line type="monotone" dataKey="storage_bytes" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: 'hsl(var(--primary))' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className={cardClass}>
          <CardHeader><CardTitle className="text-lg">Недавние ученики</CardTitle></CardHeader>
          <CardContent>
            {students.slice(0, 5).map((student) => (
              <div key={student.id} className="flex items-center justify-between py-2.5 border-b last:border-0 hover:bg-muted/30 -mx-2 px-2 rounded-lg transition-colors">
                <div>
                  <p className="font-medium">{student.full_name || "Без имени"}</p>
                  <p className="text-sm text-muted-foreground">{student.email}</p>
                </div>
                <Badge variant="secondary">{student.enrollments.length} курсов</Badge>
              </div>
            ))}
            {students.length === 0 && <p className="text-muted-foreground text-center py-4">Нет учеников</p>}
          </CardContent>
        </Card>

        <Card className={cardClass}>
          <CardHeader><CardTitle className="text-lg">Курсы</CardTitle></CardHeader>
          <CardContent>
            {courses.slice(0, 5).map((course) => (
              <div key={course.id} className="flex items-center justify-between py-2.5 border-b last:border-0 hover:bg-muted/30 -mx-2 px-2 rounded-lg transition-colors">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-muted-foreground" />
                  <p className="font-medium">{course.title}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={course.is_published ? "default" : "secondary"}>{course.is_published ? "Опубликован" : "Черновик"}</Badge>
                  <Badge variant="outline">{course.students_count} уч.</Badge>
                </div>
              </div>
            ))}
            {courses.length === 0 && <p className="text-muted-foreground text-center py-4">Нет курсов</p>}
          </CardContent>
        </Card>
      </div>

      <Card className={cardClass}>
        <CardHeader><CardTitle className="text-lg">Использование ресурсов (текущий месяц)</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Хранилище</span>
                <span className="text-sm font-medium">{formatBytes(usage.storage_bytes)} / {formatBytes(storageLimit)}</span>
              </div>
              <Progress value={Math.min(storageLimitPercent, 100)} className="h-2" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">ИИ-генерации (месяц)</span>
                <span className="text-sm font-medium">{usage.ai_generations_count} / {aiGenerationsLimit === Infinity ? "∞" : aiGenerationsLimit}</span>
              </div>
              <Progress value={aiGenerationsLimit === Infinity ? 0 : Math.min(aiGenerationsPercent, 100)} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
