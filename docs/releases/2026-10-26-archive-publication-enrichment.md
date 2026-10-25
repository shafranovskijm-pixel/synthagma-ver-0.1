# Archive rule guidance, publication TLS compatibility, and company-enrichment authorization

Archive classification now explains why an empty or paginated list has no approved retention rule, opens the existing authority/rule panel, reloads on return, and saves only a currently approved selected version. Existing decisions, authority checks and case history remain unchanged.

Publication checks accept the documented native startTls peer shape only when the original pinned TCP address and port443 still match. Explicit non-TCP transport, unknown shapes, address or port changes remain rejected. Original-hostname certificate validation, awaited TLS handshake and ALPN guards remain mandatory. This follows the observed tls_transport rejection; hosted success must be verified by a new normal UI check.

Company enrichment requires an active original caller with platform sales authority before charged providers or global service writes. Global CRM lookup/update requires organization_id IS NULL; provider/database details no longer enter public errors. No provider contract or legal compliance is inferred.

Validation: archive React3/3; stock app TypeScript5121files/0diagnostics; company enrichment handler30/30; affected TLS12/12; one publication runtime API build. Earlier fixture failures remain in the local evidence. Frontend and native deployment plus bounded working-site QA are separate release steps. No SQL migration, data rewrite, tariff, role grant or design change.
