import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan, formatStorageSize } from "@/constants/subscriptionPlans";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Search, Crown, Users, BookOpen, HardDrive, AlertTriangle, Clock, CheckCircle, XCircle, Calendar, Bell, Upload, FileText, Receipt, File, Trash2, Download, FolderOpen, Eye } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { ru } from "date-fns/locale";

interface OrgTariff {
  id: string;
  name: string;
  email: string;
  subscription_plan: string;
  is_paid: boolean;
  paid_until: string | null;
  created_at: string;
}

interface SubscriptionRequest {
  id: string;
  organization_id: string;
  current_plan: string;
  requested_plan: string;
  status: string;
  message: string | null;
  created_at: string;
  org_name?: string;
}

interface BillingDoc {
  id: string;
  organization_id: string;
  name: string;
  doc_type: string;
  file_url: string;
  created_at: string;
  org_name?: string;
}

const planColors: Record<string, string> = {
  free: "bg-muted text-muted-foreground",
  start: "bg-blue-500/10 text-blue-500",
  standard: "bg-emerald-500/10 text-emerald-500",
  professional: "bg-amber-500/10 text-amber-500",
  maximum: "bg-purple-500/10 text-purple-500",
};

function getExpiryStatus(paidUntil: string | null) {
  if (!paidUntil) return { label: "Не указано", color: "text-muted-foreground", days: null };
  const days = differenceInDays(new Date(paidUntil), new Date());
  if (days <= 0) return { label: "Истёк", color: "text-destructive", days };
  if (days <= 7) return { label: `${days} дн.`, color: "text-destructive", days };
  if (days <= 30) return { label: `${days} дн.`, color: "text-amber-500", days };
  return { label: `${days} дн.`, color: "text-emerald-500", days };
}

