import { sameCopyValue } from '@/lib/copyRegistry/value';
import { IndividualOrderError, individualOrderScopeCurrent, readIndividualEducationOrder, type IndividualOrderScope } from './client';
import type { IndividualOrder, OrderBasis } from './contract';

/** W1 prior-admission proof is its real registered event, never a registry or current-order revision. */
export async function readIndividualOrderPriorAdmissionBasis(scope: IndividualOrderScope, expected: IndividualOrder): Promise<OrderBasis> {
  const current = () => { if (!individualOrderScopeCurrent(scope)) throw new IndividualOrderError('ACCESS_DENIED'); };
  const read = async () => { current(); const result = await readIndividualEducationOrder(scope, { version: 1, kind: 'order', order_id: expected.id }); current(); if (result.kind !== 'order' || result.order.order_kind !== 'admission' || result.order.state !== 'registered' || result.order.revision !== expected.revision || result.order.state_sha256 !== expected.state_sha256 || !result.order.registry || !result.order.artifact?.output_review || !sameCopyValue(result.order.registry.source, result.order.artifact.source)) throw new IndividualOrderError('SOURCE_CHANGED'); return result.order; };
  const before = await read(), eventId = before.artifact!.output_review!.event_id; let afterRevision = 0;
  for (let page = 0; page < 10; page++) {
    const result = await readIndividualEducationOrder(scope, { version: 1, kind: 'history', order_id: before.id, after_revision: afterRevision, limit: 100 }); current();
    if (result.kind !== 'history') throw new IndividualOrderError('SOURCE_CHANGED');
    const event = result.events.find(item => item.id === eventId);
    if (event) { if (event.action !== 'output_reviewed_and_registered' || event.order_id !== before.id || event.revision > before.revision) throw new IndividualOrderError('SOURCE_CHANGED'); const after = await read(); if (!sameCopyValue(before, after)) throw new IndividualOrderError('SOURCE_CHANGED'); return Object.freeze({ role: 'prior_admission_order', source: Object.freeze({ ...before.artifact!.source }), review_id: event.id, review_revision: event.revision, provision: 'Приказ о зачислении № ' + before.official_order_number!.display + ' от ' + before.dates.document_date }); }
    if (result.next_after_revision === null) throw new IndividualOrderError('PREREQUISITE_MISSING', ['PRIOR_ADMISSION_REQUIRED']);
    if (result.next_after_revision <= afterRevision) throw new IndividualOrderError('SOURCE_CHANGED'); afterRevision = result.next_after_revision;
  }
  throw new IndividualOrderError('LIMIT_EXCEEDED');
}
