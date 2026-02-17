type TelemetryMetadata = Record<string, string | number | boolean | undefined>;

const counters = new Map<string, number>();

export const incrementTelemetryCounter = (name: string, metadata?: TelemetryMetadata) => {
  const nextValue = (counters.get(name) ?? 0) + 1;
  counters.set(name, nextValue);

  if (__DEV__) {
    // Keep logs lightweight and only in development builds.
    console.debug('[Telemetry]', name, nextValue, metadata ?? {});
  }
};

export const getTelemetryCounter = (name: string) => counters.get(name) ?? 0;
