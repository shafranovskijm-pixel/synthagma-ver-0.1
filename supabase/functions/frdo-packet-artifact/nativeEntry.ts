import{createFrdoHandler}from'./handler';
import{createRestFrdoPorts}from'./restTransport';
import{ownedFrdoDonor}from'../../build/frdo-packet-artifact/ownedDonors';
import{trustedFrdoXmlRuntime}from'./xmlRuntime';

/** Bundle entry, not a second implementation. The native package must include
 * this same canonical J source closure, exact donors and pinned XML parser.
 * Secrets are resolved only in the request-owned server closure and never sent
 * into the browser, source snapshots, DTOs or external providers. */
const handler=createFrdoHandler((originalBearer,guard)=>createRestFrdoPorts({
 supabaseUrl:Deno.env.get('SUPABASE_URL')??'',
 publishableKey:Deno.env.get('SUPABASE_ANON_KEY')??'',
 serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',
 originalBearer,fetch,guard,donor:ownedFrdoDonor,xml:trustedFrdoXmlRuntime,
}));
Deno.serve(handler);
