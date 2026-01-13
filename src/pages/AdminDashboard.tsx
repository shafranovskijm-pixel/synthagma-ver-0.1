import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { LogOut, Building2, Users, Shield, BarChart3, ShoppingBag, Sparkles } from "lucide-react";
import { OrganizationsManager } from "@/components/admin/OrganizationsManager";
import { UsersManager } from "@/components/admin/UsersManager";
import { AdminAnalytics } from "@/components/admin/AdminAnalytics";
import { ServiceOrdersManager } from "@/components/admin/ServiceOrdersManager";
import { SystemFeaturesManager } from "@/components/admin/SystemFeaturesManager";

const AdminDashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("analytics");

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SigmaLogo size="sm" />
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <span className="font-display font-semibold text-lg">Панель администратора</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {user?.email}
            </span>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Выйти
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-3xl grid-cols-5">
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">Аналитика</span>
            </TabsTrigger>
            <TabsTrigger value="organizations" className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              <span className="hidden sm:inline">Организации</span>
            </TabsTrigger>
            <TabsTrigger value="orders" className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" />
              <span className="hidden sm:inline">Заявки</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Пользователи</span>
            </TabsTrigger>
            <TabsTrigger value="features" className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span className="hidden sm:inline">Функции</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analytics" className="space-y-6">
            <AdminAnalytics />
          </TabsContent>

          <TabsContent value="organizations" className="space-y-6">
            <OrganizationsManager />
          </TabsContent>

          <TabsContent value="orders" className="space-y-6">
            <ServiceOrdersManager />
          </TabsContent>

          <TabsContent value="users" className="space-y-6">
            <UsersManager />
          </TabsContent>

          <TabsContent value="features" className="space-y-6">
            <SystemFeaturesManager />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminDashboard;
