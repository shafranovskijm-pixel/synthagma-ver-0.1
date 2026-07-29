import type { UserFacingErrorKind } from "@/utils/isTransientNetworkError";

export function summaryErrorMessage(kind: UserFacingErrorKind | null | undefined): string {
  switch (kind) {
    case "permission":
      return "Недостаточно прав для просмотра статистики";
    case "unauthorized":
      return "Сессия истекла. Войдите заново";
    case "network":
      return "Не удалось загрузить статистику. Проверьте соединение";
    default:
      return "Статистика временно недоступна";
  }
}

export function courseOverviewErrorMessage(kind: UserFacingErrorKind | null | undefined): string {
  switch (kind) {
    case "permission":
      return "Недостаточно прав для просмотра счётчиков курсов";
    case "unauthorized":
      return "Сессия истекла. Войдите заново";
    case "network":
      return "Не удалось загрузить счётчики курсов. Проверьте соединение";
    default:
      return "Счётчики курсов временно недоступны";
  }
}
