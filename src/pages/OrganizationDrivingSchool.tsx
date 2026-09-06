import { Link } from 'react-router-dom';
import { useOrgDashboard } from '@/contexts/OrgDashboardContext';
import DrivingSchoolPage from './DrivingSchoolPage';

export default function OrganizationDrivingSchool() {
  const { organizationId, isLoadingCourses } = useOrgDashboard();
  if (!organizationId) return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Автошкола — Beta</h1><p className="my-4" role="status">{isLoadingCourses ? 'Подтверждаем выбранную организацию…' : 'Не удалось однозначно определить организацию. Выберите организацию в обычном кабинете и повторите вход в модуль.'}</p><Link to="/organization">В кабинет организации</Link></main>;
  return <DrivingSchoolPage key={organizationId} organizationId={organizationId} />;
}
