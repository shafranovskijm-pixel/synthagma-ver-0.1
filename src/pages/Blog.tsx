import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Calendar, Clock, ArrowRight, BookOpen, TrendingUp, Shield, Lightbulb, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Footer } from "@/components/landing/Footer";
import { TypewriterText } from "@/components/ui/TypewriterText";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  category: string;
  author: string;
  image_url: string | null;
  is_featured: boolean;
  read_time: string | null;
  created_at: string;
  published_at: string | null;
}

const categoryIcons: Record<string, React.ReactNode> = {
  "Тренды": <TrendingUp className="h-4 w-4" />,
  "Гайды": <BookOpen className="h-4 w-4" />,
  "Безопасность": <Shield className="h-4 w-4" />,
  "Технологии": <Lightbulb className="h-4 w-4" />,
  "Интеграции": <BookOpen className="h-4 w-4" />,
  "Методология": <TrendingUp className="h-4 w-4" />,
  "Новости": <BookOpen className="h-4 w-4" /> };

const defaultPosts: BlogPost[] = [
  {
    id: "1",
    title: "Как организовать эффективное дистанционное обучение в 2026 году",
    slug: "effective-distance-learning-2026",
    excerpt: "Рассказываем о ключевых трендах и лучших практиках организации онлайн-обучения для корпоративных клиентов и образовательных учреждений.",
    content: null,
    category: "Тренды",
    author: "Команда СИНТАГМА",
    image_url: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&h=400&fit=crop",
    is_featured: true,
    read_time: "7 мин",
    created_at: "2026-01-10T10:00:00Z",
    published_at: "2026-01-10T10:00:00Z" },
  {
    id: "2",
    title: "Автоматизация документооборота: от заявки до диплома",
    slug: "document-automation-guide",
    excerpt: "Полный гайд по настройке автоматического формирования документов — договоры, акты, удостоверения и выгрузка в ФРДО.",
    content: null,
    category: "Гайды",
    author: "Команда СИНТАГМА",
    image_url: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&h=400&fit=crop",
    is_featured: true,
    read_time: "12 мин",
    created_at: "2026-01-08T10:00:00Z",
    published_at: "2026-01-08T10:00:00Z" },
  {
    id: "3",
    title: "Безопасность данных слушателей: чек-лист для образовательных организаций",
    slug: "student-data-security-checklist",
    excerpt: "Проверьте, соответствует ли ваша система требованиям 152-ФЗ и защищены ли персональные данные ваших учеников.",
    content: null,
    category: "Безопасность",
    author: "Команда СИНТАГМА",
    image_url: "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&h=400&fit=crop",
    is_featured: false,
    read_time: "5 мин",
    created_at: "2026-01-05T10:00:00Z",
    published_at: "2026-01-05T10:00:00Z" },
  {
    id: "4",
    title: "ИИ-помощник в обучении: возможности и ограничения",
    slug: "ai-assistant-in-learning",
    excerpt: "Как использовать искусственный интеллект для генерации курсов, проверки тестов и персонализации обучения.",
    content: null,
    category: "Технологии",
    author: "Команда СИНТАГМА",
    image_url: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&h=400&fit=crop",
    is_featured: false,
    read_time: "8 мин",
    created_at: "2026-01-02T10:00:00Z",
    published_at: "2026-01-02T10:00:00Z" },
];

const categories = ["Все", "Тренды", "Гайды", "Безопасность", "Технологии", "Интеграции", "Методология", "Новости"];

