import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";

export interface BlogPost {
  id: string; title: string; slug: string; excerpt: string | null; content: string | null;
  category: string; author: string; image_url: string | null; is_published: boolean;
  is_featured: boolean; read_time: string | null; views_count: number; created_at: string; published_at: string | null;
}

export interface Subscriber {
  id: string; email: string; subscribed_at: string; is_active: boolean; source: string | null;
}

export const BLOG_CATEGORIES = ["Тренды", "Гайды", "Безопасность", "Технологии", "Интеграции", "Методология", "Новости"];

export function useBlogManager() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSubscribers, setIsLoadingSubscribers] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);

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

  useEffect(() => { fetchPosts(); fetchSubscribers(); }, []);

  const fetchPosts = async () => {
    try { const { data, error } = await supabase.from("blog_posts").select("*").order("created_at", { ascending: false }); if (error) throw error; setPosts(data || []); }
    catch { toast.error("Ошибка загрузки статей"); }
    finally { setIsLoading(false); }
  };

  const fetchSubscribers = async () => {
    try { const { data, error } = await supabase.from("newsletter_subscribers").select("*").order("subscribed_at", { ascending: false }); if (error) throw error; setSubscribers(data || []); }
    catch { /* silent */ }
    finally { setIsLoadingSubscribers(false); }
  };

  const deleteSubscriber = async (id: string) => {
    if (!confirm("Удалить подписчика?")) return;
    try { const { error } = await supabase.from("newsletter_subscribers").delete().eq("id", id); if (error) throw error; toast.success("Подписчик удалён"); fetchSubscribers(); }
    catch { toast.error("Ошибка удаления"); }
  };

  const resetForm = () => { setTopic(""); setTitle(""); setSlug(""); setExcerpt(""); setContent(""); setCategory("Новости"); setImageUrl(""); setReadTime(""); setIsPublished(false); setIsFeatured(false); setEditingPost(null); };

  const openCreateDialog = () => { resetForm(); setIsDialogOpen(true); };
  const openEditDialog = (post: BlogPost) => { setEditingPost(post); setTitle(post.title); setSlug(post.slug); setExcerpt(post.excerpt || ""); setContent(post.content || ""); setCategory(post.category); setImageUrl(post.image_url || ""); setReadTime(post.read_time || ""); setIsPublished(post.is_published); setIsFeatured(post.is_featured); setIsDialogOpen(true); };

  const generateWithAI = async () => {
    if (!topic.trim()) { toast.error("Введите тему статьи"); return; }
    setIsGenerating(true);
    try {
      const { data, error } = await safeInvoke<any>("generate-blog-post", { body: { topic, category } });
      if (error) throw error;
      if (data.error) { toast.error(data.error); return; }
      const post = data.post; setTitle(post.title); setSlug(post.slug); setExcerpt(post.excerpt); setContent(post.content); setReadTime(post.readTime);
      toast.success("Статья сгенерирована!");
    } catch (error: any) { toast.error(error.message || "Ошибка генерации статьи"); }
    finally { setIsGenerating(false); }
  };

  const savePost = async () => {
    if (!title.trim() || !slug.trim()) { toast.error("Заполните заголовок и slug"); return; }
    setIsSaving(true);
    try {
      const postData = { title, slug, excerpt: excerpt || null, content: content || null, category, image_url: imageUrl || null, read_time: readTime || null, is_published: isPublished, is_featured: isFeatured, published_at: isPublished && !editingPost?.published_at ? new Date().toISOString() : editingPost?.published_at };
      if (editingPost) { const { error } = await supabase.from("blog_posts").update(postData).eq("id", editingPost.id); if (error) throw error; toast.success("Статья обновлена"); }
      else { const { error } = await supabase.from("blog_posts").insert(postData); if (error) throw error; toast.success("Статья создана"); }
      setIsDialogOpen(false); resetForm(); fetchPosts();
    } catch (error: any) { toast.error(error.message || "Ошибка сохранения"); }
    finally { setIsSaving(false); }
  };

  const deletePost = async (id: string) => {
    if (!confirm("Удалить статью?")) return;
    try { const { error } = await supabase.from("blog_posts").delete().eq("id", id); if (error) throw error; toast.success("Статья удалена"); fetchPosts(); }
    catch { toast.error("Ошибка удаления"); }
  };

  const togglePublish = async (post: BlogPost) => {
    try { const { error } = await supabase.from("blog_posts").update({ is_published: !post.is_published, published_at: !post.is_published ? new Date().toISOString() : post.published_at }).eq("id", post.id); if (error) throw error; toast.success(post.is_published ? "Статья снята с публикации" : "Статья опубликована"); fetchPosts(); }
    catch { toast.error("Ошибка"); }
  };

  const toggleFeatured = async (post: BlogPost) => {
    try { const { error } = await supabase.from("blog_posts").update({ is_featured: !post.is_featured }).eq("id", post.id); if (error) throw error; toast.success(post.is_featured ? "Убрано из избранного" : "Добавлено в избранное"); fetchPosts(); }
    catch { toast.error("Ошибка"); }
  };

  return {
    posts, subscribers, isLoading, isLoadingSubscribers, isDialogOpen, setIsDialogOpen,
    isGenerating, isSaving, editingPost, topic, setTopic, title, setTitle, slug, setSlug,
    excerpt, setExcerpt, content, setContent, category, setCategory, imageUrl, setImageUrl,
    readTime, setReadTime, isPublished, setIsPublished, isFeatured, setIsFeatured,
    openCreateDialog, openEditDialog, generateWithAI, savePost, deletePost, deleteSubscriber,
    togglePublish, toggleFeatured,
  };
}
