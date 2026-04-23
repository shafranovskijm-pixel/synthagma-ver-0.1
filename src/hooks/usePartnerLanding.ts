import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { getPartnerRef } from "@/utils/referralCookie";
import { getBaseUrl } from "@/utils/getBaseUrl";

export function usePartnerLanding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isPartner, setIsPartner] = useState(false);
  const [partnerCode, setPartnerCode] = useState<string | null>(null);
  const [isBecoming, setIsBecoming] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const [calcLevel1, setCalcLevel1] = useState(5);
  const [calcLevel2, setCalcLevel2] = useState(10);
  const [calcLevel3, setCalcLevel3] = useState(20);
  const [calcAvgPrice, setCalcAvgPrice] = useState(6990);

  useEffect(() => {
    if (user) {
      supabase
        .from("referral_partners")
        .select("code")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) { setIsPartner(true); setPartnerCode(data.code); }
        });
    }
  }, [user]);

  const handleBecomePartner = async () => {
    if (!user) { navigate("/login"); return; }
    setIsBecoming(true);
    try {
      const partnerRef = getPartnerRef();
      const { data, error } = await supabase.rpc("become_referral_partner", {
        p_referred_by: partnerRef || null,
      });
      if (error) throw error;
      setPartnerCode(data);
      setIsPartner(true);
      toast.success("Вы стали партнёром!", { description: `Ваш реферальный код: ${data}` });
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally { setIsBecoming(false); }
  };

  const refLink = partnerCode ? `${getBaseUrl()}/register?ref=${partnerCode}` : getBaseUrl();
  const partnerRefLink = partnerCode ? `${getBaseUrl()}/partner?partner_ref=${partnerCode}` : "";

  const calcIncome1 = calcLevel1 * calcAvgPrice * 0.2;
  const calcIncome2 = calcLevel2 * calcAvgPrice * 0.1;
  const calcIncome3 = calcLevel3 * calcAvgPrice * 0.05;
  const calcTotal = calcIncome1 + calcIncome2 + calcIncome3;
  const calcTurnoverBonus = calcTotal > 100000 ? calcTotal * 0.05 : 0;
  const calcGrandTotal = calcTotal + calcTurnoverBonus;

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Текст скопирован!");
  };

  return {
    user, navigate, isPartner, partnerCode, isBecoming, agreedToTerms, setAgreedToTerms,
    calcLevel1, setCalcLevel1, calcLevel2, setCalcLevel2, calcLevel3, setCalcLevel3,
    calcAvgPrice, setCalcAvgPrice, calcIncome1, calcIncome2, calcIncome3,
    calcTurnoverBonus, calcGrandTotal,
    handleBecomePartner, refLink, partnerRefLink, copyText,
  };
}
