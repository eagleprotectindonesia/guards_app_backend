import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Eagle Protect Guard',
    short_name: 'EP Guard',
    description: 'Aplikasi jadwal dan absensi guard',
    start_url: '/guard/login',
    scope: '/guard/',
    display: 'standalone',
    background_color: '#f3f4f6',
    theme_color: '#2563eb',
    orientation: 'portrait',
    icons: [
      {
        src: '/guard/icon/icon-192',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any', // Browser uses this for the taskbar/shortcuts
      },
      {
        src: '/guard/icon/icon-512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any', // Browser uses this for the splash screen
      },
      {
        src: '/guard/icon/icon-maskable', // We create a separate ID for the padded version
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable', // Android uses this for the "circle" icon
      },
    ],
  };
}
