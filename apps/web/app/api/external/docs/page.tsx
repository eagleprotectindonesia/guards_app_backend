'use client';

import dynamic from 'next/dynamic';
import 'swagger-ui-react/swagger-ui.css';

const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false });

export default function ApiDocs() {
  return (
    <div className="min-h-screen bg-white">
      <div className="bg-red-700 p-4 text-white">
        <h1 className="text-2xl font-bold">Eagle Protect Public API Documentation</h1>
        <p>Manage external access to employee, site, and shift data.</p>
      </div>
      <SwaggerUI url="/api/external/v1/openapi.json" />
    </div>
  );
}
