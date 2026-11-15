"""Build a checksum-guarded payload for one provider-owned atomic migration.

The checksum is checked by PostgreSQL before any source statement executes.
The caller/provider retains the one transaction boundary and its actual ledger.
"""
import hashlib


def guarded_payload_sql(source: str) -> str:
    if not source or '\x00' in source or '\r' in source:
        raise ValueError('A nonempty canonical LF UTF8 SQL source is required')
    digest = hashlib.sha256(source.encode('utf-8')).hexdigest()
    payload_tag = '$rtn_source_' + digest[:16] + '$'
    block_tag = '$rtn_guard_' + digest[:16] + '$'
    if payload_tag in source or block_tag in source:
        raise ValueError('SQL source collides with its delivery delimiter')
    return (
        '-- Exact canonical source SHA256: ' + digest + '\n'
        'DO ' + block_tag + '\n'
        'DECLARE payload constant pg_catalog.text := ' + payload_tag + source + payload_tag + ';\n'
        'BEGIN\n'
        " IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(payload,'UTF8')),'hex') <> '" + digest + "' THEN\n"
        "  RAISE EXCEPTION 'RTN_PROVIDER_PAYLOAD_BYTES_CHANGED';\n"
        ' END IF;\n'
        ' EXECUTE payload;\n'
        'END;' + block_tag + ';\n'
    )
