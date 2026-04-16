import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, Sparkles, Pencil, Trash2, Eye, EyeOff, Star, StarOff, FileText, Calendar, Mail, Users, MessageSquare } from "lucide-react";
import { TestimonialsManager } from "./TestimonialsManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useBlogManager, BLOG_CATEGORIES } from "@/hooks/useBlogManager";

export function BlogManager() {
  const h = useBlogManager();

  if (h.isLoading) return <div className="flex items-center justify-center py-12"><SigmaSpinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-semibold">Управление блогом</h2><p className="text-sm text-muted-foreground">{h.posts.length} статей • {h.posts.filter(p => p.is_published).length} опубликовано • {h.subscribers.length} подписчиков</p></div>
        <Button onClick={h.openCreateDialog} className="gap-2"><Plus className="h-4 w-4" />Новая статья</Button>
      </div>

      <Tabs defaultValue="posts" className="w-full">
        <TabsList>
          <TabsTrigger value="posts" className="gap-2"><FileText className="h-4 w-4" />Статьи ({h.posts.length})</TabsTrigger>
          <TabsTrigger value="subscribers" className="gap-2"><Users className="h-4 w-4" />Подписчики ({h.subscribers.length})</TabsTrigger>
          <TabsTrigger value="testimonials" className="gap-2"><MessageSquare className="h-4 w-4" />Отзывы</TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="mt-6">
          {h.posts.length === 0 ? (
            <Card className="p-12 text-center"><FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" /><h3 className="font-semibold mb-2">Нет статей</h3><p className="text-sm text-muted-foreground mb-4">Создайте первую статью с помощью ИИ</p><Button onClick={h.openCreateDialog} className="gap-2"><Sparkles className="h-4 w-4" />Создать с ИИ</Button></Card>
          ) : (
            <div className="grid gap-4">
              {h.posts.map(post => (
                <Card key={post.id} className="overflow-hidden">
                  <div className="flex items-start gap-4 p-4">
                    {post.image_url && <img src={post.image_url} alt={post.title} className="w-24 h-16 rounded-lg object-cover flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={post.is_published ? "default" : "secondary"}>{post.is_published ? "Опубликовано" : "Черновик"}</Badge>
                            <Badge variant="outline">{post.category}</Badge>
                            {post.is_featured && <Badge className="bg-yellow-500/10 text-yellow-600">Избранное</Badge>}
                          </div>
                          <h3 className="font-semibold line-clamp-1">{post.title}</h3>
                          {post.excerpt && <p className="text-sm text-muted-foreground line-clamp-1 mt-1">{post.excerpt}</p>}
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(post.created_at), "d MMM yyyy", { locale: ru })}</span>
                            {post.read_time && <span>{post.read_time}</span>}<span>{post.views_count} просмотров</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button variant="ghost" size="icon" onClick={() => h.toggleFeatured(post)} title={post.is_featured ? "Убрать из избранного" : "В избранное"}>{post.is_featured ? <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" /> : <StarOff className="h-4 w-4" />}</Button>
                          <Button variant="ghost" size="icon" onClick={() => h.togglePublish(post)} title={post.is_published ? "Снять с публикации" : "Опубликовать"}>{post.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
                          <Button variant="ghost" size="icon" onClick={() => h.openEditDialog(post)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => h.deletePost(post.id)} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
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
          {h.isLoadingSubscribers ? <div className="flex items-center justify-center py-12"><SigmaSpinner size="lg" /></div>
            : h.subscribers.length === 0 ? <Card className="p-12 text-center"><Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" /><h3 className="font-semibold mb-2">Нет подписчиков</h3><p className="text-sm text-muted-foreground">Подписчики появятся здесь после подписки на рассылку в блоге</p></Card>
            : <Card><div className="divide-y">{h.subscribers.map(sub => (
              <div key={sub.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3"><div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center"><Mail className="h-5 w-5 text-primary" /></div><div><p className="font-medium">{sub.email}</p><p className="text-sm text-muted-foreground">{format(new Date(sub.subscribed_at), "d MMM yyyy, HH:mm", { locale: ru })}{sub.source && ` • ${sub.source}`}</p></div></div>
                <Button variant="ghost" size="icon" onClick={() => h.deleteSubscriber(sub.id)} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}</div></Card>}
        </TabsContent>

        <TabsContent value="testimonials" className="mt-6"><TestimonialsManager /></TabsContent>
      </Tabs>

      <Dialog open={h.isDialogOpen} onOpenChange={h.setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{h.editingPost ? "Редактировать статью" : "Новая статья"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            {!h.editingPost && (
              <Card className="p-4 bg-primary/5 border-primary/20">
                <div className="flex items-center gap-2 mb-3"><Sparkles className="h-5 w-5 text-primary" /><span className="font-medium">Генерация с ИИ</span></div>
                <div className="flex gap-2">
                  <Input placeholder="Введите тему статьи..." value={h.topic} onChange={e => h.setTopic(e.target.value)} className="flex-1" />
                  <Select value={h.category} onValueChange={h.setCategory}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent>{BLOG_CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}</SelectContent></Select>
                  <Button onClick={h.generateWithAI} disabled={h.isGenerating}>{h.isGenerating ? <SigmaSpinner size="sm" /> : <Sparkles className="h-4 w-4" />}</Button>
                </div>
              </Card>
            )}
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Заголовок</Label><Input value={h.title} onChange={e => h.setTitle(e.target.value)} placeholder="Заголовок статьи" /></div>
                <div className="space-y-2"><Label>Slug (URL)</Label><Input value={h.slug} onChange={e => h.setSlug(e.target.value)} placeholder="url-statyi" /></div>
              </div>
              <div className="space-y-2"><Label>Краткое описание</Label><Textarea value={h.excerpt} onChange={e => h.setExcerpt(e.target.value)} placeholder="Краткое описание для превью..." rows={2} /></div>
              <div className="space-y-2"><Label>Содержимое (Markdown)</Label><Textarea value={h.content} onChange={e => h.setContent(e.target.value)} placeholder="Полный текст статьи..." rows={10} className="font-mono text-sm" /></div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2"><Label>Категория</Label><Select value={h.category} onValueChange={h.setCategory}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{BLOG_CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Время чтения</Label><Input value={h.readTime} onChange={e => h.setReadTime(e.target.value)} placeholder="5 мин" /></div>
                <div className="space-y-2"><Label>URL изображения</Label><Input value={h.imageUrl} onChange={e => h.setImageUrl(e.target.value)} placeholder="https://..." /></div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2"><Switch id="published" checked={h.isPublished} onCheckedChange={h.setIsPublished} /><Label htmlFor="published">Опубликовать</Label></div>
                <div className="flex items-center gap-2"><Switch id="featured" checked={h.isFeatured} onCheckedChange={h.setIsFeatured} /><Label htmlFor="featured">Избранное</Label></div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => h.setIsDialogOpen(false)}>Отмена</Button>
            <Button onClick={h.savePost} disabled={h.isSaving}>{h.isSaving ? <SigmaSpinner size="sm" className="mr-2" /> : null}{h.editingPost ? "Сохранить" : "Создать"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
