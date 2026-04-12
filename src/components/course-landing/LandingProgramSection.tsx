interface LessonInfo {
  id: string;
  title: string;
  type: string;
  order_index: number;
}

interface Props {
  lessons: LessonInfo[];
  accentColor: string | null;
}

const lessonTypeIcon = (type: string) => {
  switch (type) {
    case "video": return "🎬";
    case "test": return "📝";
    case "practice": return "💻";
    default: return "📖";
  }
};

export function LandingProgramSection({ lessons, accentColor }: Props) {
  const accent = accentColor || "hsl(var(--primary))";

  if (lessons.length === 0) return null;

  return (
    <section className="py-16 px-6 bg-muted/30">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold mb-8">Программа курса</h2>
        <div className="space-y-2">
          {lessons.map((lesson, i) => (
            <div
              key={lesson.id}
              className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border hover:shadow-sm transition-shadow"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                style={{ backgroundColor: `${accent}18`, color: accent }}
              >
                {i + 1}
              </div>
              <span className="text-lg">{lessonTypeIcon(lesson.type)}</span>
              <span className="font-medium text-sm">{lesson.title}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
