# Support ownership, video upload authorization and FRDO recovery

Support history and actions now require an active original caller and ownership of the requested conversation. Guest history uses the existing opaque capability; private responses and polling are bound to the current actor epoch. Video upload initialization checks the original caller's course-write permission and the actual lesson/course relationship before contacting the provider. Existing global video asset operations remain restricted to platform administrators until an authoritative tenant binding exists.

A packet left in file_generating after interruption can be continued explicitly by its original actor. The client verifies the stored file_requested hash chain, reconstructs the original command revision and reuses the persisted request/build IDs. The server continues to decide lease and authorization validity. No new issue, packet, file request, or FIS submission is created by this recovery action.

Seven external-transport functions use a closed operational logger rather than raw payload, recipient, response-body or exception text. This is a bounded logging and access correction; remaining third-party response projections, topic metadata, processor contracts and data locations are separate open work.

Validation: 35 distinct scoped authorization/UI criteria, 17 logging criteria and 18 recovery criteria passed. The unchanged stock app TypeScript configuration checked 5,118 files with zero diagnostics. The separate local esbuild process failed at native startup (0xC0000005), before it received source input; it produced no bundle and was not retried or counted as a pass. Production bundle and working-site behavior require the normal CI/Timeweb release and live checks of this exact commit.

Only these source changes and this release note are included. SQL, existing records/files, tariffs, SGT postpaid overrides, JWT configuration and SDK pins are unchanged. Deploy the seven explicit functions in the reviewed mapping; frontend deployment alone does not publish their access checks.
