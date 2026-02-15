
## Plan: Notification for Paid Plan Registration

### What will change

When a user registers with any paid plan (start, standard, professional, maximum), the success message after registration will be replaced with a specific notification informing them that:
- Their tariff will be activated after payment
- A manager will contact them

### Technical details

**File: `src/pages/RegisterOrganization.tsx`**

In the `handleSubmit` function (around line 272), modify the success toast logic:

- If `selectedPlan !== 'free'`: show toast with title "Спасибо за регистрацию!" and description "Ваш тариф будет подключён после оплаты. Наш менеджер свяжется с вами. Спасибо!"
- If `selectedPlan === 'free'`: keep the current message "Организация зарегистрирована. Добро пожаловать!"

This is a small, focused change -- only the toast message text is conditional based on the selected plan.
