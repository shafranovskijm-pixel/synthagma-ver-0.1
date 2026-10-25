export { SELF_EXAMINATION_SERVICE, selfExaminationPeriod } from '../../../supabase/functions/_shared/self-examination-policy';
import { SELF_EXAMINATION_SERVICE_PRICE } from '@/lib/selfExaminationPrice';
export const selfExaminationPriceLabel=()=>SELF_EXAMINATION_SERVICE_PRICE.label;
