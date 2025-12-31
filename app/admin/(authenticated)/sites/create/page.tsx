import SiteForm from '../components/site-form';

export const dynamic = 'force-dynamic';

export default function CreateSitePage() {
  return (
    <div className="max-w-6xl mx-auto py-8">
      <SiteForm />
    </div>
  );
}
