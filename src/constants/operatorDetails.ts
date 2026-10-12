/**
 * Общий источник реквизитов для frontend и Edge functions.
 * Актуальные значения хранятся в app_settings.operator_requisites.
 */
export {
  OPERATOR,
  DEFAULT_OPERATOR_REQUISITES,
  readStoredCompanyCardRequisites,
  type OperatorDetails,
  type OperatorRequisites,
} from "../../supabase/functions/_shared/operator-details";
