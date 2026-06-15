import { findNearestAllowedSiteLocation, getNearestActivePunchTarget } from '../lib/site-post-location';
import { calculateDistance } from '../lib/server-utils';

describe('findNearestAllowedSiteLocation', () => {
  test('uses active posts when available', () => {
    const result = findNearestAllowedSiteLocation({
      site: {
        id: 'site-1',
        name: 'Site 1',
        latitude: 0,
        longitude: 1,
        posts: [{ id: 'post-1', name: 'Post 1', latitude: 0, longitude: 0.0001, status: true, deletedAt: null }],
      },
      employeeLocation: { lat: 0, lng: 0 },
      maxDistanceMeters: 100,
      calculateDistance,
    });

    expect(result.matchedLocation?.type).toBe('post');
    expect(result.matchedLocation?.id).toBe('post-1');
  });

  test('falls back to legacy site when no active posts', () => {
    const result = findNearestAllowedSiteLocation({
      site: {
        id: 'site-1',
        name: 'Legacy Site',
        latitude: 0,
        longitude: 0.0001,
        posts: [],
      },
      employeeLocation: { lat: 0, lng: 0 },
      maxDistanceMeters: 100,
      calculateDistance,
    });

    expect(result.matchedLocation?.type).toBe('legacy_site');
    expect(result.matchedLocation?.id).toBeNull();
  });

  test('ignores inactive and deleted posts', () => {
    const result = findNearestAllowedSiteLocation({
      site: {
        id: 'site-1',
        name: 'Site 1',
        latitude: null,
        longitude: null,
        posts: [
          { id: 'post-inactive', name: 'Inactive', latitude: 0, longitude: 0.0001, status: false, deletedAt: null },
          { id: 'post-deleted', name: 'Deleted', latitude: 0, longitude: 0.0001, status: true, deletedAt: new Date() },
        ],
      },
      employeeLocation: { lat: 0, lng: 0 },
      maxDistanceMeters: 100,
      calculateDistance,
    });

    expect(result.matchedLocation).toBeNull();
    expect(result.nearestLocation).toBeNull();
  });

  test('returns nearest location when out of range', () => {
    const result = findNearestAllowedSiteLocation({
      site: {
        id: 'site-1',
        name: 'Site 1',
        latitude: null,
        longitude: null,
        posts: [{ id: 'post-1', name: 'Post 1', latitude: 0, longitude: 0.002, status: true, deletedAt: null }],
      },
      employeeLocation: { lat: 0, lng: 0 },
      maxDistanceMeters: 100,
      calculateDistance,
    });

    expect(result.matchedLocation).toBeNull();
    expect(result.nearestLocation?.id).toBe('post-1');
    expect(typeof result.nearestLocation?.distanceMeters).toBe('number');
  });
});

describe('getNearestActivePunchTarget', () => {
  test('returns nearest active post when multiple posts exist', () => {
    const result = getNearestActivePunchTarget(
      {
        id: 'site-1',
        name: 'Site 1',
        latitude: 10,
        longitude: 10,
        posts: [
          { id: 'post-1', name: 'Post 1', latitude: 0, longitude: 0.001 },
          { id: 'post-2', name: 'Post 2', latitude: 0, longitude: 0.002 },
        ],
      },
      0,
      0,
      calculateDistance,
    );

    expect(result).not.toBeNull();
    expect(result!.target.type).toBe('post');
    expect(result!.target.id).toBe('post-1');
    expect(result!.target.name).toBe('Post 1');
    expect(result!.distanceMeters).toBeGreaterThan(0);
  });

  test('falls back to legacy site when no active posts', () => {
    const result = getNearestActivePunchTarget(
      {
        id: 'site-1',
        name: 'Legacy Site',
        latitude: 0,
        longitude: 0.001,
        posts: [],
      },
      0,
      0,
      calculateDistance,
    );

    expect(result).not.toBeNull();
    expect(result!.target.type).toBe('legacy_site');
    expect(result!.target.id).toBeNull();
    expect(result!.target.name).toBe('');
  });

  test('returns null when employee coordinates are null', () => {
    const result = getNearestActivePunchTarget(
      {
        id: 'site-1',
        name: 'Site 1',
        latitude: 0,
        longitude: 0,
        posts: [{ id: 'post-1', name: 'Post 1', latitude: 0, longitude: 0.001 }],
      },
      null,
      undefined,
      calculateDistance,
    );

    expect(result).toBeNull();
  });

  test('picks the closer of two posts', () => {
    const result = getNearestActivePunchTarget(
      {
        id: 'site-1',
        name: 'Site 1',
        latitude: 0,
        longitude: 0,
        posts: [
          { id: 'post-far', name: 'Far', latitude: 1, longitude: 1 },
          { id: 'post-near', name: 'Near', latitude: 0, longitude: 0.0005 },
        ],
      },
      0,
      0,
      calculateDistance,
    );

    expect(result).not.toBeNull();
    expect(result!.target.id).toBe('post-near');
  });

  test('ignores inactive and deleted posts', () => {
    const result = getNearestActivePunchTarget(
      {
        id: 'site-1',
        name: 'Site 1',
        latitude: null,
        longitude: null,
        posts: [
          { id: 'post-inactive', name: 'Inactive', latitude: 0, longitude: 0.001, status: false, deletedAt: null },
          { id: 'post-deleted', name: 'Deleted', latitude: 0, longitude: 0.001, status: true, deletedAt: new Date() },
        ],
      },
      0,
      0,
      calculateDistance,
    );

    expect(result).toBeNull();
  });

  test('returns null when no posts and no site coordinates', () => {
    const result = getNearestActivePunchTarget(
      {
        id: 'site-1',
        name: 'Site 1',
        latitude: null,
        longitude: null,
        posts: [],
      },
      0,
      0,
      calculateDistance,
    );

    expect(result).toBeNull();
  });
});

