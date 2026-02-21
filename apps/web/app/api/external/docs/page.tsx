'use client';

import dynamic from 'next/dynamic';
import 'swagger-ui-react/swagger-ui.css';

const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false });

export default function ApiDocs() {
  return (
    <div className="min-h-screen bg-zinc-950">
      {/* 
        SwaggerUI provides only a light theme by default. 
        We can dynamically invert the colors while preserving hues to create a fast, robust dark theme. 
      */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .swagger-dark-wrapper .swagger-ui {
          filter: invert(92%) hue-rotate(180deg);
        }
        /* Keep syntax highlighted code blocks readable by re-inverting them since they are naturally darkish sometimes, or just ensure text is readable */
        .swagger-dark-wrapper .swagger-ui .microlight {
          filter: invert(100%) hue-rotate(180deg);
        }
      `,
        }}
      />

      <div className="bg-zinc-900 border-b border-zinc-800 p-6">
        <h1 className="text-2xl font-semibold text-white mb-1">Eagle Protect Public API Documentation</h1>
        <p className="text-zinc-400">Manage external access to employee, site, and shift data.</p>
      </div>

      <div className="swagger-dark-wrapper bg-zinc-950 p-4 pb-20">
        <SwaggerUI url="/api/external/v1/openapi.json" />
      </div>
    </div>
  );
}
