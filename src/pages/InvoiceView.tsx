import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { generateInvoiceHtml, type InvoiceData } from "@/constants/invoiceTemplate";
import { SUBSCRIPTION_PLANS } from "@/constants/subscriptionPlans";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer} from "lucide-react";

export default function InvoiceView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    loadInvoice();
  }, [id]);

  const loadInvoice = async () => {
    setLoading(true);
    try {
      const { data: invoice, error: err } = await supabase
        .from("subscription_invoices")
        .select("*")
        .eq("id", id!)
        .maybeSingle();

      if (err) throw err;
      if (!invoice) { setError("Счёт не найден"); return; }

      // Load org info
      const { data: org } = await supabase
        .from("organizations")
        .select("name, inn, kpp, legal_address")
        .eq("id", invoice.organization_id)
        .maybeSingle();

      const planInfo = SUBSCRIPTION_PLANS[invoice.plan as keyof typeof SUBSCRIPTION_PLANS];

      const invoiceData: InvoiceData = {
        invoiceNumber: invoice.invoice_number,
        invoiceDate: new Date(invoice.invoice_date).toLocaleDateString("ru-RU"),
        buyerName: (invoice as any).buyer_name || org?.name || "Организация",
        buyerInn: (invoice as any).buyer_inn || org?.inn,
        buyerKpp: (invoice as any).buyer_kpp || org?.kpp,
        buyerAddress: org?.legal_address,
        planName: planInfo?.name || invoice.plan,
        periodMonths: invoice.period_months,
        amount: Number(invoice.amount) };

      setHtml(generateInvoiceHtml(invoiceData));
    } catch (e: any) {
      setError(e.message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    const iframe = document.getElementById("invoice-frame") as HTMLIFrameElement;
    if (iframe?.contentWindow) {
      iframe.contentWindow.print();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <SigmaSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Назад
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="max-w-4xl mx-auto py-6 px-4">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold">Счёт на оплату</h1>
          <div className="flex-1" />
          <Button onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" /> Скачать PDF
          </Button>
        </div>
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <iframe
            id="invoice-frame"
            srcDoc={html || ""}
            className="w-full border-0"
            style={{ minHeight: "800px" }}
            title="Счёт на оплату"
          />
        </div>
      </div>
    </div>
  );
}
