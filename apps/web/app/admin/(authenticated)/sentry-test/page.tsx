'use client';

export default function SentryTestPage() {
  if (process.env.NODE_ENV === 'production') {
    return <div className="p-6">Not found.</div>;
  }

  return (
    <main className="p-6">
      <h1 className="mb-3 text-xl font-semibold">Sentry Browser Error Test</h1>
      <p className="mb-4 text-sm text-gray-600">Use this button to trigger a client-side exception.</p>
      <button
        type="button"
        className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        onClick={() => {
          throw new Error('Sentry Test Error: client-side exception');
        }}
      >
        Throw test error
      </button>
    </main>
  );
}
