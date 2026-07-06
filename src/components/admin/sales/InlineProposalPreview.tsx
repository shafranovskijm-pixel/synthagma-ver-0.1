import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ProposalContent } from './ProposalPreview';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Printer, ExternalLink, Loader2 } from 'lucide-react';
import type { CommercialProposal, ProposalServiceItem } from '@/hooks/useSalesManager';

interface Props {
  proposalId: string;
  onBack: () => void;
}

export function InlineProposalPreview({ proposalId, onBack }: Props) {
  const [proposal, setProposal] = useState<CommercialProposal | null>(null);
  const [services, setServices] = useState<ProposalServiceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: p } = await supabase
        .from('commercial_proposals')
        .select('*')
        .eq('id', proposalId)
        .maybeSingle();
      const { data: s } = await supabase
        .from('commercial_proposal_services')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('sort_order');
      setProposal((p as unknown as CommercialProposal) || null);
      setServices(((s || []) as unknown as ProposalServiceItem[]));
      setLoading(false);
    })();
  }, [proposalId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Назад к компаниям
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
            <Printer className="w-3.5 h-3.5" /> Скачать PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open(`/proposal/${proposalId}`, '_blank')} className="gap-1.5">
            <ExternalLink className="w-3.5 h-3.5" /> В новой вкладке
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Загружаем предпросмотр…
        </div>
      ) : !proposal ? (
        <div className="text-center py-24 text-muted-foreground">КП не найдено</div>
      ) : (
        <div className="bg-white shadow-lg mx-auto rounded-lg print:shadow-none" style={{ maxWidth: 900 }}>
          <ProposalContent
            proposal={proposal}
            services={services}
            discountPercent={proposal.discount_percent || 0}
            senderName={proposal.sender_name || undefined}
            senderEmail={proposal.sender_email || undefined}
            senderWebsite={proposal.sender_website || undefined}
          />
        </div>
      )}
    </div>
  );
}
