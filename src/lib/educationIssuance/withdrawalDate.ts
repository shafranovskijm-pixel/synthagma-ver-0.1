import {localDateIso} from '@/lib/date/localDate';
/** Operator-local date convention, constrained by the existing provider CURRENT_DATE (UTC) rule.
 * This is a form suggestion; the authoritative preview validates the supplied effective date. */
export function withdrawalDateBounds(now:Date=new Date()){
 const localDate=localDateIso(now),maximumDate=now.toISOString().slice(0,10);
 return {localDate,maximumDate,suggestedDate:localDate>maximumDate?maximumDate:localDate};
}
