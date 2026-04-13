import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Mail, Lock, User, Loader2, Building2, AlertTriangle, BookOpen, Users } from "lucide-react";

interface LinkData {
  id: string;
  token: string;
  organization_id: string;
  company_id: string | null;
  course_id: string | null;
  name: string | null;
  expires_at: string | null;
  used_count: number;
  student_group_id: string | null;
  organization?: {
    name: string;
  };
  company?: {
    name: string;
  };
  course?: {
    title: string;
  };
}

const JoinByLink = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  const [linkData, setLinkData] = useState<LinkData | null>(null);
  const [organizationName, setOrganizationName] = useState<string>("");
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [courseName, setCourseName] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (token) {
      validateLink();
    }
  }, [token]);

  useEffect(() => {
    // If user is already logged in, redirect to student dashboard
    if (user && !authLoading) {
      navigate('/student');
    }
  }, [user, authLoading, navigate]);

  const validateLink = async () => {
    try {
      // Use secure RPC to validate link (doesn't expose sensitive data)
      const { data: linkResult, error: linkError } = await supabase
        .rpc('public_validate_registration_link', { token_input: token });

      if (linkError || !linkResult || linkResult.length === 0) {
        setError('Ссылка не найдена или недействительна');
        setLoading(false);
        return;
      }

      const link = linkResult[0] as {
        id: string;
        token: string;
        organization_id: string;
        company_id: string | null;
        course_id: string | null;
        name: string | null;
        expires_at: string | null;
        used_count: number;
        student_group_id: string | null;
      };

      // Check expiration
      if (link.expires_at && new Date(link.expires_at) < new Date()) {
        setError('Срок действия ссылки истёк');
        setLoading(false);
        return;
      }

      // Fetch organization name
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', link.organization_id)
        .single();

      // Fetch company name if company_id exists
      let compName: string | null = null;
      if (link.company_id) {
        const { data: comp } = await supabase
          .from('companies')
          .select('name')
          .eq('id', link.company_id)
          .single();
        compName = comp?.name || null;
      }

      // Fetch course name if course_id exists
      let crsName: string | null = null;
      if (link.course_id) {
        const { data: crs } = await supabase
          .from('courses')
          .select('title')
          .eq('id', link.course_id)
          .single();
        crsName = crs?.title || null;
      }

      // Fetch group name if student_group_id exists
      let grpName: string | null = null;
      if (link.student_group_id) {
        const { data: grp } = await supabase
          .from('student_groups')
          .select('name')
          .eq('id', link.student_group_id)
          .single();
        grpName = (grp as any)?.name || null;
      }

      setLinkData(link);
      setOrganizationName(org?.name || 'Организация');
      setCompanyName(compName);
      setCourseName(crsName);
      setGroupName(grpName);
      setLoading(false);
    } catch (err) {
      setError('Произошла ошибка при проверке ссылки');
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName || !email || !password) {
      toast({
        title: "Ошибка",
        description: "Заполните все обязательные поля",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Ошибка",
        description: "Пароли не совпадают",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Ошибка",
        description: "Пароль должен быть не менее 6 символов",
        variant: "destructive",
      });
      return;
    }

    if (!linkData) return;

    setIsSubmitting(true);

    try {
      // Pre-check student limit
      const { data: currentCount } = await supabase.rpc('count_org_students', { org_id: linkData.organization_id });
      const { data: orgData } = await supabase
        .from('organizations')
        .select('subscription_plan')
        .eq('id', linkData.organization_id)
        .single();

      const planLimits: Record<string, number> = { free: 10, start: 100, standard: 200, professional: 1000, maximum: -1 };
      const maxStudents = planLimits[orgData?.subscription_plan || 'free'] ?? 10;
      const count = Number(currentCount) || 0;

      if (maxStudents !== -1 && count >= maxStudents) {
        toast({
          title: "Регистрация невозможна",
          description: "Организация достигла лимита учеников. Обратитесь к администратору.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      // Use edge function to register student with proper permissions
      const { data: result, error: registerError } = await safeInvoke<any>('register-student', {
        body: {
          email,
          password,
          full_name: fullName,
          organization_id: linkData.organization_id,
          company_id: linkData.company_id || null,
          course_id: linkData.course_id || null,
          student_group_id: linkData.student_group_id || null
        }
      });

      if (registerError) throw registerError;
      if (result?.error) throw new Error(result.error);

      // Sign in using the auth email (login@student.local) returned by the edge function
      const authEmail = result?.login ? `${result.login}@student.local` : email;
      const authPassword = result?.password || password;
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword
      });

      if (signInError) {
        console.error('Sign in error:', signInError);
      }

      // Increment used_count on the link
      await supabase
        .from('registration_links')
        .update({ used_count: (linkData.used_count || 0) + 1 })
        .eq('id', linkData.id);

      toast({
        title: "Успешно!",
        description: linkData.course_id 
          ? `Вы зарегистрированы и записаны на курс` 
          : `Вы зарегистрированы в ${organizationName}`,
      });

      navigate('/student');
    } catch (err: any) {
      let errorMessage = err.message;
      if (err.message.includes("already registered")) {
        errorMessage = "Пользователь с таким email уже зарегистрирован";
      }
      toast({
        title: "Ошибка регистрации",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-10 h-10 text-destructive" />
          </div>
          <h1 className="font-display text-2xl font-bold mb-2">{error}</h1>
          <p className="text-muted-foreground mb-8">
            Попросите вашу организацию отправить новую ссылку для регистрации
          </p>
          <Button asChild>
            <Link to="/">Вернуться на главную</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side - Visual */}
      <div className="hidden lg:flex flex-1 relative bg-gradient-to-br from-sigma-green via-accent to-primary items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0wLTZoLTJWNmgydjR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-30" />
        
        <div className="relative z-10 text-center text-white px-12">
          <div className="w-32 h-32 rounded-3xl bg-white/20 backdrop-blur-xl flex items-center justify-center mx-auto mb-8">
            <Building2 className="w-16 h-16" />
          </div>
          <h2 className="font-display text-4xl font-bold mb-4">
            {organizationName}
          </h2>
          <p className="text-white/80 text-lg max-w-md">
            Вы приглашены присоединиться к обучению. Создайте аккаунт для начала.
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
          
          <div className="mb-6 p-4 rounded-xl bg-sigma-green/10 border border-sigma-green/20">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-sigma-green" />
              <span className="font-medium">{organizationName}</span>
            </div>
            {linkData?.name && (
              <p className="text-sm text-muted-foreground mt-1">
                {linkData.name}
              </p>
            )}
            {companyName && (
              <p className="text-sm text-muted-foreground mt-1">
                Компания: {companyName}
              </p>
            )}
            {courseName && (
              <p className="text-sm text-primary mt-1 flex items-center gap-1">
                <BookOpen className="w-3 h-3" />
                Курс: {courseName}
              </p>
            )}
            {groupName && (
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                <Users className="w-3 h-3" />
                Группа: {groupName}
              </p>
            )}
          </div>

          <h1 className="font-display text-3xl font-bold mb-2">Регистрация</h1>
          <p className="text-muted-foreground mb-8">
            Создайте аккаунт для доступа к курсам организации
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Ваше имя *</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  id="name" 
                  type="text" 
                  placeholder="Иван Иванов" 
                  className="pl-10 h-12 rounded-xl"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="your@email.com" 
                  className="pl-10 h-12 rounded-xl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Пароль *</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  id="password" 
                  type="password" 
                  placeholder="Минимум 6 символов" 
                  className="pl-10 h-12 rounded-xl"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Подтвердите пароль *</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  id="confirmPassword" 
                  type="password" 
                  placeholder="Повторите пароль" 
                  className="pl-10 h-12 rounded-xl"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full btn-gradient h-12 rounded-xl text-lg"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Создание аккаунта...
                </>
              ) : (
                "Присоединиться"
              )}
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

export default JoinByLink;
