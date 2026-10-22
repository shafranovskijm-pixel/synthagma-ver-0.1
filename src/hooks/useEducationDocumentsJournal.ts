import { downloadIssuedPdf } from "@/lib/educationIssuance/artifactDownload";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useStaffPermissions } from '@/hooks/useStaffPermissions';
import { useDocumentActionPermissions, isCurrentOrganizationAccess } from '@/hooks/useDocumentActionPermissions';
import { useEducationIssuanceScope } from '@/hooks/useEducationIssuance';
import { captureOfflineContext } from '@/utils/courseCache';
import { getXLSX } from '@/utils/xlsxHelper';
import { issuanceScopeCurrent, normalizeIssuanceError, readEducationIssuance, requireIssuanceScope } from '@/lib/educationIssuance/client';
import { downloadIssuanceExport, loadIssuanceExport } from '@/lib/educationIssuance/export';
import { handoverStatus, proofStatus, recordStatus } from '@/lib/educationIssuance/presentation';
import type { IssuanceRecord } from '@/lib/educationIssuance/types';
import { resolveGroupGateState, type GroupJournalContext } from '@/lib/journals/groupJournalContext';
import { buildExportData, getJournalSubtitle, getJournalTitle, mapDbRecord } from './educationDocumentsHelpers';
export { DOCUMENT_TYPES, DELIVERY_METHODS } from './educationDocumentsHelpers';
export type { EducationDocumentRecord, CompletedStudent } from './educationDocumentsHelpers';
interface Props { organizationId: string; documentTypeFilter?: 'certificate' | 'diploma' | 'qualification'; groupContext?: GroupJournalContext | null }
export function useEducationDocumentsJournal({ organizationId, documentTypeFilter, groupContext }: Props) {
  const queryClient = useQueryClient(), permissions = useStaffPermissions(), ui = useDocumentActionPermissions(organizationId);
  const actor = captureOfflineContext();
  const groupGate = groupContext && !groupContext.groupId ? 'error' : resolveGroupGateState('education_documents', groupContext);
  const [after, setAfter] = useState<string | null>(null), [pages, setPages] = useState<IssuanceRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState(''), [selectedDocType, setSelectedDocType] = useState('all'), [selectedStatus, setSelectedStatus] = useState('all');
  const [serverFilter, setServerFilter] = useState<'all' | 'active' | 'annulled' | 'legacy_unverified'>('all');
  const [showIssueDialog, setShowIssueDialog] = useState(false), [focusedEnrollmentId, setFocusedEnrollmentId] = useState<string | null>(null), [recordId, setRecordId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const ready = (groupGate === 'none' || groupGate === 'ready') && isCurrentOrganizationAccess(permissions, organizationId) && permissions.can('documents.read') && !!actor;
  const key = useMemo(() => ['controlled-education-issuance', organizationId, groupContext?.groupId ?? null, groupContext?.courseId ?? null, groupGate, (groupContext?.memberUserIds ?? []).join(','), actor?.actorId, actor?.revision, serverFilter], [organizationId, groupContext?.groupId, groupContext?.courseId, groupGate, groupContext?.memberUserIds, actor?.actorId, actor?.revision, serverFilter]);
  const loadedKey = JSON.stringify(key);
  const capture = useEducationIssuanceScope(organizationId, groupContext?.groupId, loadedKey);
  const moreFlight = useRef(false), [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => { moreFlight.current = false; setLoadingMore(false); setExporting(false); }, [loadedKey]);
  const [pageKey, setPageKey] = useState(loadedKey);
  const { data, isLoading, isFetching, error, refetch } = useQuery({ queryKey: key, enabled: ready, retry: false, staleTime: 0,
    queryFn: async () => {
      const scope = capture();
      const value = await readEducationIssuance(scope, { kind: 'records', course_id: groupContext?.courseId ?? null, after_id: null, limit: 100, filter: serverFilter });
      if (value.kind !== 'records') throw normalizeIssuanceError(null);
      requireIssuanceScope(scope); setPages([]); setAfter(value.next_after_id); setPageKey(loadedKey); return { scope, value };
    },
  });
  const metadata = useQuery({ queryKey: ['controlled-issuance-options', ...key], enabled: ready, retry: false, staleTime: 0,
    queryFn: async () => {
      const scope = capture(); const session = await supabase.auth.getSession(); requireIssuanceScope(scope);
      if (session.error || session.data.session?.user.id !== scope.actorId || !session.data.session.access_token) throw normalizeIssuanceError({ code: '42501' });
      const token = 'Bearer ' + session.data.session.access_token;
      const rows:{id:string;title:string}[]=[];
      for(let page=0;;page++){
        let request=supabase.from('courses').select('id,title').eq('organization_id',organizationId).order('id').range(page*100,page*100+99);
        if(groupContext?.courseId)request=request.eq('id',groupContext.courseId);
        const courses=await request.setHeader('Authorization',token);requireIssuanceScope(scope);if(courses.error)throw courses.error;
        rows.push(...courses.data??[]);if((courses.data??[]).length<100)break;
      }
      return {scope,courses:rows.sort((a,b)=>a.title.localeCompare(b.title,'ru')),orgData:{name:''}};
    },
  });
  const current = ready && !!data && issuanceScopeCurrent(data.scope), currentMetadata = ready && metadata.data && issuanceScopeCurrent(metadata.data.scope) ? metadata.data : null;
  const records = current ? [...data.value.items, ...(pageKey === loadedKey ? pages : [])] : [];
  const filteredRecords = records.filter(record => {
    const row = record.official, text = searchQuery.toLowerCase();
    return (!documentTypeFilter || row.document_type === documentTypeFilter) && (selectedDocType === 'all' || row.document_type === selectedDocType)
      && (selectedStatus === 'all' || row.document_status === selectedStatus)
      && (!text || [row.full_name, row.reg_number, row.document_number, row.specialty_name].some(value => value.toLowerCase().includes(text)));
  });
  const loadMore = async () => {
    if (!current || !after || isFetching || moreFlight.current) return;
    const scope = data.scope; moreFlight.current = true; setLoadingMore(true);
    try { const value = await readEducationIssuance(scope, { kind: 'records', course_id: groupContext?.courseId ?? null, after_id: after, limit: 100, filter: serverFilter }); if (value.kind === 'records' && issuanceScopeCurrent(scope)) { setPages(previous => [...previous, ...value.items]); setAfter(value.next_after_id); } }
    catch (error) { if (issuanceScopeCurrent(scope)) toast.error(normalizeIssuanceError(error).message); }
    finally { if (issuanceScopeCurrent(scope)) { moreFlight.current = false; setLoadingMore(false); } }
  };
  const refresh = useCallback(() => { setPages([]); setAfter(null); void queryClient.invalidateQueries({ queryKey: ['controlled-education-issuance', organizationId] }); }, [queryClient, organizationId]);
  const exportCurrent = async (format: 'xlsx' | 'json' | 'html') => {
    if (!current || !data.value.capabilities.can_export || !filteredRecords.length || exporting) return;
    setExporting(true); const scope = data.scope;
    try {
      const query = { kind: 'export' as const, selection: { kind: 'records' as const, record_ids: filteredRecords.map(row => row.official.id) }, format: 'canonical_snapshot' as const };
      if (format !== 'xlsx') { await downloadIssuanceExport(scope, query, format); return; }
      const XLSX = await getXLSX(); requireIssuanceScope(scope);
      const { snapshot } = await loadIssuanceExport(scope, query);
      const rows = buildExportData(snapshot.records.map(row => mapDbRecord(row.official))).map((row, index) => ({ ...row, 'Состояние': recordStatus(snapshot.records[index]), 'Основание': proofStatus(snapshot.records[index]), 'Способ получения': snapshot.records[index].provenance==='legacy_unverified'?'Прежняя отметка: '+row['Способ получения']:handoverStatus(snapshot.records[index]), 'Передача по истории': handoverStatus(snapshot.records[index]) }));
      const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Документы');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(snapshot.history.map(event => ({ 'Запись': event.record_id, 'Версия': event.revision, 'Действие': event.kind, 'Время': event.recorded_at, 'Причина': event.reason }))), 'История');
      requireIssuanceScope(scope); XLSX.writeFile(workbook, 'Журнал_выдачи_документов.xlsx');
    } catch (error) { if (issuanceScopeCurrent(scope)) toast.error(normalizeIssuanceError(error).message); }
    finally { if (issuanceScopeCurrent(scope)) setExporting(false); }
  };
  const pdfFlight=useRef(false);
  const downloadPdf=async(recordId:string)=>{
    if(!current||pdfFlight.current)return; const scope=capture();pdfFlight.current=true;
    try{await downloadIssuedPdf(scope,recordId);}catch(cause){if(issuanceScopeCurrent(scope))toast.error(normalizeIssuanceError(cause).message);}
    finally{pdfFlight.current=false;}
  };
  const openIssue = (enrollmentId: string | null = null) => { if(!current || !ui.canIssue || !data.value.capabilities.can_issue)return; setFocusedEnrollmentId(enrollmentId); setShowIssueDialog(true); };
  return { loading: isLoading || groupGate === 'loading', loadingMore, groupGate, saving: exporting, error: groupGate === 'error' ? 'Состав или связь группы не подтверждены. Обновите папку группы.' : error ? normalizeIssuanceError(error).message : null,
    canIssue: current && ui.canIssue && data.value.capabilities.can_issue, canExport: current && data.value.capabilities.can_export,
    records, filteredRecords, searchQuery, setSearchQuery, selectedDocType, setSelectedDocType, selectedStatus, setSelectedStatus,
    serverFilter, setServerFilter, stats: { total: filteredRecords.length, certificates: filteredRecords.filter(row => row.official.document_type === 'certificate').length, diplomas: filteredRecords.filter(row => row.official.document_type === 'diploma').length, originals: filteredRecords.filter(row => row.official.document_status === 'original').length, duplicates: filteredRecords.filter(row => row.official.document_status === 'duplicate').length },
    orgData: currentMetadata?.orgData ?? { name: '' }, courses: currentMetadata?.courses ?? [], optionsError: metadata.error ? normalizeIssuanceError(metadata.error).message : null,
    journalTitle: getJournalTitle(documentTypeFilter), journalSubtitle: getJournalSubtitle(documentTypeFilter),
    showIssueDialog, setShowIssueDialog, focusedEnrollmentId, openIssue, recordId, setRecordId, refresh, refetch, loadMore,
    hasMore: current && after !== null, exportCurrent, downloadPdf,
  };
}
