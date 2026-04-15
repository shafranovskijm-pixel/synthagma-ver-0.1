import { useState, useEffect } from "react";
import { MessageSquare, Send} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface Comment {
  id: string;
  author_name: string;
  content: string;
  created_at: string;
}

interface CourseCommentsProps {
  marketplaceCourseId: string;
  userId?: string;
}

export function CourseComments({ marketplaceCourseId, userId }: CourseCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [authorName, setAuthorName] = useState("");

  useEffect(() => {
    fetchComments();
    fetchAuthorName();
  }, [marketplaceCourseId]);

  const fetchComments = async () => {
    setIsLoading(true);
    const { data, error } = await (supabase as any)
      .from("marketplace_course_comments")
      .select("id, author_name, content, created_at")
      .eq("marketplace_course_id", marketplaceCourseId)
      .order("created_at", { ascending: false });

    if (!error) setComments(data || []);
    setIsLoading(false);
  };

  const fetchAuthorName = async () => {
    if (!userId) return;
    // Try profile first
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, organization_id")
      .eq("user_id", userId)
      .single();

    if (profile?.full_name) {
      setAuthorName(profile.full_name);
    } else if (profile?.organization_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", profile.organization_id)
        .single();
      if (org?.name) setAuthorName(org.name);
    }
  };

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    setIsSending(true);
    const { error } = await (supabase as any)
      .from("marketplace_course_comments")
      .insert({
        marketplace_course_id: marketplaceCourseId,
        user_id: userId,
        author_name: authorName || "Пользователь",
        content: newComment.trim() });

    if (error) {
      toast.error("Ошибка при отправке комментария");
    } else {
      setNewComment("");
      fetchComments();
    }
    setIsSending(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Комментарии ({comments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add comment form */}
        <div className="flex gap-2">
          <Textarea
            placeholder="Напишите комментарий..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            rows={2}
            className="flex-1 min-h-[60px]"
          />
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isSending || !newComment.trim()}
            className="self-end rounded-xl gap-1.5"
          >
            {isSending ? <SigmaSpinner size="sm" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>

        {/* Comments list */}
        {isLoading ? (
          <div className="flex justify-center py-4">
            <SigmaSpinner />
          </div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">Комментариев пока нет</p>
        ) : (
          <div className="space-y-3">
            {comments.map((c) => (
              <div key={c.id} className="p-3 rounded-xl bg-secondary/50 border border-border">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{c.author_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(c.created_at), "d MMM yyyy, HH:mm", { locale: ru })}
                  </span>
                </div>
                <p className="text-sm text-foreground leading-relaxed">{c.content}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
