import { useState } from "react";
import { useWebinarsManager, Webinar } from "@/hooks/useWebinarsManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Video, Plus, Play, Square, Trash2, Users, Calendar, Clock, Radio, ExternalLink, Loader2, Link2 } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { toast } from "sonner";

interface WebinarsManagerProps {
  organizationId: string;
}

const ACCESS_TYPE_LABELS: Record<string, string> = {
  org_all: "Все студенты организации",
  enrolled: "Зачисленные на любой курс",
  course: "Студенты конкретного курса",
  company: "Студенты компании",
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  scheduled: { label: "Запланирован", variant: "secondary" },
  live: { label: "🔴 В эфире", variant: "destructive" },
  ended: { label: "Завершён", variant: "outline" },
};

export function WebinarsManager({ organizationId }: WebinarsManagerProps) {
  const { webinars, loading, creating, createWebinar, updateWebinarStatus, deleteWebinar } = useWebinarsManager(organizationId);
  const d = useOrgDashboard();
  const courses = d.courses || [];

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [recordingDialog, setRecordingDialog] = useState<string | null>(null);
  const [recordingUrl, setRecordingUrl] = useState("");

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [accessType, setAccessType] = useState("org_all");
  const [courseId, setCourseId] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("100");
  const [streamUrl, setStreamUrl] = useState("");

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setScheduledAt("");
    setDurationMinutes("60");
    setAccessType("org_all");
    setCourseId("");
    setMaxParticipants("100");
    setStreamUrl("");
  };

  const handleCreate = async () => {
    if (!title || !scheduledAt || !streamUrl) {
      toast.error("Заполните все обязательные поля");
      return;
    }
    await createWebinar({
      title,
      description: description || undefined,
      scheduled_at: new Date(scheduledAt).toISOString(),
      duration_minutes: parseInt(durationMinutes) || 60,
      access_type: accessType,
      course_id: accessType === "course" ? courseId || undefined : undefined,
      max_participants: parseInt(maxParticipants) || 100,
      stream_url: streamUrl,
      stream_platform: "telemost",
    });
    resetForm();
    setShowCreateDialog(false);
  };

  const handleStart = async (webinar: Webinar) => {
    const ok = await updateWebinarStatus(webinar.id, "live");
    if (ok) toast.success("Вебинар запущен — студенты могут подключиться");
  };

  const handleEnd = async (webinarId: string) => {
    setRecordingDialog(webinarId);
  };

  const handleEndConfirm = async () => {
    if (!recordingDialog) return;
    await updateWebinarStatus(recordingDialog, "ended", recordingUrl ? { recording_url: recordingUrl } : undefined);
    setRecordingDialog(null);
    setRecordingUrl("");
    toast.success("Вебинар завершён");
  };

  const handleOpenStream = (webinar: Webinar) => {
    const url = webinar.stream_url;
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const upcoming = webinars.filter(w => w.status === "scheduled");
  const live = webinars.filter(w => w.status === "live");
  const ended = webinars.filter(w => w.status === "ended");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Video className="w-5 h-5 text-primary" />
          Вебинары
        </h2>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Создать вебинар
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Новый вебинар</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Название *</label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Введите название вебинара" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Ссылка на Яндекс Телемост *</label>
                <Input
                  value={streamUrl}
                  onChange={e => setStreamUrl(e.target.value)}
                  placeholder="https://telemost.yandex.ru/j/..."
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Создайте встречу на{" "}
                  <a href="https://telemost.yandex.ru" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    telemost.yandex.ru
                  </a>{" "}
                  и вставьте ссылку
                </p>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Описание</label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Описание (необязательно)" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Дата и время *</label>
                  <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Длительность (мин)</label>
                  <Input type="number" value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} min="15" max="480" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Доступ</label>
                <Select value={accessType} onValueChange={setAccessType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="org_all">Все студенты организации</SelectItem>
                    <SelectItem value="enrolled">Зачисленные на любой курс</SelectItem>
                    <SelectItem value="course">Студенты конкретного курса</SelectItem>
                    <SelectItem value="company">Студенты компании</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {accessType === "course" && (
                <div>
                  <label className="text-sm font-medium mb-1 block">Курс</label>
                  <Select value={courseId} onValueChange={setCourseId}>
                    <SelectTrigger><SelectValue placeholder="Выберите курс" /></SelectTrigger>
                    <SelectContent>
                      {courses.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <label className="text-sm font-medium mb-1 block">Макс. участников</label>
                <Input type="number" value={maxParticipants} onChange={e => setMaxParticipants(e.target.value)} min="2" max="1000" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Отмена</Button>
              <Button onClick={handleCreate} disabled={!title || !scheduledAt || !streamUrl || creating} className="gap-2">
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                Создать
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* End webinar dialog — ask for recording URL */}
      <Dialog open={!!recordingDialog} onOpenChange={open => { if (!open) { setRecordingDialog(null); setRecordingUrl(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Завершить вебинар</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Вы можете добавить ссылку на запись вебинара (необязательно):</p>
            <Input
              value={recordingUrl}
              onChange={e => setRecordingUrl(e.target.value)}
              placeholder="https://... ссылка на запись"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRecordingDialog(null); setRecordingUrl(""); }}>Отмена</Button>
            <Button onClick={handleEndConfirm}>Завершить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : webinars.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Video className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Нет вебинаров</h3>
            <p className="text-muted-foreground mb-4">Создайте встречу в Яндекс Телемосте и добавьте ссылку</p>
            <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Создать вебинар
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {live.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Radio className="w-4 h-4 text-destructive animate-pulse" />
                В эфире ({live.length})
              </h3>
              {live.map(w => (
                <WebinarCard key={w.id} webinar={w} onEnd={handleEnd} onOpen={handleOpenStream} onDelete={deleteWebinar} isLive />
              ))}
            </div>
          )}

          {upcoming.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Предстоящие ({upcoming.length})</h3>
              {upcoming.map(w => (
                <WebinarCard key={w.id} webinar={w} onStart={handleStart} onOpen={handleOpenStream} onDelete={deleteWebinar} />
              ))}
            </div>
          )}

          {ended.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Завершённые ({ended.length})</h3>
              {ended.map(w => (
                <WebinarCard key={w.id} webinar={w} onDelete={deleteWebinar} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function WebinarCard({ webinar, onStart, onEnd, onOpen, onDelete, isLive }: {
  webinar: Webinar;
  onStart?: (w: Webinar) => void;
  onEnd?: (id: string) => void;
  onOpen?: (w: Webinar) => void;
  onDelete: (id: string) => void;
  isLive?: boolean;
}) {
  const status = STATUS_CONFIG[webinar.status] || STATUS_CONFIG.scheduled;

  return (
    <Card className={isLive ? "border-destructive/50 bg-destructive/5" : ""}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold truncate">{webinar.title}</h4>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            {webinar.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{webinar.description}</p>
            )}
            {webinar.stream_url && (
              <div className="flex items-center gap-1.5 text-xs text-primary mb-2">
                <Link2 className="w-3.5 h-3.5" />
                <span className="truncate max-w-[300px]">{webinar.stream_url}</span>
              </div>
            )}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {format(new Date(webinar.scheduled_at), "d MMM yyyy, HH:mm", { locale: ru })}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {webinar.duration_minutes} мин
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                до {webinar.max_participants} чел.
              </span>
            </div>
            <div className="mt-1">
              <span className="text-xs text-muted-foreground">
                Доступ: {ACCESS_TYPE_LABELS[webinar.access_type] || webinar.access_type}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {webinar.status === "scheduled" && onStart && (
              <Button size="sm" onClick={() => onStart(webinar)} className="gap-1.5">
                <Play className="w-4 h-4" />
                Начать
              </Button>
            )}
            {isLive && onOpen && (
              <Button size="sm" variant="outline" onClick={() => onOpen(webinar)} className="gap-1.5">
                <ExternalLink className="w-4 h-4" />
                Открыть Телемост
              </Button>
            )}
            {isLive && onEnd && (
              <Button size="sm" variant="destructive" onClick={() => onEnd(webinar.id)} className="gap-1.5">
                <Square className="w-4 h-4" />
                Завершить
              </Button>
            )}
            {webinar.recording_url && (
              <Button size="sm" variant="outline" asChild>
                <a href={webinar.recording_url} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                  <Play className="w-4 h-4" />
                  Запись
                </a>
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="text-destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Удалить вебинар?</AlertDialogTitle>
                  <AlertDialogDescription>Это действие нельзя отменить.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(webinar.id)}>Удалить</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