export function TariffsManager() {
  const [orgs, setOrgs] = useState<OrgTariff[]>([]);
  const [requests, setRequests] = useState<SubscriptionRequest[]>([]);
  const [billingDocs, setBillingDocs] = useState<BillingDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState<string | null>(null);

  // Billing doc upload state
  const [uploadOrgId, setUploadOrgId] = useState("");
  const [uploadDocType, setUploadDocType] = useState("invoice");
  const [uploadDocName, setUploadDocName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const fetchData = async () => {
    const [orgsRes, reqRes, docsRes] = await Promise.all([
      supabase
        .from("organizations")
        .select("id, name, email, subscription_plan, is_paid, paid_until, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("subscription_requests" as any)
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase
        .from("org_billing_documents" as any)
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    if (orgsRes.data) setOrgs(orgsRes.data);
    if (reqRes.data) {
      const reqs = (reqRes.data as any[]).map((r: any) => ({
        ...r,
        org_name: orgsRes.data?.find(o => o.id === r.organization_id)?.name || "—",
      }));
      setRequests(reqs);
    }
    if (docsRes.data) {
      const docs = (docsRes.data as any[]).map((doc: any) => ({
        ...doc,
        org_name: orgsRes.data?.find(o => o.id === doc.organization_id)?.name || "—",
      }));
      setBillingDocs(docs);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handlePlanChange = async (orgId: string, newPlan: SubscriptionPlan) => {
    setUpdating(orgId);
    const { error } = await supabase
      .from("organizations")
      .update({ subscription_plan: newPlan })
      .eq("id", orgId);

    if (error) {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Тариф обновлён" });
      setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, subscription_plan: newPlan } : o));
    }
    setUpdating(null);
  };

  const handleDateChange = async (orgId: string, date: string) => {
    const { error } = await supabase
      .from("organizations")
      .update({ paid_until: date || null, is_paid: !!date })
      .eq("id", orgId);

    if (error) {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Дата обновлена" });
      setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, paid_until: date || null, is_paid: !!date } : o));
    }
    setEditingDate(null);
  };

  const handleRequestAction = async (requestId: string, action: "approved" | "rejected", req: SubscriptionRequest) => {
    const { error } = await supabase
      .from("subscription_requests" as any)
      .update({ status: action, processed_at: new Date().toISOString() } as any)
      .eq("id", requestId);

    if (error) {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
      return;
    }

    if (action === "approved") {
      await supabase
        .from("organizations")
        .update({ subscription_plan: req.requested_plan })
        .eq("id", req.organization_id);
    }

    toast({ title: action === "approved" ? "Заявка одобрена" : "Заявка отклонена" });
    setRequests(prev => prev.filter(r => r.id !== requestId));
    if (action === "approved") {
      setOrgs(prev => prev.map(o => o.id === req.organization_id ? { ...o, subscription_plan: req.requested_plan } : o));
    }
  };

  const handleUploadBillingDoc = async () => {
    if (!uploadOrgId || !uploadFile || !uploadDocName.trim()) {
      toast({ title: "Заполните все поля", variant: "destructive" });
      return;
    }
    setUploading(true);

    const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${uploadOrgId}/${Date.now()}_${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("billing-documents")
      .upload(filePath, uploadFile);

    if (uploadError) {
      toast({ title: "Ошибка загрузки", description: uploadError.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { error: dbError } = await supabase
      .from("org_billing_documents" as any)
      .insert({
        organization_id: uploadOrgId,
        name: uploadDocName.trim(),
        doc_type: uploadDocType,
        file_url: filePath,
      } as any);

    if (dbError) {
      toast({ title: "Ошибка сохранения", description: dbError.message, variant: "destructive" });
    } else {
      toast({ title: "Документ загружен" });
      setUploadDocName("");
      setUploadFile(null);
      fetchData();
    }
    setUploading(false);
  };

  const handleDeleteBillingDoc = async (doc: BillingDoc) => {
    const { error: storageError } = await supabase.storage
      .from("billing-documents")
      .remove([doc.file_url]);

    const { error: dbError } = await supabase
      .from("org_billing_documents" as any)
      .delete()
      .eq("id", doc.id);

    if (dbError) {
      toast({ title: "Ошибка удаления", description: dbError.message, variant: "destructive" });
    } else {
      toast({ title: "Документ удалён" });
      setBillingDocs(prev => prev.filter(d => d.id !== doc.id));
    }
  };

  const handleViewDoc = async (doc: BillingDoc) => {
    const { data, error } = await supabase.storage
      .from("billing-documents")
      .createSignedUrl(doc.file_url, 3600);
    if (!data?.signedUrl) {
      toast({ title: "Ошибка", description: "Не удалось получить ссылку", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch(data.signedUrl);
      const text = await res.text();
      const blob = new Blob([text], { type: "text/html;charset=utf-8" });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank");
    } catch (e) {
      console.error("Error opening document:", e);
      window.open(data.signedUrl, "_blank");
    }
  };

  const handleDownloadDoc = async (doc: BillingDoc) => {
    const { data, error } = await supabase.storage
      .from("billing-documents")
      .createSignedUrl(doc.file_url, 3600);
    if (!data?.signedUrl) {
      toast({ title: "Ошибка", description: "Не удалось получить ссылку", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch(data.signedUrl);
      const text = await res.text();
      const { printHtmlContent } = await import("@/utils/printHtmlToPdf");
      printHtmlContent(text, doc.name);
    } catch (e) {
      console.error("Error downloading document:", e);
      toast({ title: "Ошибка", description: "Не удалось скачать файл", variant: "destructive" });
    }
  };

  const filtered = orgs.filter(o =>
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    o.email.toLowerCase().includes(search.toLowerCase())
  );

  const planStats = Object.keys(SUBSCRIPTION_PLANS).map(plan => ({
    plan,
    name: SUBSCRIPTION_PLANS[plan as SubscriptionPlan].name,
    count: orgs.filter(o => o.subscription_plan === plan).length,
  }));

  const expiredCount = orgs.filter(o => {
    if (!o.paid_until || o.subscription_plan === "free") return false;
    return differenceInDays(new Date(o.paid_until), new Date()) <= 0;
  }).length;

  const expiringSoonCount = orgs.filter(o => {
    if (!o.paid_until || o.subscription_plan === "free") return false;
    const days = differenceInDays(new Date(o.paid_until), new Date());
    return days > 0 && days <= 30;
  }).length;

  const paidCount = orgs.filter(o => o.subscription_plan !== "free").length;

  const docTypeLabels: Record<string, { label: string; icon: React.ReactNode }> = {
    invoice: { label: "Счёт", icon: <FileText className="w-4 h-4 text-blue-500" /> },
    receipt: { label: "Чек", icon: <Receipt className="w-4 h-4 text-emerald-500" /> },
    act: { label: "Акт", icon: <File className="w-4 h-4 text-amber-500" /> },
    other: { label: "Другое", icon: <File className="w-4 h-4 text-muted-foreground" /> },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-muted-foreground">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-emerald-500" />
            <div>
              <div className="text-2xl font-bold">{paidCount}</div>
              <div className="text-xs text-muted-foreground">Платных</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <XCircle className="w-8 h-8 text-destructive" />
            <div>
              <div className="text-2xl font-bold">{expiredCount}</div>
              <div className="text-xs text-muted-foreground">Истёкших</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="w-8 h-8 text-amber-500" />
            <div>
              <div className="text-2xl font-bold">{expiringSoonCount}</div>
              <div className="text-xs text-muted-foreground">Истекают скоро</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Bell className="w-8 h-8 text-primary" />
            <div>
              <div className="text-2xl font-bold">{requests.length}</div>
              <div className="text-xs text-muted-foreground">Заявок</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Expiration Alerts */}
      {(expiredCount > 0 || expiringSoonCount > 0) && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Внимание: тарифы требуют продления
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {orgs
                .filter(o => {
                  if (!o.paid_until || o.subscription_plan === "free") return false;
                  return differenceInDays(new Date(o.paid_until), new Date()) <= 30;
                })
                .sort((a, b) => new Date(a.paid_until!).getTime() - new Date(b.paid_until!).getTime())
                .map(org => {
                  const status = getExpiryStatus(org.paid_until);
                  return (
                    <div key={org.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <span className="font-medium text-sm">{org.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            ({SUBSCRIPTION_PLANS[org.subscription_plan as SubscriptionPlan]?.name})
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={status.days !== null && status.days <= 0 ? "destructive" : "outline"} className={status.color}>
                          {status.days !== null && status.days <= 0 ? "Истёк" : `Осталось ${status.label}`}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {org.paid_until && format(new Date(org.paid_until), "d MMM yyyy", { locale: ru })}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Requests */}
      {requests.length > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="w-5 h-5 text-amber-500" />
              Заявки на смену тарифа ({requests.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {requests.map(req => (
                <div key={req.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                  <div className="space-y-1">
                    <div className="font-medium text-sm">{req.org_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {SUBSCRIPTION_PLANS[req.current_plan as SubscriptionPlan]?.name} → {SUBSCRIPTION_PLANS[req.requested_plan as SubscriptionPlan]?.name}
                    </div>
                    {req.message && <div className="text-xs italic">«{req.message}»</div>}
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(req.created_at), "d MMM yyyy HH:mm", { locale: ru })}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => handleRequestAction(req.id, "rejected", req)}>
                      Отклонить
                    </Button>
                    <Button size="sm" onClick={() => handleRequestAction(req.id, "approved", req)}>
                      Одобрить
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {planStats.map(s => (
          <Card key={s.plan}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{s.count}</div>
              <div className="text-xs text-muted-foreground">{s.name}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Plans overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Crown className="w-5 h-5 text-amber-500" />
            Тарифные планы
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {Object.values(SUBSCRIPTION_PLANS).map(plan => (
              <div key={plan.id} className="p-3 rounded-xl border border-border space-y-2">
                <div className="font-semibold text-sm">{plan.name}</div>
                <div className="text-lg font-bold">
                  {plan.price === 0 ? "Бесплатно" : `${plan.price.toLocaleString()} ₽`}
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />
                    {plan.limits.maxCourses === -1 ? "∞" : plan.limits.maxCourses} курсов
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {plan.limits.maxStudents === -1 ? "∞" : plan.limits.maxStudents} учеников
                  </div>
                  <div className="flex items-center gap-1">
                    <HardDrive className="w-3 h-3" />
                    {formatStorageSize(plan.limits.storageBytes)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Billing Documents Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderOpen className="w-5 h-5 text-primary" />
            Документы для организаций
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Upload form */}
          <div className="p-4 rounded-lg border border-dashed border-border bg-muted/20 space-y-3">
            <h4 className="text-sm font-medium">Загрузить документ</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Организация</Label>
                <Select value={uploadOrgId} onValueChange={setUploadOrgId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Выберите..." />
                  </SelectTrigger>
                  <SelectContent>
                    {orgs.map(o => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Тип документа</Label>
                <Select value={uploadDocType} onValueChange={setUploadDocType}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invoice">Счёт</SelectItem>
                    <SelectItem value="receipt">Чек</SelectItem>
                    <SelectItem value="act">Акт</SelectItem>
                    <SelectItem value="other">Другое</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Название</Label>
                <Input
                  className="h-9 text-sm"
                  placeholder="Счёт №123"
                  value={uploadDocName}
                  onChange={e => setUploadDocName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Файл</Label>
                <div className="flex gap-2">
                  <Input
                    type="file"
                    className="h-9 text-sm"
                    onChange={e => setUploadFile(e.target.files?.[0] || null)}
                  />
                </div>
              </div>
            </div>
            <Button size="sm" onClick={handleUploadBillingDoc} disabled={uploading || !uploadOrgId || !uploadFile || !uploadDocName.trim()}>
              <Upload className="w-4 h-4 mr-1" />
              {uploading ? "Загрузка..." : "Загрузить"}
            </Button>
          </div>

          {/* Documents list */}
          {billingDocs.length > 0 && (
            <div className="space-y-2">
              {billingDocs.map(doc => {
                const dt = docTypeLabels[doc.doc_type] || docTypeLabels.other;
                return (
                  <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      {dt.icon}
                      <div>
                        <div className="text-sm font-medium">{doc.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {doc.org_name} · {dt.label} · {format(new Date(doc.created_at), "d MMM yyyy", { locale: ru })}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" title="Просмотр" onClick={() => handleViewDoc(doc)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" title="Скачать" onClick={() => handleDownloadDoc(doc)}>
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteBillingDoc(doc)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Organizations table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="w-5 h-5" />
              Организации ({filtered.length})
            </CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Поиск..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Организация</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Текущий тариф</TableHead>
                  <TableHead>Изменить</TableHead>
                  <TableHead>Оплачен до</TableHead>
                  <TableHead>Статус</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(org => {
                  const status = getExpiryStatus(org.paid_until);
                  return (
                    <TableRow key={org.id}>
                      <TableCell className="font-medium max-w-[200px] truncate">{org.name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{org.email}</TableCell>
                      <TableCell>
                        <Badge className={planColors[org.subscription_plan] || planColors.free} variant="secondary">
                          {SUBSCRIPTION_PLANS[org.subscription_plan as SubscriptionPlan]?.name || org.subscription_plan}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={org.subscription_plan}
                          onValueChange={(v) => handlePlanChange(org.id, v as SubscriptionPlan)}
                          disabled={updating === org.id}
                        >
                          <SelectTrigger className="w-[160px] h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.values(SUBSCRIPTION_PLANS).map(plan => (
                              <SelectItem key={plan.id} value={plan.id}>
                                {plan.name} — {plan.price === 0 ? "0 ₽" : `${plan.price.toLocaleString()} ₽`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {editingDate === org.id ? (
                          <Input
                            type="date"
                            defaultValue={org.paid_until ? org.paid_until.split("T")[0] : ""}
                            className="w-[150px] h-8 text-sm"
                            onBlur={(e) => handleDateChange(org.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleDateChange(org.id, (e.target as HTMLInputElement).value);
                              if (e.key === "Escape") setEditingDate(null);
                            }}
                            autoFocus
                          />
                        ) : (
                          <button
                            onClick={() => setEditingDate(org.id)}
                            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Calendar className="w-3 h-3" />
                            {org.paid_until
                              ? format(new Date(org.paid_until), "d MMM yyyy", { locale: ru })
                              : "Установить"}
                          </button>
                        )}
                      </TableCell>
                      <TableCell>
                        {org.subscription_plan !== "free" && (
                          <span className={`text-xs font-medium ${status.color}`}>
                            {status.label}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
