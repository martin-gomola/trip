export interface NavigationCoordinate {
  lat: number;
  lng: number;
}

function coordinateParam(coordinate: NavigationCoordinate): string {
  return `${coordinate.lat},${coordinate.lng}`;
}

export function googleMapsNavigationUrl(coordinates: NavigationCoordinate[]): string {
  if (!coordinates.length) return 'https://www.google.com/maps';

  const params = new URLSearchParams({ api: '1' });
  if (coordinates.length === 1) {
    params.set('destination', coordinateParam(coordinates[0]));
  } else {
    params.set('origin', coordinateParam(coordinates[0]));
    params.set('destination', coordinateParam(coordinates[coordinates.length - 1]));
    const waypoints = coordinates.slice(1, -1).map(coordinateParam);
    if (waypoints.length) params.set('waypoints', waypoints.join('|'));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function openGoogleMapsNavigation(coordinates: NavigationCoordinate[]) {
  if (!coordinates.length) return;
  window.open(googleMapsNavigationUrl(coordinates), '_blank', 'noopener,noreferrer');
}
