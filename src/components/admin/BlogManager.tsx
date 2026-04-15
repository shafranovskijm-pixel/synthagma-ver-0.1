import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { 
  Plus, Sparkles, Pencil, Trash2, Eye, EyeOff, 
  Star, StarOff, FileText, Calendar, Mail, Users, MessageSquare
} from "lucide-react";
import { TestimonialsManager } from "./TestimonialsManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  category: string;
  author: string;
  image_url: string | null;
  is_published: boolean;
  is_featured: boolean;
  read_time: string | null;
  views_count: number;
  created_at: string;
  published_at: string | null;
}

interface Subscriber {
  id: string;
  email: string;
  subscribed_at: string;
  is_active: boolean;
  source: string | null;
}

const categories = [
  "Тренды",
  "Гайды", 
  "Безопасность",
  "Технологии",
  "Интеграции",
  "Методология",
  "Новости",
];

export function BlogManager() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSubscribers, setIsLoadingSubscribers] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  
  // Form state
  const [topic, setTopic] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("Новости");
  const [imageUrl, setImageUrl] = useState("");
  const [readTime, setReadTime] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);

  useEffect(() => {
    fetchPosts();
    fetchSubscribers();
  }, []);

  const fetchPosts = async () => {
    try {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPosts(data || []);
    } catch (error: any) {
      console.error("Error fetching posts:", error);
      toast.error("Ошибка загрузки статей");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSubscribers = async () => {
    try {
      const { data, error } = await supabase
        .from("newsletter_subscribers")
        .select("*")
        .order("subscribed_at", { ascending: false });

      if (error) throw error;
      setSubscribers(data || []);
    } catch (error: any) {
      console.error("Error fetching subscribers:", error);
    } finally {
      setIsLoadingSubscribers(false);
    }
  };

  const deleteSubscriber = async (id: string) => {
    if (!confirm("Удалить подписчика?")) return;
    try {
      const { error } = await supabase
        .from("newsletter_subscribers")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Подписчик удалён");
      fetchSubscribers();
    } catch (error: any) {
      toast.error("Ошибка удаления");
    }
  };

  const resetForm = () => {
    setTopic("");
    setTitle("");
    setSlug("");
    setExcerpt("");
    setContent("");
    setCategory("Новости");
    setImageUrl("");
    setReadTime("");
    setIsPublished(false);
    setIsFeatured(false);
    setEditingPost(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (post: BlogPost) => {
    setEditingPost(post);
    setTitle(post.title);
    setSlug(post.slug);
    setExcerpt(post.excerpt || "");
    setContent(post.content || "");
    setCategory(post.category);
    setImageUrl(post.image_url || "");
    setReadTime(post.read_time || "");
    setIsPublished(post.is_published);
    setIsFeatured(post.is_featured);
    setIsDialogOpen(true);
  };

  const generateWithAI = async () => {
    if (!topic.trim()) {
      toast.error("Введите тему статьи");
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await safeInvoke<any>("generate-blog-post", {
        body: { topic, category } });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      const post = data.post;
      setTitle(post.title);
      setSlug(post.slug);
      setExcerpt(post.excerpt);
      setContent(post.content);
      setReadTime(post.readTime);
      
      toast.success("Статья сгенерирована!");
    } catch (error: any) {
      console.error("Error generating post:", error);
      toast.error(error.message || "Ошибка генерации статьи");
    } finally {
      setIsGenerating(false);
    }
  };

  const savePost = async () => {
    if (!title.trim() || !slug.trim()) {
      toast.error("Заполните заголовок и slug");
      return;
    }

    setIsSaving(true);
    try {
      const postData = {
        title,
        slug,
        excerpt: excerpt || null,
        content: content || null,
        category,
        image_url: imageUrl || null,
        read_time: readTime || null,
        is_published: isPublished,
        is_featured: isFeatured,
        published_at: isPublished && !editingPost?.published_at ? new Date().toISOString() : editingPost?.published_at };

      if (editingPost) {
        const { error } = await supabase
          .from("blog_posts")
          .update(postData)
          .eq("id", editingPost.id);

        if (error) throw error;
        toast.success("Статья обновлена");
      } else {
        const { error } = await supabase
          .from("blog_posts")
          .insert(postData);

        if (error) throw error;
        toast.success("Статья создана");
      }

      setIsDialogOpen(false);
      resetForm();
      fetchPosts();
    } catch (error: any) {
      console.error("Error saving post:", error);
      toast.error(error.message || "Ошибка сохранения");
    } finally {
      setIsSaving(false);
    }
  };

  const deletePost = async (id: string) => {
    if (!confirm("Удалить статью?")) return;

    try {
      const { error } = await supabase
        .from("blog_posts")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Статья удалена");
      fetchPosts();
    } catch (error: any) {
      console.error("Error deleting post:", error);
      toast.error("Ошибка удаления");
    }
  };

  const togglePublish = async (post: BlogPost) => {
    try {
      const { error } = await supabase
        .from("blog_posts")
        .update({ 
          is_published: !post.is_published,
          published_at: !post.is_published ? new Date().toISOString() : post.published_at
        })
        .eq("id", post.id);

      if (error) throw error;
      toast.success(post.is_published ? "Статья снята с публикации" : "Статья опубликована");
      fetchPosts();
    } catch (error: any) {
      toast.error("Ошибка");
    }
  };

  const toggleFeatured = async (post: BlogPost) => {
    try {
      const { error } = await supabase
        .from("blog_posts")
        .update({ is_featured: !post.is_featured })
        .eq("id", post.id);

      if (error) throw error;
      toast.success(post.is_featured ? "Убрано из избранного" : "Добавлено в избранное");
      fetchPosts();
    } catch (error: any) {
      toast.error("Ошибка");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <SigmaSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Управление блогом</h2>
          <p className="text-sm text-muted-foreground">
            {posts.length} статей • {posts.filter(p => p.is_published).length} опубликовано • {subscribers.length} подписчиков
          </p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="h-4 w-4" />
          Новая статья
        </Button>
      </div>

      <Tabs defaultValue="posts" className="w-full">
        <TabsList>
          <TabsTrigger value="posts" className="gap-2">
            <FileText className="h-4 w-4" />
            Статьи ({posts.length})
          </TabsTrigger>
          <TabsTrigger value="subscribers" className="gap-2">
            <Users className="h-4 w-4" />
            Подписчики ({subscribers.length})
          </TabsTrigger>
          <TabsTrigger value="testimonials" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Отзывы
          </TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="mt-6">

      {/* Posts Grid */}
      {posts.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">Нет статей</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Создайте первую статью с помощью ИИ
          </p>
          <Button onClick={openCreateDialog} className="gap-2">
            <Sparkles className="h-4 w-4" />
            Создать с ИИ
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {posts.map((post) => (
            <Card key={post.id} className="overflow-hidden">
              <div className="flex items-start gap-4 p-4">
                {post.image_url && (
                  <img
                    src={post.image_url}
                    alt={post.title}
                    className="w-24 h-16 rounded-lg object-cover flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={post.is_published ? "default" : "secondary"}>
                          {post.is_published ? "Опубликовано" : "Черновик"}
                        </Badge>
                        <Badge variant="outline">{post.category}</Badge>
                        {post.is_featured && (
                          <Badge className="bg-yellow-500/10 text-yellow-600">Избранное</Badge>
                        )}
                      </div>
                      <h3 className="font-semibold line-clamp-1">{post.title}</h3>
                      {post.excerpt && (
                        <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                          {post.excerpt}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(post.created_at), "d MMM yyyy", { locale: ru })}
                        </span>
                        {post.read_time && <span>{post.read_time}</span>}
                        <span>{post.views_count} просмотров</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleFeatured(post)}
                        title={post.is_featured ? "Убрать из избранного" : "В избранное"}
                      >
                        {post.is_featured ? (
                          <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                        ) : (
                          <StarOff className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => togglePublish(post)}
                        title={post.is_published ? "Снять с публикации" : "Опубликовать"}
                      >
                        {post.is_published ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(post)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deletePost(post.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
        </TabsContent>

        <TabsContent value="subscribers" className="mt-6">
          {isLoadingSubscribers ? (
            <div className="flex items-center justify-center py-12">
              <SigmaSpinner size="lg" />
            </div>
          ) : subscribers.length === 0 ? (
            <Card className="p-12 text-center">
              <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-2">Нет подписчиков</h3>
              <p className="text-sm text-muted-foreground">
                Подписчики появятся здесь после подписки на рассылку в блоге
              </p>
            </Card>
          ) : (
            <Card>
              <div className="divide-y">
                {subscribers.map((subscriber) => (
                  <div key={subscriber.id} className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Mail className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{subscriber.email}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(subscriber.subscribed_at), "d MMM yyyy, HH:mm", { locale: ru })}
                          {subscriber.source && ` • ${subscriber.source}`}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteSubscriber(subscriber.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="testimonials" className="mt-6">
          <TestimonialsManager />
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPost ? "Редактировать статью" : "Новая статья"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* AI Generation */}
            {!editingPost && (
              <Card className="p-4 bg-primary/5 border-primary/20">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <span className="font-medium">Генерация с ИИ</span>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Введите тему статьи..."
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="flex-1"
                  />
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={generateWithAI} disabled={isGenerating}>
                    {isGenerating ? (
                      <SigmaSpinner size="sm" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </Card>
            )}

            {/* Form Fields */}
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Заголовок</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Заголовок статьи"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Slug (URL)</Label>
                  <Input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="url-statyi"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Краткое описание</Label>
                <Textarea
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  placeholder="Краткое описание для превью..."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Содержимое (Markdown)</Label>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Полный текст статьи..."
                  rows={10}
                  className="font-mono text-sm"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Категория</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Время чтения</Label>
                  <Input
                    value={readTime}
                    onChange={(e) => setReadTime(e.target.value)}
                    placeholder="5 мин"
                  />
                </div>
                <div className="space-y-2">
                  <Label>URL изображения</Label>
                  <Input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    id="published"
                    checked={isPublished}
                    onCheckedChange={setIsPublished}
                  />
                  <Label htmlFor="published">Опубликовать</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="featured"
                    checked={isFeatured}
                    onCheckedChange={setIsFeatured}
                  />
                  <Label htmlFor="featured">Избранное</Label>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={savePost} disabled={isSaving}>
              {isSaving ? (
                <SigmaSpinner size="sm" className="mr-2" />
              ) : null}
              {editingPost ? "Сохранить" : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
