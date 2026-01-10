import { Button } from "@/components/ui/button";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";
import { ArrowLeft, Mail, Lock, User, Building } from "lucide-react";

const Register = () => {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side - Visual */}
      <div className="hidden lg:flex flex-1 relative bg-gradient-to-br from-sigma-purple via-accent to-primary items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0wLTZoLTJWNmgydjR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-30" />
        
        <div className="relative z-10 text-center text-white px-12">
          <div className="w-32 h-32 rounded-3xl bg-white/20 backdrop-blur-xl flex items-center justify-center mx-auto mb-8">
            <span className="font-display text-6xl font-bold">Σ</span>
          </div>
          <h2 className="font-display text-4xl font-bold mb-4">
            Начните сегодня
          </h2>
          <p className="text-white/80 text-lg max-w-md">
            Создайте свою образовательную платформу за считанные минуты
          </p>
        </div>

        {/* Decorative circles */}
        <div className="absolute top-20 right-20 w-40 h-40 rounded-full border border-white/20" />
        <div className="absolute bottom-20 left-20 w-60 h-60 rounded-full border border-white/10" />
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex flex-col justify-center px-8 lg:px-16">
        <div className="max-w-md w-full mx-auto">
          <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8">
            <ArrowLeft className="w-4 h-4" />
            Назад
          </Link>
          
          <SigmaLogo size="lg" className="mb-8" />
          
          <h1 className="font-display text-3xl font-bold mb-2">Регистрация</h1>
          <p className="text-muted-foreground mb-8">
            Создайте аккаунт для вашей организации
          </p>

          <form className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="org">Название организации</Label>
              <div className="relative">
                <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  id="org" 
                  type="text" 
                  placeholder="ООО «Компания»" 
                  className="pl-10 h-12 rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Ваше имя</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  id="name" 
                  type="text" 
                  placeholder="Иван Иванов" 
                  className="pl-10 h-12 rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="your@email.com" 
                  className="pl-10 h-12 rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  id="password" 
                  type="password" 
                  placeholder="••••••••" 
                  className="pl-10 h-12 rounded-xl"
                />
              </div>
            </div>

            <div className="flex items-start gap-2">
              <input type="checkbox" className="rounded border-border mt-1" />
              <span className="text-sm text-muted-foreground">
                Я соглашаюсь с{" "}
                <a href="#" className="text-primary hover:underline">условиями использования</a>
                {" "}и{" "}
                <a href="#" className="text-primary hover:underline">политикой конфиденциальности</a>
              </span>
            </div>

            <Button className="w-full btn-gradient h-12 rounded-xl text-lg">
              Создать аккаунт
            </Button>
          </form>

          <p className="text-center text-muted-foreground mt-8">
            Уже есть аккаунт?{" "}
            <Link to="/login" className="text-primary hover:underline font-medium">
              Войти
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
