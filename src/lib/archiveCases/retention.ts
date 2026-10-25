import{archiveCase,archiveDate,ArchiveError,type ArchiveCase,type ArchiveHoldEvent}from'./contract.ts';
export interface ArchiveRetentionResult{status:'review_required'|'held'|'retaining'|'candidate_for_review';rule_id:string|null;rule_revision:number|null;start_on:string|null;minimum_keep_through:string|null;first_candidate_review_on:string|null;active_hold_ids:string[];blockers:ArchiveError['code'][];destruction_authorized:false}
/** Never releases a hold merely because a review date has passed. */
export function currentArchiveHolds(events:ArchiveHoldEvent[]):string[]{
 const active=new Map<string,Extract<ArchiveHoldEvent,{kind:'placed'}>>(),eventIds=new Set<string>(),everPlaced=new Set<string>();let revision=0,lastInstant=-Infinity;
 for(const event of events){if(event.sequence!==revision+1||eventIds.has(event.id)||Date.parse(event.recorded_at)<lastInstant)throw new ArchiveError('HOLD_HISTORY_INVALID');revision=event.sequence;lastInstant=Date.parse(event.recorded_at);eventIds.add(event.id);
  if(event.kind==='placed'){if(everPlaced.has(event.hold_id))throw new ArchiveError('HOLD_HISTORY_INVALID');everPlaced.add(event.hold_id);active.set(event.hold_id,event);}
  else{const placed=active.get(event.hold_id);if(!placed||placed.id!==event.placed_event_id)throw new ArchiveError('HOLD_HISTORY_INVALID');active.delete(event.hold_id);}
 }
 return[...active.keys()].sort();
}
/** Arithmetic for an exact reviewed rule. This function supplies no statutory defaults or authority. */
export function evaluateArchiveRetention(raw:ArchiveCase,asOf:string):ArchiveRetentionResult{
 let value:ArchiveCase;try{value=archiveCase.parse(raw);archiveDate.parse(asOf);}catch{throw new ArchiveError('INVALID_INPUT');}
 const result:ArchiveRetentionResult={status:'review_required',rule_id:value.rule?.id??null,rule_revision:value.rule?.revision??null,start_on:null,minimum_keep_through:null,first_candidate_review_on:null,active_hold_ids:[],blockers:[],destruction_authorized:false};
 const block=(code:ArchiveError['code'])=>{if(!result.blockers.includes(code))result.blockers.push(code);};
 try{result.active_hold_ids=currentArchiveHolds(value.hold_events as ArchiveHoldEvent[]);}catch{block('HOLD_HISTORY_INVALID');}
 if(result.active_hold_ids.length)block('LEGAL_HOLD');
 const rule=value.rule;if(!rule){block('RETENTION_UNCLASSIFIED');return finish(result);}
 if(rule.status!=='approved'||!rule.source_checked_at||!rule.legal_review||!rule.center_approval)block('APPROVAL_REQUIRED');
 if(rule.effective_from>asOf||Date.parse(rule.source_checked_at??'')>Date.parse(asOf+'T23:59:59.999Z')||Date.parse(rule.legal_review?.recorded_at??'')>Date.parse(asOf+'T23:59:59.999Z')||Date.parse(rule.center_approval?.recorded_at??'')>Date.parse(asOf+'T23:59:59.999Z'))block('APPROVAL_STALE');
 if(rule.duration.kind==='unknown')block('RETENTION_UNCLASSIFIED');
 if(rule.duration.kind==='permanent')block('RETENTION_PERMANENT');
 if(rule.duration.kind==='event_bound')block('CLOSURE_REQUIRED');
 if(!value.closure)block('CLOSURE_REQUIRED');
 else{if(value.closure.kind!==rule.start_event)block('EVENT_MISMATCH');if(value.closure.actual_on>asOf)block('CLOSURE_REQUIRED');}
 if(result.blockers.some(code=>code!=='LEGAL_HOLD'))return finish(result);
 if(rule.duration.kind!=='years'||!value.closure)return finish(result);
 const startYear=Number(value.closure.actual_on.slice(0,4))+1,reviewYear=startYear+rule.duration.years;
 if(reviewYear>9999){block('LIMIT_EXCEEDED');return finish(result);}
 result.start_on=String(startYear).padStart(4,'0')+'-01-01';result.minimum_keep_through=String(reviewYear-1).padStart(4,'0')+'-12-31';result.first_candidate_review_on=String(reviewYear).padStart(4,'0')+'-01-01';
 if(asOf<result.first_candidate_review_on)block('RETENTION_NOT_EXPIRED');
 if(rule.requires_expert_review)block('EXPERT_REVIEW_REQUIRED');
 return finish(result);
}
function finish(value:ArchiveRetentionResult):ArchiveRetentionResult{
 value.status=value.active_hold_ids.length?'held':value.blockers.length===0?'candidate_for_review':value.blockers.every(code=>code==='RETENTION_NOT_EXPIRED')?'retaining':'review_required';return value;
}
