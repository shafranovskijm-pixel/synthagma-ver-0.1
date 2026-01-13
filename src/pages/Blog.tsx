import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowLeft, Calendar, Clock, User, ArrowRight, BookOpen, TrendingUp, Shield, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  category: string;
  author: string;
  date: string;
  readTime: string;
  image: string;
  featured?: boolean;
  icon: React.ReactNode;
}

const blogPosts: BlogPost[] = [
  {
    id: "1",
    title: "Как организовать эффективное дистанционное обучение в 2026 году",
    excerpt: "Рассказываем о ключевых трендах и лучших практиках организации онлайн-обучения для корпоративных клиентов и образовательных учреждений.",
    category: "Тренды",
    author: "Команда СИНТАГМА",
    date: "10 января 2026",
    readTime: "7 мин",
    image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&h=400&fit=crop",
    featured: true,
    icon: <TrendingUp className="h-5 w-5" />
  },
  {
    id: "2",
    title: "Автоматизация документооборота: от заявки до диплома",
    excerpt: "Полный гайд по настройке автоматического формирования документов — договоры, акты, удостоверения и выгрузка в ФРДО.",
    category: "Гайды",
    author: "Команда СИНТАГМА",
    date: "8 января 2026",
    readTime: "12 мин",
    image: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&h=400&fit=crop",
    featured: true,
    icon: <BookOpen className="h-5 w-5" />
  },
  {
    id: "3",
    title: "Безопасность данных слушателей: чек-лист для образовательных организаций",
    excerpt: "Проверьте, соответствует ли ваша система требованиям 152-ФЗ и защищены ли персональные данные ваших учеников.",
    category: "Безопасность",
    author: "Команда СИНТАГМА",
    date: "5 января 2026",
    readTime: "5 мин",
    image: "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&h=400&fit=crop",
    icon: <Shield className="h-5 w-5" />
  },
  {
    id: "4",
    title: "ИИ-помощник в обучении: возможности и ограничения",
    excerpt: "Как использовать искусственный интеллект для генерации курсов, проверки тестов и персонализации обучения.",
    category: "Технологии",
    author: "Команда СИНТАГМА",
    date: "2 января 2026",
    readTime: "8 мин",
    image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&h=400&fit=crop",
    icon: <Lightbulb className="h-5 w-5" />
  },
  {
    id: "5",
    title: "Интеграция с 1С: синхронизация данных учебного центра",
    excerpt: "Пошаговая инструкция по настройке обмена данными между СИНТАГМА и вашей учётной системой.",
    category: "Интеграции",
    author: "Команда СИНТАГМА",
    date: "28 декабря 2025",
    readTime: "10 мин",
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=400&fit=crop",
    icon: <BookOpen className="h-5 w-5" />
  },
  {
    id: "6",
    title: "Как повысить завершаемость онлайн-курсов до 85%",
    excerpt: "Делимся проверенными методиками мотивации слушателей и геймификации образовательного процесса.",
    category: "Методология",
    author: "Команда СИНТАГМА",
    date: "25 декабря 2025",
    readTime: "6 мин",
    image: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&h=400&fit=crop",
    icon: <TrendingUp className="h-5 w-5" />
  }
];

const categories = ["Все", "Тренды", "Гайды", "Безопасность", "Технологии", "Интеграции", "Методология"];

const Blog = () => {
  const featuredPosts = blogPosts.filter(post => post.featured);
  const regularPosts = blogPosts.filter(post => !post.featured);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            <span>На главную</span>
          </Link>
          <Link to="/" className="text-xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            СИНТАГМА
          </Link>
          <div className="w-24" />
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-16 md:py-24 bg-gradient-to-b from-primary/5 to-background">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-3xl mx-auto"
          >
            <Badge variant="secondary" className="mb-4">
              Блог
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Знания для{" "}
              <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                профессионалов
              </span>
            </h1>
            <p className="text-lg text-muted-foreground">
              Статьи, гайды и новости о дистанционном обучении, автоматизации образовательных процессов и современных EdTech-технологиях
            </p>
          </motion.div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-8 border-b border-border/40">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap gap-2 justify-center">
            {categories.map((category, index) => (
              <motion.div
                key={category}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <Button
                  variant={index === 0 ? "default" : "outline"}
                  size="sm"
                  className="rounded-full"
                >
                  {category}
                </Button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Posts */}
      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold mb-8">Избранные статьи</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {featuredPosts.map((post, index) => (
              <motion.article
                key={post.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="group relative overflow-hidden rounded-2xl border border-border bg-card hover:shadow-xl transition-all duration-300"
              >
                <div className="aspect-[2/1] overflow-hidden">
                  <img
                    src={post.image}
                    alt={post.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge className="bg-primary/90 hover:bg-primary">
                      {post.icon}
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
                      {post.date}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {post.readTime}
                    </span>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* Regular Posts */}
      <section className="py-12 md:py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold mb-8">Все статьи</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {regularPosts.map((post, index) => (
              <motion.article
                key={post.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="group bg-card rounded-xl border border-border overflow-hidden hover:shadow-lg transition-all duration-300"
              >
                <div className="aspect-[16/9] overflow-hidden">
                  <img
                    src={post.image}
                    alt={post.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="secondary" className="text-xs">
                      {post.icon}
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
                        {post.date}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {post.readTime}
                      </span>
                    </div>
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-2xl mx-auto text-center"
          >
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Подпишитесь на рассылку
            </h2>
            <p className="text-muted-foreground mb-8">
              Получайте свежие статьи, кейсы и новости EdTech прямо на почту
            </p>
            <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <input
                type="email"
                placeholder="Ваш email"
                className="flex-1 px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <Button size="lg">
                Подписаться
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border/40">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2026 СИНТАГМА. Все права защищены.</p>
        </div>
      </footer>
    </div>
  );
};

export default Blog;
