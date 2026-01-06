import { Serialized } from '@/lib/utils';
import { Guard } from '@prisma/client';

type Props = {
  guard: Serialized<Guard>;
};

const formatDate = (date: string | null) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export default function GuardDetail({ guard }: Props) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Guard Details</h1>
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Name Field */}
          <div>
            <label className="block font-medium text-gray-700 mb-1">Full Name</label>
            <div className="w-full h-10 px-3 rounded-lg border border-gray-200 bg-gray-50 flex items-center">
              {guard.name}
            </div>
          </div>

          {/* Phone Field */}
          <div>
            <label className="block font-medium text-gray-700 mb-1">Phone Number</label>
            <div className="w-full h-10 px-3 rounded-lg border border-gray-200 bg-gray-50 flex items-center">
              {guard.phone || 'N/A'}
            </div>
          </div>

          {/* Employee ID Field */}
          <div>
            <label className="block font-medium text-gray-700 mb-1">Employee ID</label>
            <div className="w-full h-10 px-3 rounded-lg border border-gray-200 bg-gray-50 flex items-center">
              {guard.id}
            </div>
          </div>

          {/* Guard Code Field */}
          <div>
            <label className="block font-medium text-gray-700 mb-1">Guard Code</label>
            <div className="w-full h-10 px-3 rounded-lg border border-gray-200 bg-gray-50 flex items-center">
              {guard.guardCode}
            </div>
          </div>

          {/* Status Field */}
          <div>
            <label className="block font-medium text-gray-700 mb-1">Status</label>
            <div className="w-full h-10 px-3 rounded-lg border border-gray-200 bg-gray-50 flex items-center">
              <span className={`inline-flex items-center ${guard.status ? 'text-green-600' : 'text-red-600'}`}>
                <span className={`w-2 h-2 rounded-full mr-2 ${guard.status ? 'bg-green-600' : 'bg-red-600'}`}></span>
                {guard.status ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>

          {/* Join Date Field */}
          <div>
            <label className="block font-medium text-gray-700 mb-1">Join Date</label>
            <div className="w-full h-10 px-3 rounded-lg border border-gray-200 bg-gray-50 flex items-center">
              {formatDate(guard.joinDate)}
            </div>
          </div>

          {/* Left Date Field */}
          <div>
            <label className="block font-medium text-gray-700 mb-1">Left Date</label>
            <div className="w-full h-10 px-3 rounded-lg border border-gray-200 bg-gray-50 flex items-center">
              {formatDate(guard.leftDate)}
            </div>
          </div>

          {/* Note Field */}
          <div className="md:col-span-2">
            <label className="block font-medium text-gray-700 mb-1">Note</label>
            <div className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 min-h-12">
              {guard.note || 'No note provided'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
