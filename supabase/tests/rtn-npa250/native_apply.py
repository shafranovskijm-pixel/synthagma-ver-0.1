"""Connection helpers for the dedicated synthetic PostgreSQL17 cluster only."""
from pathlib import Path
from pgwire_lab import LabConnection

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
MIGRATION=ROOT/'supabase/migrations/20261114125000_rtn_normative_attestations.sql'
ARTIFACTS=HERE/'artifacts'
CONNECTION=None

def close_query():
 global CONNECTION
 if CONNECTION is not None:
  CONNECTION.close()
  CONNECTION=None

def query(sql):
 global CONNECTION
 if CONNECTION is None:CONNECTION=LabConnection()
 try:return CONNECTION.query(sql)
 except Exception:
  close_query()
  raise