const Blog = () => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("Все");
  const [email, setEmail] = useState("");
  const [isSubscribing, setIsSubscribing] = useState(false);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("is_published", true)
        .order("published_at", { ascending: false });

      if (error) throw error;
      
      // Use database posts if available, otherwise use default posts
      setPosts(data && data.length > 0 ? data : defaultPosts);
    } catch (error) {
      console.error("Error fetching posts:", error);
      setPosts(defaultPosts);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredPosts = selectedCategory === "Все" 
    ? posts 
    : posts.filter(post => post.category === selectedCategory);

  const featuredPosts = filteredPosts.filter(post => post.is_featured);
  const regularPosts = filteredPosts.filter(post => !post.is_featured);

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "d MMMM yyyy", { locale: ru });
    } catch {
      return dateString;
    }
  };

  const handleSubscribe = async () => {
    if (!email.trim()) {
      toast.error("Введите email");
      return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error("Введите корректный email");
      return;
    }

    setIsSubscribing(true);
    try {
      const { error } = await supabase
        .from("newsletter_subscribers")
        .insert({ email: email.trim(), source: "blog" });

      if (error) {
        if (error.code === "23505") {
          toast.info("Вы уже подписаны на рассылку");
        } else {
          throw error;
        }
      } else {
        toast.success("Вы успешно подписались на рассылку!");
        setEmail("");
      }
    } catch (error: any) {
      console.error("Error subscribing:", error);
      toast.error("Ошибка при подписке");
    } finally {
      setIsSubscribing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <SigmaSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Блог СИНТАГМА — Новости и статьи об онлайн-образовании</title>
        <meta name="description" content="Актуальные статьи о дистанционном обучении, законодательстве в сфере ДПО, best practices для образовательных организаций." />
        <meta name="keywords" content="блог, образование, ДПО, онлайн обучение, статьи" />
        <link rel="canonical" href="https://sintagma.com.ru/blog" />
        <meta property="og:title" content="Блог СИНТАГМА — Новости и статьи об онлайн-образовании" />
        <meta property="og:description" content="Актуальные статьи о дистанционном обучении, законодательстве в сфере ДПО, best practices для образовательных организаций." />
        <meta property="og:url" content="https://sintagma.com.ru/blog" />
        <meta property="og:image" content="https://sintagma.com.ru/og-image.png" />
      </Helmet>

      <LandingHeader />

      {/* Hero Section */}
      <section className="relative py-20 md:py-28 overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-b from-accent/5 via-background to-background" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-accent/8 rounded-full blur-[100px] translate-x-1/4 -translate-y-1/4" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[80px] -translate-x-1/4 translate-y-1/4" />
        
        {/* Decorative elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-0 opacity-[0.015]" style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
            backgroundSize: '40px 40px'
          }} />
          <motion.div
            className="absolute top-20 right-[15%] w-px h-32 bg-gradient-to-b from-transparent via-accent/30 to-transparent"
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 1.5, delay: 0.3 }}
          />
          <motion.div
            className="absolute bottom-16 left-[10%] w-px h-24 bg-gradient-to-b from-transparent via-border to-transparent"
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 1.5, delay: 0.5 }}
          />
          <motion.div
            className="absolute top-16 left-8 w-12 h-12 border-l border-t border-accent/15 rounded-tl-2xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.7 }}
          />
          <motion.div
            className="absolute bottom-16 right-8 w-12 h-12 border-r border-b border-accent/15 rounded-br-2xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.8 }}
          />
          <motion.div
            className="absolute top-1/3 left-[20%] w-2 h-2 rounded-full bg-accent/30"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.8, delay: 1 }}
          />
          <motion.div
            className="absolute top-1/2 right-[25%] w-3 h-3 rounded-full border border-accent/25"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.8, delay: 1.1 }}
          />
          <motion.div
            className="absolute bottom-1/3 right-[35%] w-1.5 h-1.5 rounded-full bg-accent/35"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.8, delay: 1.2 }}
          />
        </div>

        <div className="container mx-auto px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-3xl mx-auto"
          >
            <span className="text-sm text-accent font-medium tracking-widest uppercase mb-4 block">
              Блог
            </span>
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-medium mb-6 tracking-tight">
              <TypewriterText text="Знания для " speed={60} delay={300} />
              <span className="text-muted-foreground">
                <TypewriterText text="профессионалов" speed={60} delay={1000} />
              </span>
            </h1>
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 1, delay: 0.3 }}
              className="flex items-center justify-center gap-2 mb-6"
            >
              <div className="w-2 h-2 rounded-full bg-accent/40" />
              <div className="w-16 h-px bg-accent" />
              <div className="w-2 h-2 rounded-full bg-accent/40" />
            </motion.div>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Статьи, гайды и новости о дистанционном обучении, автоматизации образовательных процессов и современных EdTech-технологиях
            </p>
          </motion.div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-8 border-b border-border/30">
        <div className="container mx-auto px-6">
          <div className="flex flex-wrap gap-2 justify-center">
            {categories.map((category, index) => (
              <motion.div
                key={category}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <button
                  className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                    selectedCategory === category
                      ? 'bg-foreground text-background'
                      : 'border border-border/60 text-muted-foreground hover:border-accent/50 hover:text-foreground'
                  }`}
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Posts */}
      {featuredPosts.length > 0 && (
        <section className="py-12 md:py-16">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl font-bold mb-8">Избранные статьи</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {featuredPosts.map((post, index) => (
                <Link key={post.id} to={`/blog/${post.slug}`}>
                  <motion.article
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    className="group relative overflow-hidden rounded-2xl border border-border bg-card hover:shadow-xl transition-all duration-300 cursor-pointer"
                  >
                    <div className="aspect-[2/1] overflow-hidden">
                      <img
                        src={post.image_url || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&h=400&fit=crop"}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                      <div className="flex items-center gap-2 mb-3">
                        <Badge className="bg-primary/90 hover:bg-primary">
                          {categoryIcons[post.category] || <BookOpen className="h-4 w-4" />}
                          <span className="ml-1">{post.category}</span>
                        </Badge>
                      </div>
                      <h3 className="text-xl font-bold mb-2 group-hover:text-primary-foreground/90 transition-colors">
                        {post.title}
                      </h3>
                      <p className="text-white/80 text-sm mb-4 line-clamp-2">
                        {post.excerpt}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-white/60">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(post.published_at || post.created_at)}
                        </span>
                        {post.read_time && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {post.read_time}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.article>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Regular Posts */}
      {regularPosts.length > 0 && (
        <section className="py-12 md:py-16 bg-muted/30">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl font-bold mb-8">
              {featuredPosts.length > 0 ? "Все статьи" : "Статьи"}
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {regularPosts.map((post, index) => (
                <Link key={post.id} to={`/blog/${post.slug}`}>
                  <motion.article
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    className="group bg-card rounded-xl border border-border overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer h-full"
                  >
                    <div className="aspect-[16/9] overflow-hidden">
                      <img
                        src={post.image_url || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&h=400&fit=crop"}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                    <div className="p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <Badge variant="secondary" className="text-xs">
                          {categoryIcons[post.category] || <BookOpen className="h-3 w-3" />}
                          <span className="ml-1">{post.category}</span>
                        </Badge>
                      </div>
                      <h3 className="font-semibold mb-2 group-hover:text-primary transition-colors line-clamp-2">
                        {post.title}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                        {post.excerpt}
                      </p>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(post.published_at || post.created_at)}
                          </span>
                          {post.read_time && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {post.read_time}
                            </span>
                          )}
                        </div>
                        <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </motion.article>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* No posts message */}
      {filteredPosts.length === 0 && (
        <section className="py-16">
          <div className="container mx-auto px-4 text-center">
            <p className="text-muted-foreground">Нет статей в этой категории</p>
          </div>
        </section>
      )}

      {/* Newsletter */}
      <section className="relative py-20 md:py-28 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-accent/5 to-background" />
        <div className="absolute inset-0 opacity-[0.012]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: '32px 32px'
        }} />
        <motion.div
          className="absolute top-[15%] right-0 w-px h-32 bg-gradient-to-b from-transparent via-accent/20 to-transparent"
          initial={{ scaleY: 0 }}
          whileInView={{ scaleY: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.5 }}
        />
        <motion.div
          className="absolute bottom-[20%] left-0 w-px h-24 bg-gradient-to-b from-transparent via-border to-transparent"
          initial={{ scaleY: 0 }}
          whileInView={{ scaleY: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.5, delay: 0.2 }}
        />
        <div className="container mx-auto px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-2xl mx-auto text-center"
          >
            <span className="text-sm text-accent font-medium tracking-widest uppercase mb-4 block">
              Рассылка
            </span>
            <h2 className="font-display text-3xl md:text-4xl font-medium mb-4 tracking-tight">
              Подпишитесь на рассылку
            </h2>
            <div className="flex items-center justify-center gap-2 mb-6">
              <div className="w-2 h-2 rounded-full bg-accent/40" />
              <div className="w-12 h-px bg-accent" />
              <div className="w-2 h-2 rounded-full bg-accent/40" />
            </div>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              Получайте свежие статьи, кейсы и новости EdTech прямо на почту
            </p>
            <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <input
                type="email"
                placeholder="Ваш email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 px-5 py-3.5 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all"
              />
              <Button size="lg" onClick={handleSubscribe} disabled={isSubscribing} className="btn-gradient rounded-xl px-6">
                {isSubscribing ? (
                  <SigmaSpinner size="sm" className="mr-2" />
                ) : (
                  <Mail className="h-4 w-4 mr-2" />
                )}
                Подписаться
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Blog;
