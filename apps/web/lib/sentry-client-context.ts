type BrowserNetworkInfo = {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
};

type BrowserNavigatorLike = Navigator & {
  connection?: BrowserNetworkInfo;
  deviceMemory?: number;
};

export type SentryClientContext = {
  url: string;
  path: string;
  referrer: string;
  userAgent: string;
  platform: string;
  vendor: string;
  language: string;
  languages: readonly string[];
  timezone: string;
  online: boolean;
  visibilityState: string;
  viewport: {
    width: number;
    height: number;
  };
  screen: {
    width: number;
    height: number;
    availWidth: number;
    availHeight: number;
    colorDepth: number;
    pixelDepth: number;
    devicePixelRatio: number;
  };
  deviceHints: {
    hardwareConcurrency?: number;
    deviceMemory?: number;
    maxTouchPoints?: number;
  };
  connection?: BrowserNetworkInfo;
  geolocationPermission: 'granted' | 'denied' | 'prompt' | 'unknown';
};

export async function getSentryClientContext(): Promise<SentryClientContext> {
  const nav = navigator as BrowserNavigatorLike;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';

  let geolocationPermission: SentryClientContext['geolocationPermission'] = 'unknown';
  try {
    if (typeof navigator.permissions?.query === 'function') {
      const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
      geolocationPermission = permissionStatus.state;
    }
  } catch {
    geolocationPermission = 'unknown';
  }

  return {
    url: window.location.href,
    path: window.location.pathname,
    referrer: document.referrer,
    userAgent: nav.userAgent,
    platform: nav.platform,
    vendor: nav.vendor,
    language: nav.language,
    languages: nav.languages ?? [],
    timezone,
    online: nav.onLine,
    visibilityState: document.visibilityState,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      availWidth: window.screen.availWidth,
      availHeight: window.screen.availHeight,
      colorDepth: window.screen.colorDepth,
      pixelDepth: window.screen.pixelDepth,
      devicePixelRatio: window.devicePixelRatio,
    },
    deviceHints: {
      hardwareConcurrency: nav.hardwareConcurrency,
      deviceMemory: nav.deviceMemory,
      maxTouchPoints: nav.maxTouchPoints,
    },
    connection: nav.connection,
    geolocationPermission,
  };
}
