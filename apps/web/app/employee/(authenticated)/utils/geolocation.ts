const HIGH_ACCURACY_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 5000,
  maximumAge: 0,
};

const RELAXED_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10000,
  maximumAge: 60_000,
};

export type PositionFetcher = (options: PositionOptions) => Promise<GeolocationPosition>;

export function getCurrentPositionWithFallback(fetchPosition: PositionFetcher): Promise<GeolocationPosition> {
  return fetchPosition(HIGH_ACCURACY_OPTIONS).catch(firstError => {
    console.warn('[Geolocation] High accuracy request failed; retrying with relaxed options.', firstError);
    return fetchPosition(RELAXED_OPTIONS);
  });
}

export function resolveBrowserPositionFetcher(geolocation: Geolocation): PositionFetcher {
  return (options: PositionOptions) =>
    new Promise<GeolocationPosition>((resolve, reject) => {
      geolocation.getCurrentPosition(resolve, reject, options);
    });
}
