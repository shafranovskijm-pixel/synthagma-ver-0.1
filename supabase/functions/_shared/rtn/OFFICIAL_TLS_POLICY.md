# RTN public-source TLS policy

`official-http-client.ts` is used only by the existing source-check/source-cron
runtime, after a genuine durable claim. Its client is created lazily per check
and closed after the complete check, including response bodies, private original
storage and the single completion RPC. Auth/RPC/Storage SDK transports are not
changed. The NPA239/250 runtime is not changed by this patch.

The additional certificate is GlobalSign GCC R46 AlphaSSL CA2025, obtained from
GlobalSign's public certificate endpoint. On 15 November 2026 the inspected
`www.gosnadzor.ru` peer presented only its leaf. The reviewed ICA matches that
leaf's AKI. Offline strict verification of the captured leaf using the official
Root R46 trust anchor and the ICA as an **untrusted intermediate** passed hostname,
SSL-server purpose, signatures, constraints and current time. Offline evidence
SHA256: `884f6af4b1e43d86827cb3e2a8c3650d2616e75881a4b8bd372a05896653af38`.

Deno's `caCerts` API instead adds the ICA as a **trust anchor alongside default
roots**. It is not a way to provide only an untrusted intermediate. The live
connection therefore does not establish a full path to Root R46, exclusive
issuer/leaf pinning or revocation freshness. Normal Deno peer hostname, leaf
signature and time verification stay enabled. No certificate-error bypass,
insecure fallback, AIA fetch or automatic certificate rotation is implemented.

Only HTTPS `www.gosnadzor.ru` with the existing reviewed official path rules can
receive this client. Bare `gosnadzor.ru` fails closed in this scoped transport;
foreign hosts, foreign-host redirects, credentials and request overrides fail closed. The
existing manual redirect, size and time limits remain authoritative. A custom
client API failure also fails the check; it does not select another transport.

Both ICA and Root DER SHA256 pins are checked before trusting the fixed reviewed
UTC validity metadata on every request. Both certificates must remain within
their reviewed windows; `notAfter` is exclusive. The Root is provenance evidence
and is not added to client options. The earliest window ends on 23 June 2029
at 00:00:00 UTC. Rotation requires a new explicit source review of public bytes,
both DER pins, UTC dates, official issuer relationship and independent offline
chain verification. The static metadata is not an ASN.1 parser and must never be
updated separately from its exact certificate bytes and review evidence.

Future NPA question-source integration requires a separate review: only its
Gosnadzor verifier can use this scope. Its Pravo HTTP transport, project SDK
transport, cron authentication and database admission proofs must remain
separate. This patch does not wire the NPA runtime or claim that hosted custom
client support has already been accepted; that requires a bounded real check
after deployment.
