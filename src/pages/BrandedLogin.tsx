import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Mail, Lock, Loader2, User, ExternalLink, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface LoginBranding {
  backgroundUrl?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  welcomeText?: string;
  description?: string;
}

interface OrganizationData {
  id: string;
  name: string;
  website_url: string | null;
  login_branding: LoginBranding | null;
}

const BrandedLogin = () => {
  const { slug } = useParams<{ slug: string }>();
  const [organization, setOrganization] = useState<OrganizationData | null>(null);
  const [loadingOrg, setLoadingOrg] = useState(true);
  const [notFound, setNotFound] = useState(false);
  
  const [email, setEmail] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loginMode, setLoginMode] = useState<"email" | "login">("login");
  const [showPassword, setShowPassword] = useState(false);
  
  const { signIn, user, userRole, loading } = useAuth();
  const navigate = useNavigate();
  // Load organization by slug
  useEffect(() => {
    const loadOrganization = async () => {
      if (!slug) {
        setNotFound(true);
        setLoadingOrg(false);
        return;
      }

      try {
        // Use a SECURITY DEFINER RPC to avoid exposing the full organizations table publicly.
        // This function returns ONLY non-sensitive fields required for branded login.
        const { data, error } = await supabase.rpc('public_get_organization_by_slug', {
          p_slug: slug,
        });

        if (error) throw error;

        const row = Array.isArray(data) ? data[0] : null;

        if (!row) {
          setNotFound(true);
        } else {
          const branding = (row.login_branding as LoginBranding | null) ?? null;
          setOrganization({
            id: row.id,
            name: row.name,
            website_url: row.website_url,
            login_branding: branding
          });
        }
      } catch (error) {
        console.error('Error loading organization:', error);
        setNotFound(true);
      } finally {
        setLoadingOrg(false);
      }
    };

    loadOrganization();
  }, [slug]);

  // Redirect if already logged in
  useEffect(() => {
    if (user && !loading && userRole) {
      if (userRole === 'admin') {
        navigate("/admin", { replace: true });
      } else if (userRole === 'organization') {
        navigate("/organization", { replace: true });
      } else {
        navigate("/student", { replace: true });
      }
    }
  }, [user, userRole, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (loginMode === "email" && (!email || !password)) {
      toast.error("Ошибка", { description: "Заполните все поля" });
      return;
    }

    if (loginMode === "login" && (!login || !password)) {
      toast.error("Ошибка", { description: "Заполните все поля" });
      return;
    }

    setIsLoading(true);
    
    let signInEmail = email.trim();
    const cleanPassword = password.trim();
    
    if (loginMode === "login") {
      const cleanLogin = login.trim().toLowerCase();
      // Verify login exists using secure RPC
      const { data: lookupResult, error: lookupError } = await supabase
        .rpc('public_lookup_user_by_login', { login_input: cleanLogin });
      
      if (lookupError || !lookupResult || lookupResult.length === 0) {
        toast.error("Ошибка входа", { description: "Неверный логин или пароль" });
        setIsLoading(false);
        return;
      }
      
      // Always use standardized email format for login-based auth
      signInEmail = `${cleanLogin}@student.local`;
    }
    
    const { error } = await signIn(signInEmail, cleanPassword);
    
    if (error) {
      toast.error("Ошибка входа", { description: "error.message === "Invalid login credentials"" });
    } else {
      toast.success("Успешно!", { description: "Вы вошли в систему" });
    }
    
    setIsLoading(false);
  };

  if (loading || loadingOrg) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <h1 className="text-2xl font-bold mb-4">Страница не найдена</h1>
        <p className="text-muted-foreground mb-6">Организация с такой ссылкой не найдена</p>
        <Link to="/login">
          <Button>Перейти на главную страницу входа</Button>
        </Link>
      </div>
    );
  }

  const branding = organization?.login_branding;
  const primaryColor = branding?.primaryColor || '#0d9488';
  const secondaryColor = branding?.secondaryColor || '#14b8a6';
  const welcomeText = branding?.welcomeText || `Добро пожаловать в ${organization?.name}`;
  const description = branding?.description || 'Войдите в личный кабинет для доступа к курсам';

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side - Form */}
      <div className="flex-1 flex flex-col justify-center px-6 lg:px-16 py-8">
        <div className="max-w-md w-full mx-auto">
          {/* Logo */}
          {branding?.logoUrl ? (
            <img 
              src={branding.logoUrl} 
              alt={organization?.name || 'Логотип'} 
              className="h-16 object-contain mb-8"
            />
          ) : (
            <div className="mb-8">
              <h2 className="font-display text-2xl font-bold" style={{ color: primaryColor }}>
                {organization?.name}
              </h2>
            </div>
          )}
          
          <h1 className="font-display text-3xl font-bold mb-2">{welcomeText}</h1>
          <p className="text-muted-foreground mb-6">{description}</p>

          <Tabs value={loginMode} onValueChange={(v) => setLoginMode(v as "email" | "login")} className="mb-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                По логину
              </TabsTrigger>
              <TabsTrigger value="email" className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                По email
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <form onSubmit={handleSubmit} className="space-y-6">
            {loginMode === "email" ? (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="your@email.com" 
                    className="pl-10 h-12 rounded-xl"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="login">Логин</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input 
                    id="login" 
                    type="text" 
                    placeholder="student_12345" 
                    className="pl-10 h-12 rounded-xl"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    disabled={isLoading}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    autoComplete="username"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  id="password" 
                  type={showPassword ? "text" : "password"} 
                  placeholder="••••••••" 
                  className="pl-10 pr-10 h-12 rounded-xl"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 rounded-xl text-lg"
              style={{ 
                background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
                color: 'white'
              }}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Вход...
                </>
              ) : (
                "Войти"
              )}
            </Button>
          </form>

          {/* Website link */}
          {organization?.website_url && (
            <div className="mt-8 pt-6 border-t border-border text-center">
              <a 
                href={organization.website_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Перейти на сайт организации
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Right side - Background Image or Gradient */}
      <div 
        className="hidden lg:flex flex-1 relative items-center justify-center overflow-hidden"
        style={{
          background: branding?.backgroundUrl 
            ? `url(${branding.backgroundUrl}) center/cover no-repeat`
            : `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`
        }}
      >
        {/* Overlay for better text readability */}
        <div className="absolute inset-0 bg-black/30" />
        
        {/* Decorative pattern overlay */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0wLTZoLTJWNmgydjR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-30" />
        
        {/* Content on right side */}
        <div className="relative z-10 text-center text-white px-12">
          {branding?.logoUrl && (
            <div className="w-32 h-32 rounded-3xl bg-white/20 backdrop-blur-xl flex items-center justify-center mx-auto mb-8 overflow-hidden">
              <img 
                src={branding.logoUrl} 
                alt={organization?.name || 'Логотип'} 
                className="w-20 h-20 object-contain"
              />
            </div>
          )}
          <h2 className="font-display text-4xl font-bold mb-4">
            {organization?.name}
          </h2>
          <p className="text-white/80 text-lg max-w-md">
            {description}
          </p>
        </div>

        {/* Decorative circles */}
        <div className="absolute top-20 left-20 w-40 h-40 rounded-full border border-white/20" />
        <div className="absolute bottom-20 right-20 w-60 h-60 rounded-full border border-white/10" />
      </div>
    </div>
  );
};

export default BrandedLogin;
