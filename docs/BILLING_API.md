# Billing through the connected API

The SINTAGMA MCP API uses an existing administrator OAuth connection. A browser
administrator session is not needed for each operation. The caller's normal
token is passed to Supabase; the database checks the current administrator role
and account revocation. No service-role key, claimed user ID, password, or SQL
execution is accepted in a tool input. An expired connection still needs the
normal OAuth reconnection; API tools do not bypass authentication.

## Contract postpayment

1. `get_sintagma_postpaid_billing_overview`: choose the exact organization and
   period, then inspect existing statement revisions and issued invoice IDs.
2. `prepare_sintagma_postpaid_statement`: prepare or reuse a draft for a closed
   Moscow calendar month. This does not issue or send an invoice.
3. `preview_sintagma_postpaid_statement`: obtain the current source hash, quote,
   evidence completeness, and exact statement identity. An issued statement
   returns its frozen metadata with `current:null` and `fresh:null`.
4. Reconcile actual usage and any required customer confirmations. An incomplete
   retrospective month requires explicit reviewed counts and a written review.
   Do not infer actual learning from assignments, profiles, menu visits, or a
   missing event history. Contract overrides remain authoritative.
5. `approve_sintagma_postpaid_statement`: send the organization, statement,
   expected source hash, amount, plan, reviewed counts, and review note. The
   database verifies the quote and invokes the existing approval writer under
   the same organization lock. It returns a `review_hash` binding the exact
   saved review. A conflicting existing review is not silently overwritten.
6. `issue_sintagma_postpaid_invoice`: send the same organization, statement,
   source hash, expected amount and plan, plus the returned review hash.
   The database checks these values atomically and invokes the existing invoice
   writer. A retry returns the same bound invoice, including after later
   changes in retrospective usage. It never creates another payable invoice.

On a lost connection or malformed write response, the API returns
`operation_may_have_committed:true`. Read the same statement and invoice before
retrying. Unknown transaction-outcome errors do not establish a rollback.

## Documents and delivery

Use the returned real invoice ID, number, date, organization and amount for
`preview_sintagma_invoice_act` / `create_sintagma_invoice_act`, or for the
24ZXC CRM `invoiceBasis`. Do not invent a source invoice or a replacement
contract. Reuse exact document revisions and delivery IDs; preserve existing
documents on retries. The CRM stores the recipient, subject, body and exact PDF
versions before sending. Apply the user's authorized supplier signature and
stamp only; customer acceptance and payment are separate facts.

`smtp_accepted` means the mail server accepted the message, not that the customer
received or read it. Do not automatically resend an unknown/sending delivery.
The postpaid tools themselves do not send mail or confirm payments.

## Access and renewal

Issuing or emailing a bill does not set `paid_at`, alter `paid_until`, or change
the customer's tariff. An active postpaid agreement grants its contracted
access independently of the old prepaid expiry field. Preserve all-feature
grants separately from paid-addon consent and preserve tenant/role controls.

For prepaid subscriptions, the existing verified payment or authorized bank
receipt confirmation extends access once from the later of now and the
existing paid-until timestamp. For postpayment, payment settlement does not
replace the agreement's access with a prepaid plan. A bill or email is not a
bank receipt, so neither triggers that payment confirmation automatically.

No billing API release should rewrite historical contracts, invoices, grades,
student attempts, organization branding or menu configuration.
