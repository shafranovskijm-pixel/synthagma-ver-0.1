import type{PolicyVersion}from'./types.ts';
/** Only methods with an actual recipient workflow may activate a public invitation. Graphic preparation stays in the staff journal. */
export function canInviteWithPolicy(policy:PolicyVersion,documentType:string):boolean{return policy.decision.state==='centre_accepted'&&policy.body.classification.document_type===documentType&&policy.body.classification.party_role!=='sender'&&['scan_received','bearer_invitation_confirmation','authenticated_account_confirmation'].includes(policy.body.method);}
