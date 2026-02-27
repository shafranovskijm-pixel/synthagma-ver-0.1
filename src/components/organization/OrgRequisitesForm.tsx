import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, Save, Building2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OrgRequisitesFormProps {
  organizationId: string;
}

interface DadataCompany {
  name: string;
  fullName: string;
  shortName: string;
  inn: string;
  kpp: string;
  ogrn: string;
  address: string;
  management: string;
  status: string;
  type: string;
  opf: string;
}

export function OrgRequisitesForm({ organizationId }: OrgRequisitesFormProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [dadataInfo, setDadataInfo] = useState<DadataCompany | null>(null);

  const [requisites, setRequisites] = useState({
    inn: "",
    kpp: "",
    ogrn: "",
    legal_address: "",
    actual_address: "",
    director_name: "",
    director_position: "",
    bank_name: "",
    bank_bik: "",
    bank_account: "",
    bank_corr_account: "",
    director_gender: "male",
  });

  useEffect(() => {
    fetchRequisites();
  }, [organizationId]);

  const fetchRequisites = async () => {
    try {
      const { data, error } = await supabase
        .from("organizations")
        .select("inn, kpp, ogrn, legal_address, actual_address, director_name, director_position, bank_name, bank_bik, bank_account, bank_corr_account")
        .eq("id", organizationId)
        .single();

      if (error) throw error;

      if (data) {
        setRequisites({
          inn: data.inn || "",
          kpp: data.kpp || "",
          ogrn: data.ogrn || "",
          legal_address: data.legal_address || "",
          actual_address: data.actual_address || "",
          director_name: data.director_name || "",
          director_position: data.director_position || "",
          bank_name: data.bank_name || "",
          bank_bik: data.bank_bik || "",
          bank_account: data.bank_account || "",
          bank_corr_account: data.bank_corr_account || "",
        });
      }
    } catch (error) {
      console.error("Error fetching requisites:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchByInn = async () => {
    if (requisites.inn.length < 10) {
      toast.error("Введите корректный ИНН (10 или 12 цифр)");
      return;
    }

    setIsSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('dadata-company', {
        body: { inn: requisites.inn }
      });

      if (error) throw error;

      if (data.success && data.company) {
        setDadataInfo(data.company);
        
        // Auto-fill fields
        setRequisites(prev => ({
          ...prev,
          kpp: data.company.kpp || prev.kpp,
          ogrn: data.company.ogrn || prev.ogrn,
          legal_address: data.company.address || prev.legal_address,
          director_name: data.company.management || prev.director_name,
          director_position: data.company.type === 'INDIVIDUAL' ? 'Индивидуальный предприниматель' : 'Генеральный директор',
        }));

        toast.success("Данные компании найдены и подставлены");
      } else {
        setDadataInfo(null);
        toast.error(data.message || "Компания не найдена");
      }
    } catch (error) {
      console.error("DaData search error:", error);
      toast.error("Ошибка поиска по ИНН");
      setDadataInfo(null);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update(requisites)
        .eq("id", organizationId);

      if (error) throw error;

      toast.success("Реквизиты сохранены");
    } catch (error) {
      console.error("Error saving requisites:", error);
      toast.error("Ошибка сохранения реквизитов");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* INN Search Section */}
      <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Building2 className="w-4 h-4" />
          Автозаполнение по ИНН
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Введите ИНН организации"
            value={requisites.inn}
            onChange={(e) => setRequisites(prev => ({ ...prev, inn: e.target.value.replace(/\D/g, '').slice(0, 12) }))}
            className="rounded-xl flex-1"
          />
          <Button
            variant="outline"
            className="rounded-xl gap-2"
            onClick={handleSearchByInn}
            disabled={isSearching || requisites.inn.length < 10}
          >
            {isSearching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Найти
          </Button>
        </div>
        {dadataInfo && (
          <div className="flex items-center gap-2 text-sm text-sigma-green">
            <CheckCircle2 className="w-4 h-4" />
            Найдено: {dadataInfo.shortName || dadataInfo.name}
          </div>
        )}
      </div>

      {/* Requisites Form */}
      <div className="grid gap-4">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>ИНН</Label>
            <Input
              value={requisites.inn}
              onChange={(e) => setRequisites(prev => ({ ...prev, inn: e.target.value.replace(/\D/g, '').slice(0, 12) }))}
              className="rounded-xl"
              placeholder="1234567890"
            />
          </div>
          <div className="space-y-2">
            <Label>КПП</Label>
            <Input
              value={requisites.kpp}
              onChange={(e) => setRequisites(prev => ({ ...prev, kpp: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
              className="rounded-xl"
              placeholder="123456789"
            />
          </div>
          <div className="space-y-2">
            <Label>ОГРН</Label>
            <Input
              value={requisites.ogrn}
              onChange={(e) => setRequisites(prev => ({ ...prev, ogrn: e.target.value.replace(/\D/g, '').slice(0, 15) }))}
              className="rounded-xl"
              placeholder="1234567890123"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Юридический адрес</Label>
          <Input
            value={requisites.legal_address}
            onChange={(e) => setRequisites(prev => ({ ...prev, legal_address: e.target.value }))}
            className="rounded-xl"
            placeholder="г. Москва, ул. Примерная, д. 1"
          />
        </div>

        <div className="space-y-2">
          <Label>Фактический адрес</Label>
          <Input
            value={requisites.actual_address}
            onChange={(e) => setRequisites(prev => ({ ...prev, actual_address: e.target.value }))}
            className="rounded-xl"
            placeholder="г. Москва, ул. Примерная, д. 1"
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>ФИО руководителя</Label>
            <Input
              value={requisites.director_name}
              onChange={(e) => setRequisites(prev => ({ ...prev, director_name: e.target.value }))}
              className="rounded-xl"
              placeholder="Иванов Иван Иванович"
            />
          </div>
          <div className="space-y-2">
            <Label>Должность руководителя</Label>
            <Input
              value={requisites.director_position}
              onChange={(e) => setRequisites(prev => ({ ...prev, director_position: e.target.value }))}
              className="rounded-xl"
              placeholder="Генеральный директор"
            />
          </div>
        </div>

        <div className="border-t border-border pt-4 mt-2">
          <h5 className="font-medium mb-3 text-sm">Банковские реквизиты</h5>
          <div className="grid gap-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Наименование банка</Label>
                <Input
                  value={requisites.bank_name}
                  onChange={(e) => setRequisites(prev => ({ ...prev, bank_name: e.target.value }))}
                  className="rounded-xl"
                  placeholder="ПАО Сбербанк"
                />
              </div>
              <div className="space-y-2">
                <Label>БИК</Label>
                <Input
                  value={requisites.bank_bik}
                  onChange={(e) => setRequisites(prev => ({ ...prev, bank_bik: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
                  className="rounded-xl"
                  placeholder="044525225"
                />
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Расчётный счёт</Label>
                <Input
                  value={requisites.bank_account}
                  onChange={(e) => setRequisites(prev => ({ ...prev, bank_account: e.target.value.replace(/\D/g, '').slice(0, 20) }))}
                  className="rounded-xl"
                  placeholder="40702810000000000000"
                />
              </div>
              <div className="space-y-2">
                <Label>Корреспондентский счёт</Label>
                <Input
                  value={requisites.bank_corr_account}
                  onChange={(e) => setRequisites(prev => ({ ...prev, bank_corr_account: e.target.value.replace(/\D/g, '').slice(0, 20) }))}
                  className="rounded-xl"
                  placeholder="30101810400000000225"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <Button 
        className="btn-gradient rounded-xl gap-2" 
        onClick={handleSave} 
        disabled={isSaving}
      >
        {isSaving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Сохранение...
          </>
        ) : (
          <>
            <Save className="w-4 h-4" />
            Сохранить реквизиты
          </>
        )}
      </Button>
    </div>
  );
}
