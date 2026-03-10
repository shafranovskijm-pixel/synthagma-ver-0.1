import { toast } from "sonner";

export const showLimitToast = (message: string) => {
  toast.error(message, {
    duration: 6000,
    action: {
      label: "Перейти на тариф",
      onClick: () => window.dispatchEvent(new CustomEvent('navigate-to-subscription')),
    },
  });
};
