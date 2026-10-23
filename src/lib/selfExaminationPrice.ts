/** Approved user price, 23 October 2026. Existing orders retain their recorded price. */
const amountRub = 3500;
export const SELF_EXAMINATION_SERVICE_PRICE = Object.freeze({
  amountRub,
  label: new Intl.NumberFormat("ru-RU").format(amountRub).replaceAll("\u00a0", " ") + " ₽",
});
