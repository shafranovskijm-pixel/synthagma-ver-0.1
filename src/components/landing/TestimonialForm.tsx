import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Star, MessageSquarePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LandingLoginDialog } from "./LandingLoginDialog";
import { toast } from "sonner";

interface TestimonialFormProps {
  onSubmitted?: () => void;
}

export function TestimonialForm({ onSubmitted }: TestimonialFormProps) {
  const [showLogin, setShowLogin] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isOrgUser, setIsOrgUser] = useState(false);
  const [orgName, setOrgName] = useState("");

  const [rating, setRating] = useState(5);
  const [content, setContent] = useState("");
  const [highlight, setHighlight] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [authorRole, setAuthorRole] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser(data.user);
        checkOrgRole(data.user.id);
      }
    });
  }, []);

  const checkOrgRole = async (userId: string) => {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    
    const hasOrg = roles?.some((r: any) => r.role === "organization");
    setIsOrgUser(hasOrg || false);

    if (hasOrg) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id, full_name")
        .eq("user_id", userId)
        .single();
      
      if (profile?.full_name) setAuthorName(profile.full_name);
      
      if (profile?.organization_id) {
        const { data: org } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", profile.organization_id)
          .single();
        if (org) setOrgName(org.name);
      }
    }
  };

  const handleOpenForm = () => {
    if (!user) {
      setShowLogin(true);
    } else if (!isOrgUser) {
      toast.error("Доступ ограничен", { description: "Оставлять отзывы могут только зарегистрированные организации" });
    } else {
      setShowForm(true);
    }
  };

  const handleLoginSuccess = async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      setUser(data.user);
      await checkOrgRole(data.user.id);
      setShowForm(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !content.trim() || !authorName.trim()) return;

    setLoading(true);
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .single();

      const { error } = await (supabase.from("testimonials") as any).insert({
        user_id: user.id,
        organization_id: profile?.organization_id,
        content: content.trim(),
        highlight: highlight.trim() || null,
        rating,
        author_name: authorName.trim(),
        author_role: authorRole.trim() || null,
      });

      if (error) throw error;

      toast.success("Отзыв отправлен!", { description: "Он будет опубликован после модерации" });
      setShowForm(false);
      setContent("");
      setHighlight("");
      setRating(5);
      onSubmitted?.();
    } catch (err: any) {
      toast.error("Ошибка", { description: "err.message" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={handleOpenForm}
        className="mt-8 mx-auto flex items-center gap-2"
      >
        <MessageSquarePlus className="w-4 h-4" />
        Оставить отзыв
      </Button>

      <LandingLoginDialog
        open={showLogin}
        onOpenChange={setShowLogin}
        onSuccess={handleLoginSuccess}
      />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Оставить отзыв</DialogTitle>
            {orgName && (
              <p className="text-sm text-muted-foreground">{orgName}</p>
            )}
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Rating */}
            <div className="space-y-2">
              <Label>Оценка</Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setRating(v)}
                    className="p-0.5"
                  >
                    <Star
                      className={`w-6 h-6 transition-colors ${
                        v <= rating ? "text-accent fill-accent" : "text-muted-foreground"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Author */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="t-name">Ваше имя</Label>
                <Input
                  id="t-name"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Иванов И.И."
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="t-role">Должность</Label>
                <Input
                  id="t-role"
                  value={authorRole}
                  onChange={(e) => setAuthorRole(e.target.value)}
                  placeholder="Директор"
                />
              </div>
            </div>

            {/* Highlight */}
            <div className="space-y-2">
              <Label htmlFor="t-highlight">Заголовок (бейдж)</Label>
              <Input
                id="t-highlight"
                value={highlight}
                onChange={(e) => setHighlight(e.target.value)}
                placeholder="Экономия на обучении"
                maxLength={40}
              />
            </div>

            {/* Content */}
            <div className="space-y-2">
              <Label htmlFor="t-content">Текст отзыва</Label>
              <Textarea
                id="t-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Расскажите о вашем опыте..."
                rows={4}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Отправка..." : "Отправить отзыв"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
