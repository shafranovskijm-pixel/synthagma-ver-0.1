---
name: FRDO Readiness Indicator
description: Education documents journal shows FRDO export readiness via get_frdo_export_readiness RPC; CTA "Перейти в ФРДО" switches DocumentsTab to frdo tab.
type: feature
---
В журналах выданных документов (удостоверения, дипломы, свидетельства) над таблицей выводится баннер `FrdoReadinessBanner` с прогрессом готовности к выгрузке в ФИС ФРДО:
- источник данных: RPC `get_frdo_export_readiness(p_organization_id)` (admin или текущая организация);
- метрики: total_documents, ready_for_export, missing_birth_date / snils / passport;
- CTA «Перейти в ФРДО» использует `setActiveTab("frdo")` из `useDocumentsTab`.
Связь документ↔студент идёт через `education_document_records.enrollment_id → enrollments.user_id → student_frdo_data`.
