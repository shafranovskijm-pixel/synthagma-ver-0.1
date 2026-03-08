import { useState, useEffect } from "react";
import { Star, Quote, Clock } from "lucide-react";
import { motion } from "framer-motion";

import { TestimonialForm } from "./TestimonialForm";
import { supabase } from "@/integrations/supabase/client";
import { differenceInMonths } from "date-fns";
import { FloatingParticles } from "./FloatingParticles";

const staticTestimonials = [
  {
    name: "Анна Морозова",
    role: "Директор учебного центра",
    company: "ООО «Профессионал»",
    content: "Перешли с iSpring — у них стало очень дорого. Тут в разы дешевле, так как оплата не за учеников, а фиксированная в месяц. У нас большие потоки по 200+ учеников в месяц, на Синтагме всё работает без проблем.",
    rating: 5,
    highlight: "Экономия на обучении",
    usageDuration: null as string | null,
  },
  {
    name: "Дмитрий Волков",
    role: "Руководитель IT-отдела",
    company: "ПАО «ТехноГрупп»",
    content: "У нас 50 ГБ видеоуроков — всё разместили на Синтагме. Видео отображается без проблем, ученики довольны качеством и скоростью загрузки.",
    rating: 5,
    highlight: "50 ГБ видео без проблем",
    usageDuration: null as string | null,
  },
  {
    name: "Елена Смирнова",
    role: "Руководитель HR",
    company: "Автошкола «Стандарт»",
    content: "Выгрузка в ФИС ФРДО экономит нам десятки часов работы ежемесячно. Перешли на Синтагму с другой платформы — разница колоссальная.",
    rating: 5,
    highlight: "Автоматизация ФРДО",
    usageDuration: null as string | null,
  },
];

interface DbTestimonial {
  id: string;
  content: string;
  highlight: string | null;
  rating: number;
  author_name: string;
  author_role: string | null;
  organizations?: { name: string; created_at: string } | null;
}

function getUsageDuration(orgCreatedAt: string): string {
  const months = differenceInMonths(new Date(), new Date(orgCreatedAt));
  if (months < 1) return "менее месяца";
  if (months === 1) return "1 месяц";
  if (months < 5) return `${months} месяца`;
  return `${months} месяцев`;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.15 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" as const } },
};

interface DisplayTestimonial {
  name: string;
  role: string;
  company: string;
  content: string;
  rating: number;
  highlight: string | null;
  usageDuration: string | null;
}

export function Testimonials() {
  const [testimonials, setTestimonials] = useState<DisplayTestimonial[]>(staticTestimonials);

  const fetchTestimonials = async () => {
    const { data } = await (supabase.from("testimonials") as any)
      .select("*, organizations(name, created_at)")
      .eq("is_approved", true)
      .order("created_at", { ascending: false });

    if (data && data.length > 0) {
      setTestimonials(data.map((t: DbTestimonial) => ({
        name: t.author_name,
        role: t.author_role || "",
        company: t.organizations?.name || "",
        content: t.content,
        rating: t.rating,
        highlight: t.highlight,
        usageDuration: t.organizations ? getUsageDuration(t.organizations.created_at) : null,
      })));
    }
  };

  useEffect(() => { fetchTestimonials(); }, []);

  return (
    <section className="section-padding relative overflow-hidden">
      <TestimonialsBackground />

      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <span className="text-sm text-accent font-medium tracking-widest uppercase mb-4 block">
            Отзывы
          </span>
          <h2 className="font-display text-4xl md:text-5xl font-medium mb-6 tracking-tight">Что говорят клиенты</h2>
          <div className="divider mb-6" />
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">Более 10 организаций уже получили лицензию с нашей платформой</p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto"
        >
          {testimonials.map((testimonial, idx) => (
            <TestimonialCard key={idx} testimonial={testimonial} />
          ))}
        </motion.div>

        <div className="flex justify-center">
          <TestimonialForm onSubmitted={fetchTestimonials} />
        </div>
      </div>
    </section>
  );
}

function TestimonialCard({ testimonial }: { testimonial: DisplayTestimonial }) {
  return (
    <motion.div
      variants={itemVariants}
      className="group bg-card/50 backdrop-blur-sm rounded-2xl p-8 border border-border/30 hover:border-accent/30 transition-all duration-500 hover:shadow-lg relative"
    >
      {testimonial.highlight && (
        <div className="absolute -top-3 left-6 px-3 py-1 bg-accent text-accent-foreground text-xs font-medium rounded-full">
          {testimonial.highlight}
        </div>
      )}

      <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center mb-6 group-hover:bg-accent/10 transition-colors duration-300">
        <Quote className="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors duration-300" />
      </div>

      <div className="flex gap-0.5 mb-4">
        {Array.from({ length: testimonial.rating }).map((_, i) => (
          <Star key={i} className="w-4 h-4 text-accent fill-accent" />
        ))}
      </div>

      <p className="text-foreground mb-6 leading-relaxed text-sm">
        "{testimonial.content}"
      </p>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
          <span className="text-accent font-medium text-sm">
            {testimonial.name.charAt(0)}
          </span>
        </div>
        <div>
          <div className="font-medium text-sm">{testimonial.name}</div>
          <div className="text-xs text-muted-foreground">
            {testimonial.role}{testimonial.company ? `, ${testimonial.company}` : ""}
          </div>
          {testimonial.usageDuration && (
            <div className="text-xs text-accent flex items-center gap-1 mt-0.5">
              <Clock className="w-3 h-3" />
              Пользуется {testimonial.usageDuration}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function TestimonialsBackground() {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-background via-secondary/30 to-background" />
      <div className="absolute inset-0 opacity-[0.015]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
        backgroundSize: '40px 40px'
      }} />

      {/* Blur spots */}
      <div className="absolute top-[5%] left-[5%] w-72 h-72 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[8%] right-[3%] w-64 h-64 bg-accent/4 rounded-full blur-3xl pointer-events-none" />

      <motion.div 
        className="absolute top-24 left-[12%] w-px h-40 bg-gradient-to-b from-transparent via-accent/25 to-transparent"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5 }}
      />
      <motion.div
        className="absolute top-20 right-16 w-14 h-14 border-r border-t border-accent/15 rounded-tr-2xl"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1 }}
      />
      <motion.div
        className="absolute bottom-20 left-16 w-14 h-14 border-l border-b border-accent/15 rounded-bl-2xl"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.2 }}
      />

      {/* Diamonds */}
      <motion.div
        className="absolute top-[40%] left-[6%] w-4 h-4 rotate-45 border border-accent/20"
        initial={{ opacity: 0, rotate: 0 }}
        whileInView={{ opacity: 1, rotate: 45 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.5 }}
      />
      <motion.div
        className="absolute bottom-[30%] right-[10%] w-3 h-3 rotate-45 bg-accent/10"
        initial={{ opacity: 0, rotate: 0 }}
        whileInView={{ opacity: 1, rotate: 45 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.7 }}
      />

      {/* Circles */}
      <motion.div
        className="absolute top-[60%] right-[15%] w-2.5 h-2.5 rounded-full bg-accent/30"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.6 }}
      />
      <motion.div
        className="absolute bottom-[45%] left-[18%] w-2 h-2 rounded-full border border-accent/25"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.8 }}
      />
    </>
  );
}
