import ShiftTypeForm from '../components/shift-type-form';

export const dynamic = 'force-dynamic';

export default function CreateShiftTypePage() {
  return (
    <div className="max-w-6xl mx-auto py-8">
      <ShiftTypeForm />
    </div>
  );
}
