import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getBaseUrl } from "@/utils/getBaseUrl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Link2, 
  Plus, 
  Copy, 
  Trash2, 
  Users,
  Calendar,
  BookOpen
} from "lucide-react";

interface RegistrationLink {
  id: string;
  token: string;
  name: string | null;
  expires_at: string | null;
  used_count: number;
  created_at: string;
  course_id: string | null;
  course?: {
    title: string;
  } | null;
}

interface Course {
  id: string;
  title: string;
}

interface Props {
  organizationId: string;
}

export const RegistrationLinksManager = ({ organizationId }: Props) => {
  const [links, setLinks] = useState<RegistrationLink[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newLinkName, setNewLinkName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchLinks();
    fetchCourses();
  }, [organizationId]);

  const fetchCourses = async () => {
    const { data, error } = await supabase
      .from('courses')
      .select('id, title')
      .eq('organization_id', organizationId)
      .eq('is_published', true)
      .order('title');

    if (!error && data) {
      setCourses(data);
    }
  };

  const fetchLinks = async () => {
    const { data, error } = await supabase
      .from('registration_links')
      .select('*, courses:course_id(title)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching links:', error);
    } else {
      const formattedLinks = (data || []).map(link => ({
        ...link,
        course: link.courses ? { title: link.courses.title } : null
      }));
      setLinks(formattedLinks);
    }
    setIsLoading(false);
  };

  const generateToken = () => {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };

  const handleCreateLink = async () => {
    const token = generateToken();
    const expiresAt = expiresInDays 
      ? new Date(Date.now() + parseInt(expiresInDays) * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { data, error } = await supabase
      .from('registration_links')
      .insert({
        token,
        name: newLinkName || null,
        organization_id: organizationId,
        expires_at: expiresAt,
        course_id: selectedCourseId || null
      })
      .select('*, courses:course_id(title)')
      .single();

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось создать ссылку",
        variant: "destructive",
      });
    } else {
      const formattedLink = {
        ...data,
        course: data.courses ? { title: data.courses.title } : null
      };
      toast({
        title: "Ссылка создана!",
        description: selectedCourseId 
          ? "Ученики будут автоматически записаны на курс" 
          : "Скопируйте ссылку и отправьте ученикам",
      });
      setLinks([formattedLink, ...links]);
      setIsCreateOpen(false);
      setNewLinkName("");
      setExpiresInDays("");
      setSelectedCourseId("");
    }
  };

  const handleDeleteLink = async (id: string) => {
    const { error } = await supabase
      .from('registration_links')
      .delete()
      .eq('id', id);

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось удалить ссылку",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Удалено",
        description: "Ссылка удалена",
      });
      setLinks(links.filter(l => l.id !== id));
    }
  };

  const copyLink = (token: string) => {
    const url = `${getBaseUrl()}/join/${token}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Скопировано!",
      description: "Ссылка скопирована в буфер обмена",
    });
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">Ссылки для регистрации</h3>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Создать ссылку
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Новая ссылка для регистрации</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Название (опционально)</Label>
                <Input 
                  placeholder="Например: Группа А-2024"
                  value={newLinkName}
                  onChange={(e) => setNewLinkName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Автозапись на курс (опционально)</Label>
                <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите курс для автозаписи" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Без автозаписи</SelectItem>
                    {courses.map(course => (
                      <SelectItem key={course.id} value={course.id}>
                        {course.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Ученики будут автоматически записаны на этот курс при регистрации
                </p>
              </div>
              <div className="space-y-2">
                <Label>Срок действия (дней)</Label>
                <Input 
                  type="number"
                  placeholder="Оставьте пустым для бессрочной"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                />
              </div>
              <Button 
                className="w-full"
                onClick={handleCreateLink}
              >
                Создать ссылку
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {links.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Link2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Нет активных ссылок</p>
          <p className="text-sm">Создайте ссылку для регистрации учеников</p>
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((link) => (
            <div 
              key={link.id} 
              className={`flex items-center justify-between p-4 rounded-xl border ${
                isExpired(link.expires_at) 
                  ? 'bg-muted/50 border-muted' 
                  : 'bg-card border-border'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  isExpired(link.expires_at) 
                    ? 'bg-muted text-muted-foreground' 
                    : 'bg-primary/10 text-primary'
                }`}>
                  <Link2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-medium">
                    {link.name || 'Без названия'}
                    {isExpired(link.expires_at) && (
                      <span className="ml-2 text-xs text-destructive">(истекла)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {link.used_count} регистраций
                    </span>
                    {link.course && (
                      <span className="flex items-center gap-1 text-primary">
                        <BookOpen className="w-3 h-3" />
                        {link.course.title}
                      </span>
                    )}
                    {link.expires_at && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        до {formatDate(link.expires_at)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => copyLink(link.token)}
                  disabled={isExpired(link.expires_at)}
                >
                  <Copy className="w-4 h-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => handleDeleteLink(link.id)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
