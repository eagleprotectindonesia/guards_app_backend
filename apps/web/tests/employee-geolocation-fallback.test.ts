import {
  getCurrentPositionWithFallback,
  resolveBrowserPositionFetcher,
} from '../app/employee/(authenticated)/utils/geolocation';

describe('employee geolocation fallback', () => {
  const createPosition = (lat: number, lng: number): GeolocationPosition =>
    ({
      coords: {
        latitude: lat,
        longitude: lng,
        altitude: null,
        accuracy: 1,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        toJSON: () => ({}),
      },
      timestamp: Date.now(),
      toJSON: () => ({}),
    }) as GeolocationPosition;

  test('returns first attempt result when high accuracy succeeds', async () => {
    const fetcher = jest.fn().mockResolvedValue(createPosition(1, 2));
    const position = await getCurrentPositionWithFallback(fetcher);

    expect(position.coords.latitude).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenNthCalledWith(1, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 });
  });

  test('retries with relaxed options when high accuracy fails', async () => {
    const fetcher = jest
      .fn()
      .mockRejectedValueOnce(new Error('gps-timeout'))
      .mockResolvedValueOnce(createPosition(3, 4));

    const position = await getCurrentPositionWithFallback(fetcher);

    expect(position.coords.latitude).toBe(3);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenNthCalledWith(1, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 });
    expect(fetcher).toHaveBeenNthCalledWith(2, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  });

  test('throws when both attempts fail', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('unavailable'));
    await expect(getCurrentPositionWithFallback(fetcher)).rejects.toThrow('unavailable');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test('browser position fetcher delegates options to geolocation API', async () => {
    const expected = createPosition(5, 6);
    const geolocation = {
      getCurrentPosition: jest.fn((success: PositionCallback, _error: PositionErrorCallback | null, options?: PositionOptions) => {
        expect(options).toEqual({ enableHighAccuracy: false, timeout: 500, maximumAge: 123 });
        success(expected);
      }),
    } as unknown as Geolocation;

    const fetcher = resolveBrowserPositionFetcher(geolocation);
    const result = await fetcher({ enableHighAccuracy: false, timeout: 500, maximumAge: 123 });

    expect(result.coords.latitude).toBe(5);
    expect(geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
  });
});

