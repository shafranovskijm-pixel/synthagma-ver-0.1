import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Plus, Pencil, Trash2, Users, BookOpen, Key, Eye, EyeOff, Copy, Check,
  Download, ExternalLink, Search, X, FolderOpen, DollarSign, Calendar,
  RefreshCw, Mail, Phone, Crown, LayoutGrid, List
} from "lucide-react";
import { getPlanInfo, type SubscriptionPlan } from "@/constants/subscriptionPlans";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { OrganizationDetailsView } from "./OrganizationDetailsView";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { useOrganizationsManager, type Organization } from "@/hooks/useOrganizationsManager";
import { OrgFormDialog } from "./organizations/OrgFormDialog";
import { OrgStatsCards } from "./organizations/OrgStatsCards";

interface OrganizationsManagerProps {
  openOrgId?: string | null;
  onOpenOrgHandled?: () => void;
}

export function OrganizationsManager({ openOrgId, onOpenOrgHandled }: OrganizationsManagerProps = {}) {
  const h = useOrganizationsManager(openOrgId, onOpenOrgHandled);

  if (h.loading) return <div className="flex items-center justify-center py-12"><SigmaSpinner size="lg" /></div>;

  if (h.viewingOrg) return <OrganizationDetailsView organization={h.viewingOrg} onBack={() => { h.setViewingOrg(null); h.fetchOrganizations(); }} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h2 className="text-2xl font-display font-bold">Организации</h2><p className="text-muted-foreground">Управление организациями платформы</p></div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={h.exportToExcel} disabled={h.organizations.length === 0}><Download className="w-4 h-4 mr-2" />Экспорт в Excel</Button>
          <OrgFormDialog mode="create" open={h.isCreateOpen} onOpenChange={h.setIsCreateOpen} formData={h.formData} setFormData={h.setFormData} onSubmit={h.handleCreate} saving={h.saving} />
        </div>
      </div>

      {/* Stats */}
      <OrgStatsCards organizations={h.organizations} showStats={h.showStats} onToggleStats={() => h.setShowStats(!h.showStats)} />

      {/* Search + View Toggle */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Поиск по названию, email, ИНН, телефону..." value={h.searchQuery} onChange={(e) => h.setSearchQuery(e.target.value)} className="pl-10 pr-10" />
          {h.searchQuery && <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => h.setSearchQuery("")}><X className="w-4 h-4" /></Button>}
        </div>
        <div className="flex items-center border rounded-lg overflow-hidden">
          <Button variant={h.viewMode === 'grid' ? 'default' : 'ghost'} size="icon" className="h-8 w-8 rounded-none" onClick={() => h.setViewMode('grid')}><LayoutGrid className="w-4 h-4" /></Button>
          <Button variant={h.viewMode === 'list' ? 'default' : 'ghost'} size="icon" className="h-8 w-8 rounded-none" onClick={() => h.setViewMode('list')}><List className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* Organizations List/Grid */}
      {h.filteredOrganizations.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground"><Users className="w-12 h-12 mx-auto mb-2 opacity-50" /><p>{h.searchQuery ? "Ничего не найдено" : "Организации не найдены"}</p></div>
      ) : h.viewMode === 'list' ? (
        <OrgListView orgs={h.filteredOrganizations} onView={h.setViewingOrg} onEdit={h.openEdit} onDelete={h.setDeleteOrg} onViewAs={h.viewAsOrganization} />
      ) : (
        <OrgGridView orgs={h.filteredOrganizations} detailsLoading={h.detailsLoading} onView={h.setViewingOrg} onEdit={h.openEdit} onDelete={h.setDeleteOrg} onViewAs={h.viewAsOrganization} showPasswords={h.showPasswords} togglePassword={h.togglePassword} copyToClipboard={h.copyToClipboard} copiedField={h.copiedField} generatingCredentials={h.generatingCredentials} handleGenerateCredentials={h.handleGenerateCredentials} setResetPasswordOrg={h.setResetPasswordOrg} setNewPassword={(p: string) => h.setNewPassword(p)} generatePassword={h.generatePassword} />
      )}

      {/* Edit Dialog */}
      <OrgFormDialog mode="edit" open={h.isEditOpen} onOpenChange={h.setIsEditOpen} formData={h.formData} setFormData={h.setFormData} onSubmit={h.handleUpdate} saving={h.saving} />

      {/* Delete Confirmation */}
      <AlertDialog open={!!h.deleteOrg} onOpenChange={() => h.setDeleteOrg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Удалить организацию?</AlertDialogTitle><AlertDialogDescription>Вы уверены, что хотите удалить организацию "{h.deleteOrg?.name}"? Это действие нельзя отменить.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={h.handleDelete} className="bg-destructive text-destructive-foreground">Удалить</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!h.resetPasswordOrg} onOpenChange={() => { h.setResetPasswordOrg(null); h.setNewPassword(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Сброс пароля организации</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="p-3 bg-muted rounded-lg"><p className="text-sm font-medium">{h.resetPasswordOrg?.name}</p><p className="text-xs text-muted-foreground">{h.resetPasswordOrg?.credentials?.login_email}</p></div>
            <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg"><p className="text-xs text-orange-700 dark:text-orange-400">Если текущий пароль не работает — сбросьте его здесь. Новый пароль будет синхронизирован с системой авторизации.</p></div>
            <div className="space-y-2">
              <Label htmlFor="new-password">Новый пароль</Label>
              <div className="flex gap-2">
                <Input id="new-password" value={h.newPassword} onChange={(e) => h.setNewPassword(e.target.value)} placeholder="Минимум 6 символов" />
                <Button type="button" variant="outline" onClick={() => h.setNewPassword(h.generatePassword())} title="Сгенерировать пароль"><RefreshCw className="w-4 h-4" /></Button>
                <Button type="button" variant="outline" onClick={() => h.copyToClipboard(h.newPassword, 'new-pass')} title="Копировать">{h.copiedField === 'new-pass' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}</Button>
              </div>
            </div>
            <Button onClick={h.handleResetPassword} disabled={h.resettingPassword} className="w-full">{h.resettingPassword ? <SigmaSpinner size="sm" className="mr-2" /> : null}Сохранить и синхронизировать пароль</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---- List View ----
function OrgListView({ orgs, onView, onEdit, onDelete, onViewAs }: { orgs: Organization[]; onView: (o: Organization) => void; onEdit: (o: Organization) => void; onDelete: (o: Organization) => void; onViewAs: (o: Organization) => void }) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <table className="w-full">
        <thead><tr className="border-b border-border bg-muted/30">
          <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Организация</th>
          <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Контакты</th>
          <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Статистика</th>
          <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Действия</th>
        </tr></thead>
        <tbody>
          {orgs.map(org => (
            <tr key={org.id} className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors border-l-4 ${org.is_paid ? 'border-l-green-500' : 'border-l-orange-500'}`}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => onView(org)}>
                  <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-primary-foreground ${org.is_paid ? 'bg-green-500' : 'bg-orange-500'}`}>{org.name.charAt(0).toUpperCase()}</div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><span className="font-medium text-sm hover:underline truncate max-w-[200px]">{org.name}</span>
                    {org.subscription_plan && org.subscription_plan !== 'free' && <Badge variant="secondary" className="text-[10px] gap-0.5 px-1.5 py-0 h-4 flex-shrink-0"><Crown className="w-2.5 h-2.5" />{getPlanInfo(org.subscription_plan as SubscriptionPlan).name}</Badge>}</div>
                    {org.inn && <div className="text-xs text-muted-foreground">ИНН: {org.inn}</div>}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3"><div className="text-xs space-y-0.5"><div className="flex items-center gap-1.5 truncate max-w-[200px]"><Mail className="w-3 h-3 text-muted-foreground flex-shrink-0" /><span className="truncate">{org.email}</span></div>{org.phone && <div className="flex items-center gap-1.5 text-muted-foreground"><Phone className="w-3 h-3 flex-shrink-0" /><span>{org.phone}</span></div>}</div></td>
              <td className="px-4 py-3"><div className="flex items-center gap-2"><Badge variant="secondary" className="gap-1 text-xs"><Users className="w-3 h-3" />{org.users_count ?? 0}</Badge><Badge variant="secondary" className="gap-1 text-xs"><BookOpen className="w-3 h-3" />{org.courses_count ?? 0}</Badge></div></td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button variant="outline" size="sm" onClick={() => onView(org)} className="text-xs h-7"><FolderOpen className="w-3.5 h-3.5 mr-1" />Просмотр</Button>
                  <Button variant="outline" size="sm" onClick={() => onViewAs(org)} className="text-xs h-7"><ExternalLink className="w-3.5 h-3.5 mr-1" />Войти как</Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(org)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(org)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Grid View ----
function OrgGridView({ orgs, detailsLoading, onView, onEdit, onDelete, onViewAs, showPasswords, togglePassword, copyToClipboard, copiedField, generatingCredentials, handleGenerateCredentials, setResetPasswordOrg, setNewPassword, generatePassword }: any) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {orgs.map((org: Organization) => (
        <Card key={org.id} className={`transition-all hover:shadow-lg border-l-4 ${org.is_paid ? 'border-l-green-500' : 'border-l-orange-500'}`}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity min-w-0 flex-1" onClick={() => onView(org)}>
                <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold text-white ${org.is_paid ? 'bg-green-500' : 'bg-orange-500'}`}>{org.name.charAt(0).toUpperCase()}</div>
                <div className="min-w-0"><div className="font-medium text-primary hover:underline truncate">{org.name}</div>{org.inn && <div className="text-xs text-muted-foreground">ИНН: {org.inn}</div>}</div>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                {org.is_paid ? <Badge className="bg-green-500 hover:bg-green-600 text-xs"><DollarSign className="w-3 h-3 mr-0.5" />Оплачено</Badge> : <Badge variant="outline" className="border-orange-500 text-orange-600 text-xs">Без оплаты</Badge>}
                {org.tariff_type && org.tariff_type !== 'trial' && <Badge variant="secondary" className="text-xs"><Calendar className="w-3 h-3 mr-0.5" />{org.tariff_type === 'yearly' ? 'Год' : 'Мес'}</Badge>}
              </div>
            </div>
            {(org.promo_code || org.paid_until) && <div className="flex items-center gap-2 mt-1 flex-wrap">
              {org.promo_code && <Badge variant="outline" className="text-xs border-green-500 text-green-600">🎟 {org.promo_code}</Badge>}
              {org.paid_until && <span className="text-xs text-muted-foreground">до {format(new Date(org.paid_until), "d MMM yyyy", { locale: ru })}</span>}
            </div>}
          </CardHeader>
          <CardContent className="pb-3 space-y-3">
            <div className="text-sm space-y-1"><div className="flex items-center gap-2 truncate"><Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /><span className="truncate">{org.email}</span></div>{org.phone && <div className="flex items-center gap-2 text-muted-foreground"><Phone className="w-3.5 h-3.5 flex-shrink-0" /><span>{org.phone}</span></div>}</div>
            <div className="bg-muted/50 rounded-lg p-2.5">
              {org.credentials === undefined && detailsLoading ? <div className="space-y-1.5"><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-24" /></div>
              : org.credentials ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-1"><Key className="w-3 h-3 text-muted-foreground flex-shrink-0" /><span className="text-xs font-mono truncate">{org.credentials.login_email}</span><Button variant="ghost" size="icon" className="h-5 w-5 flex-shrink-0" onClick={() => copyToClipboard(org.credentials!.login_email, `email-${org.id}`)}>{copiedField === `email-${org.id}` ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}</Button></div>
                  <div className="flex items-center gap-1"><span className="text-xs font-mono text-muted-foreground ml-4">{showPasswords[org.id] ? org.credentials.login_password : '••••••••'}</span>
                    <Button variant="ghost" size="icon" className="h-5 w-5 flex-shrink-0" onClick={() => togglePassword(org.id)}>{showPasswords[org.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}</Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5 flex-shrink-0" onClick={() => copyToClipboard(org.credentials!.login_password, `pass-${org.id}`)}>{copiedField === `pass-${org.id}` ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}</Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5 flex-shrink-0" onClick={() => { setResetPasswordOrg(org); setNewPassword(generatePassword()); }} title="Сбросить пароль"><RefreshCw className="w-3 h-3 text-orange-500" /></Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5 flex-shrink-0" title="Скопировать всё" onClick={() => copyToClipboard(`Логин: ${org.credentials!.login_email}\nПароль: ${org.credentials!.login_password}`, `all-${org.id}`)}>{copiedField === `all-${org.id}` ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-primary" />}</Button>
                  </div>
                </div>
              ) : <Button variant="outline" size="sm" onClick={() => handleGenerateCredentials(org)} disabled={generatingCredentials === org.id} className="text-xs w-full">{generatingCredentials === org.id ? <SigmaSpinner size="xs" className="mr-1" /> : <Key className="w-3 h-3 mr-1" />}Создать учётные данные</Button>}
            </div>
          </CardContent>
          <div className="flex items-center justify-between px-6 pb-4">
            <div className="flex items-center gap-2">
              {org.users_count === undefined && detailsLoading ? <><Skeleton className="h-5 w-12 rounded-full" /><Skeleton className="h-5 w-12 rounded-full" /></> : <><Badge variant="secondary" className="gap-1 text-xs"><Users className="w-3 h-3" />{org.users_count ?? 0}</Badge><Badge variant="secondary" className="gap-1 text-xs"><BookOpen className="w-3 h-3" />{org.courses_count ?? 0}</Badge></>}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => onView(org)} className="text-xs"><FolderOpen className="w-3.5 h-3.5 mr-1" />Просмотр</Button>
              <Button variant="outline" size="sm" onClick={() => onViewAs(org)} className="text-xs"><ExternalLink className="w-3.5 h-3.5 mr-1" />Войти как</Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(org)}><Pencil className="w-3.5 h-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(org)}><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
