import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { MessageSquare, Send, Trash2} from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface Comment {
  id: string;
  content: string;
  created_at: string;
  created_by: string | null;
}

interface OrgCommentsTabProps {
  organizationId: string;
}

export function OrgCommentsTab({ organizationId }: OrgCommentsTabProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchComments();
  }, [organizationId]);

  const fetchComments = async () => {
    try {
      const { data, error } = await supabase
        .from("organization_comments")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setComments(data || []);
    } catch (error) {
      console.error("Error fetching comments:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("organization_comments")
        .insert({
          organization_id: organizationId,
          content: newComment.trim(),
          created_by: user?.id });

      if (error) throw error;

      toast.success("Комментарий добавлен");
      setNewComment("");
      fetchComments();
    } catch (error) {
      console.error("Error adding comment:", error);
      toast.error("Ошибка добавления комментария");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteComment = async (id: string) => {
    if (!confirm("Удалить комментарий?")) return;

    try {
      const { error } = await supabase
        .from("organization_comments")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Комментарий удалён");
      fetchComments();
    } catch (error) {
      console.error("Error deleting comment:", error);
      toast.error("Ошибка удаления комментария");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <SigmaSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add Comment */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Новый комментарий
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Textarea
              placeholder="Введите комментарий..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={3}
            />
            <Button 
              onClick={handleAddComment} 
              disabled={saving || !newComment.trim()}
              className="w-full sm:w-auto"
            >
              {saving ? (
                <SigmaSpinner size="sm" className="mr-2" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Отправить
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Comments List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Комментарии ({comments.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-4">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="p-4 bg-muted/50 rounded-lg space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm whitespace-pre-wrap flex-1">
                      {comment.content}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive shrink-0"
                      onClick={() => handleDeleteComment(comment.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(comment.created_at), "d MMMM yyyy, HH:mm", { locale: ru })}
                  </p>
                </div>
              ))}
              {comments.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  Нет комментариев
                </p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
