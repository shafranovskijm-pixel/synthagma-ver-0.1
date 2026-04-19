import { Button } from "@/components/ui/button";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";
import { ArrowLeft, Mail, Lock, User, Building, Phone, Search, CheckCircle2, Tag, Check } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useRegisterOrganization } from "@/hooks/useRegisterOrganization";


const RegisterOrganization = () => {
  const h = useRegisterOrganization();

  if (h.loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><SigmaSpinner size="lg" /></div>;
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side - Visual */}
      <div className="hidden lg:flex flex-1 relative bg-gradient-to-br from-primary via-primary/80 to-accent items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0wLTZoLTJWNmgydjR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-30" />
        <div className="relative z-10 text-center text-white px-12">
          <div className="w-32 h-32 rounded-3xl bg-white/20 backdrop-blur-xl flex items-center justify-center mx-auto mb-8">
            <Building className="w-16 h-16" />
          </div>
          <h2 className="font-display text-4xl font-bold mb-4">Для организаций</h2>
          <p className="text-white/80 text-lg max-w-md">Создавайте курсы, управляйте учениками и получайте детальную аналитику</p>
        </div>
        <div className="absolute top-20 right-20 w-40 h-40 rounded-full border border-white/20" />
        <div className="absolute bottom-20 left-20 w-60 h-60 rounded-full border border-white/10" />
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex flex-col justify-center px-8 lg:px-16 py-10 overflow-y-auto">
        <div className="max-w-md w-full mx-auto">
          <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8">
            <ArrowLeft className="w-4 h-4" />Назад
          </Link>
          <SigmaLogo size="lg" className="mb-8" />
          <h1 className="font-display text-3xl font-bold mb-2">Регистрация организации</h1>
          <p className="text-muted-foreground mb-4">Создайте аккаунт для вашей организации</p>



          {/* Selected Plan Card */}
          {h.selectedPlan !== 'free' && (
            <div className="p-4 rounded-xl border-2 border-primary/30 bg-primary/5 mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="font-display font-semibold text-lg">{h.planInfo.name}</span>
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{h.planInfo.description}</span>
              </div>
              <div className="flex items-baseline gap-2">
                {h.promoApplied ? (
                  <>
                    <span className="font-display text-2xl font-bold text-primary">{Math.round(h.planInfo.price * (1 - h.promoDiscount / 100)).toLocaleString('ru-RU')} ₽/мес</span>
                    <span className="text-sm text-muted-foreground line-through">{h.planInfo.price.toLocaleString('ru-RU')} ₽/мес</span>
                    <span className="text-xs font-semibold text-green-600 bg-green-500/10 px-2 py-0.5 rounded-full">−{h.promoDiscount}%</span>
                  </>
                ) : (
                  <span className="font-display text-2xl font-bold">{h.planInfo.price.toLocaleString('ru-RU')} ₽/мес</span>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <div className="relative flex-1">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Промокод" className="pl-9 h-10 rounded-xl uppercase" value={h.promoCode} onChange={(e) => { h.setPromoCode(e.target.value.toUpperCase()); if (h.promoApplied) { h.setPromoApplied(false); h.setPromoDiscount(0); } }} disabled={h.isLoading} />
                </div>
                <Button type="button" variant={h.promoApplied ? "default" : "outline"} className={`h-10 rounded-xl px-4 ${h.promoApplied ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`} onClick={h.handleCheckPromo} disabled={h.isLoading || h.isCheckingPromo || !h.promoCode.trim()}>
                  {h.isCheckingPromo ? <SigmaSpinner size="sm" /> : h.promoApplied ? <><Check className="w-4 h-4 mr-1" /> Применён</> : "Применить"}
                </Button>
              </div>
            </div>
          )}

          <form onSubmit={h.handleSubmit} className="space-y-4">
            {/* INN */}
            <div className="p-4 rounded-xl bg-primary/5 border-2 border-primary/20 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center"><Search className="w-4 h-4 text-primary" /></div>
                <div>
                  <Label htmlFor="inn" className="text-base font-medium">Быстрое заполнение по ИНН</Label>
                  <p className="text-xs text-muted-foreground">Введите ИНН и мы заполним данные автоматически</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Input id="inn" type="text" placeholder="Введите ИНН организации" className="h-12 rounded-xl flex-1 bg-background" value={h.inn} onChange={(e) => { h.setInn(e.target.value.replace(/\D/g, '').slice(0, 12)); }} disabled={h.isLoading || h.isLoadingInn} />
                <Button type="button" variant={h.innLoaded ? "default" : "outline"} className={`h-12 rounded-xl px-4 ${h.innLoaded ? 'bg-sigma-green hover:bg-sigma-green/90' : ''}`} onClick={h.loadCompanyByInn} disabled={h.isLoading || h.isLoadingInn || h.inn.length < 10}>
                  {h.isLoadingInn ? <SigmaSpinner size="sm" /> : h.innLoaded ? <><CheckCircle2 className="w-4 h-4 mr-2" />Загружено</> : <><Search className="w-4 h-4 mr-2" />Найти</>}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="orgName">Название организации *</Label>
              <div className="relative"><Building className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" /><Input id="orgName" type="text" placeholder="ООО «Компания»" className="pl-10 h-12 rounded-xl" value={h.orgName} onChange={(e) => h.setOrgName(e.target.value)} disabled={h.isLoading} /></div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactName">Контактное лицо *</Label>
              <div className="relative"><User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" /><Input id="contactName" type="text" placeholder="Иван Иванов" className="pl-10 h-12 rounded-xl" value={h.contactName} onChange={(e) => h.setContactName(e.target.value)} disabled={h.isLoading} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label htmlFor="kpp">КПП</Label><Input id="kpp" type="text" placeholder="123456789" className="h-12 rounded-xl" value={h.kpp} onChange={(e) => h.setKpp(e.target.value.replace(/\D/g, '').slice(0, 9))} disabled={h.isLoading} /></div>
              <div className="space-y-2"><Label htmlFor="ogrn">ОГРН</Label><Input id="ogrn" type="text" placeholder="1234567890123" className="h-12 rounded-xl" value={h.ogrn} onChange={(e) => h.setOgrn(e.target.value.replace(/\D/g, '').slice(0, 15))} disabled={h.isLoading} /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="address">Юридический адрес</Label><Input id="address" type="text" placeholder="г. Москва, ул. Примерная, д. 1" className="h-12 rounded-xl" value={h.address} onChange={(e) => h.setAddress(e.target.value)} disabled={h.isLoading} /></div>
            <div className="space-y-2"><Label htmlFor="directorName">Руководитель</Label><Input id="directorName" type="text" placeholder="Иванов Иван Иванович" className="h-12 rounded-xl" value={h.directorName} onChange={(e) => h.setDirectorName(e.target.value)} disabled={h.isLoading} /></div>
            <div className="space-y-2"><Label htmlFor="phone">Телефон *</Label><div className="relative"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" /><Input id="phone" type="tel" placeholder="+7 (999) 123-45-67" className="pl-10 h-12 rounded-xl" value={h.phone} onChange={(e) => h.setPhone(e.target.value)} disabled={h.isLoading} required /></div></div>
            <div className="space-y-2"><Label htmlFor="email">Email *</Label><div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" /><Input id="email" type="email" placeholder="org@company.com" className="pl-10 h-12 rounded-xl" value={h.email} onChange={(e) => h.setEmail(e.target.value)} disabled={h.isLoading} /></div></div>
            <div className="space-y-2"><Label htmlFor="password">Пароль *</Label><div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" /><Input id="password" type="password" placeholder="Минимум 6 символов" className="pl-10 h-12 rounded-xl" value={h.password} onChange={(e) => h.setPassword(e.target.value)} disabled={h.isLoading} /></div></div>
            <div className="space-y-2"><Label htmlFor="confirmPassword">Подтвердите пароль *</Label><div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" /><Input id="confirmPassword" type="password" placeholder="Повторите пароль" className="pl-10 h-12 rounded-xl" value={h.confirmPassword} onChange={(e) => h.setConfirmPassword(e.target.value)} disabled={h.isLoading} /></div></div>

            <Button type="submit" className="w-full btn-gradient h-12 rounded-xl text-lg" disabled={h.isLoading}>
              {h.isLoading ? <><SigmaSpinner className="mr-2" />Регистрация...</> : "Зарегистрировать организацию"}
            </Button>
          </form>

          <p className="text-center text-muted-foreground mt-8">
            Уже есть аккаунт?{" "}<Link to="/login" className="text-primary hover:underline font-medium">Войти</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterOrganization;
