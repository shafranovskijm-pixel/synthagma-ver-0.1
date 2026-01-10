import { useAuth } from "@/hooks/useAuth";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Button } from "@/components/ui/button";
import { LogOut, BookOpen, Clock, Trophy, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

const StudentDashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <SigmaLogo size="md" />
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Выйти
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-6 py-10">
        <div className="mb-10">
          <h1 className="font-display text-3xl font-bold mb-2">
            Добро пожаловать! 👋
          </h1>
          <p className="text-muted-foreground">
            Ваш личный кабинет ученика
          </p>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-4 gap-6 mb-10">
          <div className="feature-card">
            <div className="w-12 h-12 rounded-xl bg-sigma-blue/10 flex items-center justify-center mb-4">
              <BookOpen className="w-6 h-6 text-sigma-blue" />
            </div>
            <div className="text-3xl font-bold font-display mb-1">0</div>
            <div className="text-muted-foreground text-sm">Активных курсов</div>
          </div>

          <div className="feature-card">
            <div className="w-12 h-12 rounded-xl bg-sigma-green/10 flex items-center justify-center mb-4">
              <Trophy className="w-6 h-6 text-sigma-green" />
            </div>
            <div className="text-3xl font-bold font-display mb-1">0</div>
            <div className="text-muted-foreground text-sm">Завершено курсов</div>
          </div>

          <div className="feature-card">
            <div className="w-12 h-12 rounded-xl bg-sigma-purple/10 flex items-center justify-center mb-4">
              <Clock className="w-6 h-6 text-sigma-purple" />
            </div>
            <div className="text-3xl font-bold font-display mb-1">0 ч</div>
            <div className="text-muted-foreground text-sm">Время обучения</div>
          </div>

          <div className="feature-card">
            <div className="w-12 h-12 rounded-xl bg-sigma-cyan/10 flex items-center justify-center mb-4">
              <MessageCircle className="w-6 h-6 text-sigma-cyan" />
            </div>
            <div className="text-3xl font-bold font-display mb-1">ИИ</div>
            <div className="text-muted-foreground text-sm">Помощник доступен</div>
          </div>
        </div>

        {/* Courses section */}
        <div>
          <h2 className="font-display text-2xl font-bold mb-6">Мои курсы</h2>
          
          <div className="glass-card rounded-2xl p-12 text-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <BookOpen className="w-10 h-10 text-primary" />
            </div>
            <h3 className="font-display text-xl font-semibold mb-2">
              Пока нет курсов
            </h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Вы ещё не записаны ни на один курс. Свяжитесь с вашей организацией 
              для получения доступа к учебным материалам.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default StudentDashboard;
