import { Navigate } from "react-router-dom";

// Раздел «Настройки» удалён — все его подразделы (Разделы меню / ЛК ученика / Сотрудники)
// теперь находятся внутри «Профиля». Поддерживаем старые ссылки редиректом.
export default function OrganizationSettings() {
  return <Navigate to="/organization?tab=profile&section=menu" replace />;
}
