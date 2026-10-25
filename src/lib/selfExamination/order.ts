import { supabase } from '@/integrations/supabase/client';
import { SELF_EXAMINATION_SERVICE_PRICE } from '@/lib/selfExaminationPrice';
import { SELF_EXAMINATION_SERVICE } from './policy';
import type { SelfExaminationOrderReference } from './form';
export function prepareSelfExaminationOrder(reference:SelfExaminationOrderReference){return Object.freeze({id:crypto.randomUUID(),organization_id:reference.organization_id,service_id:SELF_EXAMINATION_SERVICE.id,service_title:SELF_EXAMINATION_SERVICE.title,service_price:SELF_EXAMINATION_SERVICE_PRICE.label,notes:JSON.stringify(reference),status:'pending'});}
/** Same explicit order ID recovers an uncertain insert. No payment or historical order update. */
export async function saveSelfExaminationOrder(order:ReturnType<typeof prepareSelfExaminationOrder>){
 const inserted=await supabase.from('service_orders').insert(order);if(!inserted.error)return;
 if(inserted.error.code!=='23505')throw inserted.error;
 const existing=await supabase.from('service_orders').select('id,organization_id,service_id,service_title,service_price,notes,status').eq('id',order.id).eq('organization_id',order.organization_id).single();if(existing.error)throw existing.error;
 if(!existing.data||existing.data.id!==order.id||existing.data.organization_id!==order.organization_id||existing.data.service_id!==order.service_id||existing.data.notes!==order.notes||existing.data.service_price!==order.service_price)throw Error('SELF_EXAMINATION_ORDER_REQUEST_MISMATCH');
}
