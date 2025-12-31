import AdminForm from '../components/admin-form';

export const dynamic = 'force-dynamic';

export default function CreateAdminPage() {
  return (
    <div className="max-w-6xl mx-auto py-8">
      <AdminForm />
    </div>
  );
}
