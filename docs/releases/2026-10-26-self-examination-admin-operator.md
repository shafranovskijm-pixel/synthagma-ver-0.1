# Restore the existing self-examination operator in the real admin route

The self-examination operator existed in an unmounted admin component. Organization details now render the existing operator in Documents, with the existing organization-scoped document list and refresh callback. The hook loads that list on the Documents tab as well as Settings. Existing billing and document blocks remain.

Backend authorization, paid-order rules, price3500, generation, source checks and immutable versions are unchanged. The existing explicit manual administrator task with no order permits synthetic QA without a purchase, charge or completed paid order. Generated drafts do not assert approved content or actual publication.

Validation: ordinary app TypeScript5121files/0diagnostics, including the already validated archive UI. No SQL, tariff, customer data or design change. Verify the actual admin route after frontend deployment; no existing draft or paid order was changed by this release.
