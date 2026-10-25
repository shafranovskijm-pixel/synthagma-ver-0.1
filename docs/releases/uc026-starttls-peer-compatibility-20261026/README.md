# UC026: pinned startTls peer compatibility

This release restores compatibility with the upstream native startTls address representation. It changes one shared source and regenerates only publication-accessibility/runtime.bundle.js. The existing thin index, editable runtime-source.ts, HTTP/worker authorization, JWT configuration, SQL schema, observation format, UI design and stored data remain unchanged.

The upstream Deno startTls operation consumes the existing TCP stream and returns its peer as a serialized hostname/port object. Its JavaScript wrapper does not add the transport marker that connectTls adds. Supabase's reviewed upstream override binds that startTls directly. These are implementation sources; the actual hosted runtime version and raw cloud peer object have not been observed.

The exception requires exactly two own data properties on a plain object: hostname and numeric port443. Both must match the same numeric public TCP peer, which is checked again after the upgrade. Extra, inherited, accessor or symbol properties and explicit non-TCP markers cannot use the exception. The original URL hostname is still passed to TLS, certificate/hostname verification options are unchanged, and a successful awaited handshake with supported ALPN is still mandatory before any HTTP bytes. Existing independent peer checks and all DNS/redirect/body/time limits remain in place.

Affected offline evidence:12 actual old/new observer cases passed in one corrected fixture run. They cover the native shape, marked-TCP regressions and content verdicts, peer/port/shape/transport refusals, failed or missing handshake, unsupported ALPN, TCP mutation and private logger failure. DNS/TCP/TLS are explicit offline ports; simulated certificate rejection is not a live certificate acceptance proof. The first0/12 run is retained: the synthetic .example TLD was correctly refused by the existing URL guard before TCP/TLS. Only its4host literals changed to example.com; no real network call was made. The previous41cases were retained and not rerun.

The same proven API builder made one bounded bundle from exactly5held TypeScript inputs with only npm:@supabase/supabase-js@2.90.1 external. The runtime is13892bytes, SHA256 a01ba6c8234a2f6a03ac4a9e4ace82e4e1945fa98d2315ea91e78e4b498448c4. The three generated JSON files here are exact archived build outputs, not duplicate runtime bytes. DEPLOYMENT_MAPPING.json records sources, preserved settings and local evidence. Tests and source snapshots remain outside deployed function sources.

Deployment and working-site acceptance are pending. Preserve the existing native gateway setting; local bundle success is not Deno dependency resolution or cloud TLS proof. After the exact release, use one normal new UI publication check and retain old check evidence. Do not weaken transport or certificate checks if another representation is encountered.

Primary implementation references:

- [Supabase upstream TLS binding](https://raw.githubusercontent.com/supabase/edge-runtime/9198a5179776a7ceb8deb40cc3ea415f5f92cacd/ext/runtime/js/denoOverrides.js)
- [Deno startTls wrapper](https://raw.githubusercontent.com/denoland/deno/v2.1.4/ext/net/02_tls.js)
- [Deno TCP-to-TLS operation and handshake](https://raw.githubusercontent.com/denoland/deno/v2.1.4/ext/net/ops_tls.rs)
- [Deno serialized IpAddr](https://raw.githubusercontent.com/denoland/deno/v2.1.4/ext/net/ops.rs)
