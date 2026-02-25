import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Helmet } from 'react-helmet-async';
import { ProposalContent } from '@/components/admin/sales/ProposalPreview';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import type { CommercialProposal, ProposalServiceItem } from '@/hooks/useSalesManager';

export default function ProposalPublic() {
  const { id } = useParams<{ id: string }>();
  const [proposal, setProposal] = useState<CommercialProposal | null>(null);
  const [services, setServices] = useState<ProposalServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data: p, error: pe } = await supabase
        .from('commercial_proposals')
        .select('*')
        .eq('id', id)
        .single();
      if (pe || !p) {
        setError('Коммерческое предложение не найдено или недоступно');
        setLoading(false);
        return;
      }
      setProposal(p as unknown as CommercialProposal);
      const { data: s } = await supabase
        .from('commercial_proposal_services')
        .select('*')
        .eq('proposal_id', id)
        .order('sort_order');
      setServices((s || []) as unknown as ProposalServiceItem[]);
      setLoading(false);
    })();
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-gray-500">Загрузка...</div>
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Не найдено</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>КП — {proposal.company_name} | Синтагма</title>
      </Helmet>
      <div className="min-h-screen bg-gray-100 print:bg-white">
        <div className="print:hidden sticky top-0 z-10 bg-white border-b border-gray-200 p-3 flex items-center justify-center gap-4">
          <span className="text-sm text-gray-600">Коммерческое предложение для {proposal.company_name}</span>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-1" />Скачать PDF
          </Button>
        </div>
        <div className="py-8 print:py-0">
          <div className="bg-white shadow-lg mx-auto print:shadow-none" style={{ maxWidth: 900 }}>
            <ProposalContent proposal={proposal} services={services} discountPercent={proposal.discount_percent || 0} />
          </div>
        </div>
      </div>
    </>
  );
}
