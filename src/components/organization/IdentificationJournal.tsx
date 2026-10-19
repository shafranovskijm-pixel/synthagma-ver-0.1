import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Search, UserCheck, UserX, Clock, Camera, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { resolveGroupGateState, type GroupJournalContext } from "@/lib/journals/groupJournalContext";

import { useAuth } from '@/hooks/useAuth';
import { captureOfflineActor, isOfflineActorCurrent } from '@/utils/courseCache';
import { captureIdentificationScope, identificationBearer, readIdentificationStates, decideIdentification } from '@/lib/identification/client';
import { identificationAssuranceLabel, type IdentificationRecord as CanonicalIdentification, type IdentificationSubject, type IdentificationAction } from '@/lib/identification/contract';
import { IdentificationPhoto } from '@/hooks/useIdentificationMedia';

interface IdentificationRecord {
  canonical: CanonicalIdentification | null;
  subject: IdentificationSubject;
  id: string;
  user_id: string;
  status: string;
  photo_url: string | null;
  created_at: string;
  full_name: string;
  email: string;
}

interface IdentificationJournalProps {
  organizationId: string;
  onClose: () => void;
  groupContext?: GroupJournalContext | null;
}

export function IdentificationJournal({ organizationId, onClose, groupContext }: IdentificationJournalProps) {
  const {user: actor,loading:authLoading} = useAuth();
  const accessRevision = captureOfflineActor(actor?.id);
  const [loadError,setLoadError] = useState(false);
  const [busy,setBusy] = useState<string | null>(null);
  const requests = useRef(new Map<string,string>());
  const mounted = useRef(true);
  const loadRevision = useRef(0);
  const [records, setRecords] = useState<IdentificationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const groupGate = resolveGroupGateState("identification", groupContext);
  const groupMemberKey = (groupContext?.memberUserIds ?? []).join(",");

  const identityKey = JSON.stringify([actor?.id,accessRevision,authLoading,organizationId,groupGate,groupMemberKey]);
  const identity = useRef({key:identityKey,generation:0});
  if (identity.current.key !== identityKey) identity.current = {key:identityKey,generation:identity.current.generation+1};
  const generation = identity.current.generation;
  const [loadedGeneration,setLoadedGeneration] = useState(-1);
  const current = () => mounted.current && !!actor && !authLoading && identity.current.generation === generation && isOfflineActorCurrent(actor.id,accessRevision);

  useEffect(() => {
    mounted.current = true; requests.current.clear(); setRecords([]); setLoadedGeneration(-1); setBusy(null);
    if (groupGate === 'loading' || groupGate === 'error' || !current()) {setIsLoading(groupGate === 'loading');setLoadError(groupGate==='error');setLoadedGeneration(generation);return;}
    void loadRecords();
    return () => {mounted.current=false;loadRevision.current++;};
  },[identityKey]);

  const loadRecords = async () => {
    if (groupGate === 'loading' || groupGate === 'error') return;
    const request = ++loadRevision.current;
    const live = () => current() && request === loadRevision.current;
    if (!live()) return;
    setIsLoading(true); setLoadError(false);
    try {
      const scope = captureIdentificationScope(organizationId,actor!.id,null,live);
      const bearer = await identificationBearer(scope);
      if (!live()) return;
      let profilesQuery = supabase.from('profiles').select('user_id, full_name, email').eq('organization_id',organizationId).setHeader('Authorization',bearer);
      if (groupGate === 'ready') {
        const memberIds = groupContext?.memberUserIds || [];
        if (!memberIds.length) {setRecords([]);setLoadedGeneration(generation);return;}
        profilesQuery=profilesQuery.in('user_id',memberIds);
      }
      const {data:profiles,error} = await profilesQuery;
      if (!live()) return;
      if (error) throw error;
      const states = new Map<string,IdentificationSubject>();
      for (let offset=0;offset<(profiles || []).length;offset+=100) {
        const ids=profiles!.slice(offset,offset+100).map(profile=>profile.user_id);
        const values=await readIdentificationStates({...scope,studentUserId:ids[0]},ids);
        if (!live()) return;
        values.forEach(value=>states.set(value.studentUserId,value));
      }
      const result:IdentificationRecord[]=(profiles || []).map(profile=>{
        const subject=states.get(profile.user_id);
        if (!subject) throw new Error('Identification state not confirmed');
        const record=subject.current;
        return {canonical:record,subject,id:record?.identificationId || profile.user_id,user_id:profile.user_id,status:record?.status || 'none',photo_url:null,
          created_at:record?.createdAt || '',full_name:profile.full_name || 'Без имени',email:profile.email || ''};
      });
      if (live()) {setRecords(result);setLoadedGeneration(generation);}
    } catch {if(live()){setRecords([]);setLoadError(true);setLoadedGeneration(generation);}}
    finally {if(live())setIsLoading(false);}
  };

  const updateStatus = async (item:IdentificationRecord, action:IdentificationAction) => {
    if (!current() || busy || loadedGeneration !== generation) return;
    const record=action==='manual_verify' ? null : item.canonical;
    const capabilities=record?.capabilities || item.subject.capabilities;
    if (action==='verify' && (!capabilities.canReview || record?.assurance!=='submitted')) return;
    if (action==='reject' && !capabilities.canReject || action==='reset' && !capabilities.canReset || action==='manual_verify' && !capabilities.canReview) return;
    const reason=action==='reject' ? prompt('Причина отклонения:')?.trim() || null : null;
    if(action==='reject'&&!reason)return;
    const requestKey=JSON.stringify([item.user_id,record?.identificationId,record?.revision,action,reason]);
    const requestId=requests.current.get(requestKey)||crypto.randomUUID();requests.current.set(requestKey,requestId);
    setBusy(item.id);
    try {
      await decideIdentification(captureIdentificationScope(organizationId,item.user_id,null,current),action,record,requestId,reason);
      if(!current())return;
      await loadRecords();
      if(current())toast.success(action==='manual_verify'?'Ручная отметка сотрудника сохранена без фотографии':action==='reset'?'Статус сброшен':'Решение сохранено');
    }catch{if(current()){toast.error('Решение не подтверждено. Обновите статус и проверьте права.');await loadRecords();}}
    finally{if(current())setBusy(null);}
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "verified":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle2 className="w-3 h-3 mr-1" />Подтверждено</Badge>;
      case "pending":
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20"><Clock className="w-3 h-3 mr-1" />Ожидает</Badge>;
      case "rejected":
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20"><XCircle className="w-3 h-3 mr-1" />Отклонено</Badge>;
      default:
        return <Badge variant="outline"><AlertCircle className="w-3 h-3 mr-1" />Не пройдено</Badge>;
    }
  };

  const visibleRecords = current() && loadedGeneration === generation ? records : [];
  const filtered = visibleRecords.filter((r) => {
    const matchesSearch =
      r.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const counts = {
    all: visibleRecords.length,
    pending: visibleRecords.filter((r) => r.status === "pending").length,
    verified: visibleRecords.filter((r) => r.status === "verified").length,
    rejected: visibleRecords.filter((r) => r.status === "rejected").length,
    none: visibleRecords.filter((r) => r.status === "none").length };

  if (isLoading || current() && loadedGeneration !== generation) {
    return (
      <div className="flex justify-center py-12">
        <SigmaSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Camera className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Журнал видеоидентификации</h2>
            <p className="text-sm text-muted-foreground">
              Сводная таблица статусов идентификации студентов
            </p>
          </div>
        </div>
      </div>

      {(loadError || groupGate === 'error') && <div className="text-sm text-destructive">Не удалось подтвердить доступ к журналу. <Button variant="link" onClick={() => void loadRecords()}>Повторить</Button></div>}
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Всего", count: counts.all, color: "text-foreground" },
          { label: "Ожидает", count: counts.pending, color: "text-amber-500" },
          { label: "Подтверждено", count: counts.verified, color: "text-green-500" },
          { label: "Отклонено", count: counts.rejected, color: "text-red-500" },
          { label: "Не пройдено", count: counts.none, color: "text-muted-foreground" },
        ].map((s) => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-3 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.count}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по имени или email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 rounded-xl"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px] rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="pending">Ожидает</SelectItem>
            <SelectItem value="verified">Подтверждено</SelectItem>
            <SelectItem value="rejected">Отклонено</SelectItem>
            <SelectItem value="none">Не пройдено</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Студент</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Фото</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Нет записей
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{record.full_name}</div>
                      <div className="text-xs text-muted-foreground">{record.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>{statusBadge(record.status)}{record.canonical && <p className="text-[10px] text-muted-foreground mt-1">{identificationAssuranceLabel(record.canonical)}</p>}</TableCell>
                  <TableCell>
                    <IdentificationPhoto scope={current() ? captureIdentificationScope(organizationId,record.user_id,record.canonical?.enrollmentId || null,current) : null}
                      record={record.canonical} className="w-10 h-10 rounded-lg object-cover border border-border" />
                  </TableCell>
                  <TableCell>
                    {record.created_at ? (
                      <span className="text-sm">
                        {format(new Date(record.created_at), "d MMM yyyy", { locale: ru })}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {record.status === 'pending' && <>
                        <Button size="sm" className="rounded-lg" disabled={!!busy || !record.canonical?.capabilities.canReview || record.canonical.assurance !== 'submitted'} onClick={() => void updateStatus(record,'verify')}><UserCheck className="w-4 h-4 mr-1" />Подтвердить</Button>
                        <Button size="sm" variant="outline" className="rounded-lg text-destructive" disabled={!!busy || !record.canonical?.capabilities.canReject} onClick={() => void updateStatus(record,'reject')}><UserX className="w-4 h-4 mr-1" />Отклонить</Button>
                      </>}
                      {['verified','rejected'].includes(record.status) && <Button size="sm" variant="outline" className="rounded-lg" disabled={!!busy || !record.canonical?.capabilities.canReset} onClick={() => void updateStatus(record,'reset')}>Сбросить</Button>}
                      {record.status === 'none' && record.subject.capabilities.canReview && <Button size="sm" variant="outline" className="rounded-lg" disabled={!!busy} onClick={() => void updateStatus(record,'manual_verify')}>Ручная отметка без фото</Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
