import { serialize } from '@/lib/utils';
import EmployeeDetail from '../components/employee-detail';
import { notFound } from 'next/navigation';
import { getEmployeeById } from '@/lib/data-access/employees';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EmployeeDetailPage({ params }: Props) {
  const { id } = await params;

  const employee = await getEmployeeById(id);

  if (!employee) {
    notFound();
  }

  const serializedEmployee = serialize(employee);

  return <EmployeeDetail employee={serializedEmployee} />;
}