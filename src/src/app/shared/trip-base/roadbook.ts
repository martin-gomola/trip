import { DayViewModel, Trip, ViewTripItem } from '../../types/trip';
import { Place } from '../../types/poi';
import { computeDistLatLng } from '../utils';

const DANGER_THREE = ['brod', 'koniec cesty', 'extrem', 'extrém', 'zosuv', 'lavina'];
const DANGER_TWO = ['strmé', 'strma', 'štrk', 'strk', 'nebezpečné', 'nebezpecne', 'serpentíny', 'serpentiny', 'rozbit', 'úzka', 'uzka', 'diery'];
const OFFROAD = ['offroad', 'off-road', 'nespevnen', 'poľná', 'polna', 'lesná cesta', 'lesna cesta'];
const FUEL = ['fuel', 'benzín', 'benzin', 'čerpacia', 'cerpacia', 'pumpa', 'omv', 'shell', 'slovnaft'];
const FOOD = ['food', 'drink', 'restaurant', 'reštaur', 'restaur', 'bistro', 'kaviareň', 'kaviaren', 'café', 'cafe', 'jedlo', 'obed', 'večera', 'vecera'];
const PHOTO = ['photo', 'foto', 'vyhliadka', 'viewpoint', 'hrad', 'kostol', 'panoráma', 'panorama'];
const PARKING = ['parking', 'parkovisko', 'parkovanie', '🅿'];

export interface RoadbookLegendGroup {
  label: string;
  items: { symbol: string; description: string }[];
}

export interface RoadbookRow {
  key: string;
  totalKm: string;
  partialKm: string;
  symbol: string;
  title: string;
  details: string;
  time?: string;
  warning?: boolean;
}

type CoordinateSource = {
  lat?: number | null;
  lng?: number | null;
  place?: Place | null;
  isVirtualStay?: boolean;
};

export const ROADBOOK_LEGEND_GROUPS: RoadbookLegendGroup[] = [
  {
    label: 'Kotvy trasy',
    items: [
      { symbol: 'START', description: 'Štart dňa, vynuluj tripmaster' },
      { symbol: 'STOP', description: 'Plánovaná zastávka / bod programu' },
      { symbol: 'IN / OUT', description: 'Check-in / checkout ubytovania' },
      { symbol: 'DOMOV', description: 'Domov alebo základňa výletu' },
    ],
  },
  {
    label: 'Bezpečnosť a terén',
    items: [
      { symbol: '!', description: 'Nebezpečenstvo 1, spomaliť' },
      { symbol: '!!', description: 'Nebezpečenstvo 2, ostrý alebo rozbitý úsek' },
      { symbol: '!!!', description: 'Nebezpečenstvo 3, extrémne riziko' },
      { symbol: 'OFF', description: 'Začiatok nespevnenej cesty / off-road' },
    ],
  },
  {
    label: 'Služby a POI',
    items: [
      { symbol: '⛽', description: 'Čerpacia stanica' },
      { symbol: '🍴', description: 'Reštaurácia / občerstvenie' },
      { symbol: '📷', description: 'Foto-point / vyhliadka' },
      { symbol: '🅿', description: 'Parkovisko / bezpečné státie' },
      { symbol: '🏨', description: 'Ubytovanie / pobyt' },
    ],
  },
];

export function roadbookRowsForDay(group: DayViewModel): RoadbookRow[] {
  const rows: RoadbookRow[] = [];
  let totalKm = 0;
  let prevCoords: { lat: number; lng: number } | null = null;

  group.items.forEach((item, index) => {
    const coords = itemCoordinate(item);
    const legKm = index === 0 ? 0 : legDistanceKm(item, prevCoords, coords);
    const cap = prevCoords && coords ? bearingDegrees(prevCoords, coords) : undefined;

    totalKm += legKm;
    rows.push(itemToRoadbookRow(item, index, group.items.length, totalKm, legKm, cap));
    if (coords) prevCoords = coords;
  });

  return rows;
}

export function roadbookDayTotalKm(group: DayViewModel): string {
  const rows = roadbookRowsForDay(group);
  return rows.length ? rows[rows.length - 1].totalKm : '0.0';
}

export function roadbookEmergencyMapsUrl(trip: Trip | null): string {
  const firstCoordinate = trip?.days.flatMap((day) => day.items).map(itemCoordinate).find(Boolean);
  if (!firstCoordinate) return 'https://www.google.com/maps';
  return `https://www.google.com/maps/search/?api=1&query=${firstCoordinate.lat},${firstCoordinate.lng}`;
}

function itemToRoadbookRow(
  item: ViewTripItem,
  index: number,
  itemCount: number,
  totalKm: number,
  partialKm: number,
  cap?: number,
): RoadbookRow {
  const symbol = itemSymbol(item, index, itemCount);
  const details = itemDetails(item, cap);
  return {
    key: `${item.id}-${index}`,
    totalKm: formatKm(totalKm),
    partialKm: formatKm(index === 0 ? 0 : partialKm),
    symbol,
    title: itemTitle(item, index, itemCount, cap),
    details,
    time: item.time,
    warning: symbol.includes('!') || symbol === 'OFF',
  };
}

function itemTitle(item: ViewTripItem, index: number, itemCount: number, cap?: number): string {
  if (index === 0) return item.isHome ? 'Štart: domov' : `Štart: ${primaryName(item)}`;
  if (item.isVirtualStay) return `Pobyt: ${primaryName(item)}`;
  if (item.isVirtualCheckout) return `Checkout: ${primaryName(item)}`;
  if (item.isHome) return 'Domov';
  if (isAccommodation(item)) return `Check-in: ${primaryName(item)}`;
  if (index === itemCount - 1) return `Cieľ dňa: ${primaryName(item)}`;
  return primaryName(item);
}

function itemDetails(item: ViewTripItem, cap?: number): string {
  const chunks: string[] = [];
  const source = combinedText(item);

  if (item.isVirtualStay) return 'Bez presunu. Ubytovanie slúži ako denná základňa.';
  if (indexSafeTime(item)) chunks.push(indexSafeTime(item));
  if (item.travelDuration) chunks.push(`presun ${item.travelDuration}`);
  if (item.eta) chunks.push(`ETA ${item.eta}`);
  if (cap !== undefined) chunks.push(`orientačný CAP ${cap}`);
  if (item.earlyArrivalMinutes) chunks.push(`príchod pred check-in o ${formatMinutes(item.earlyArrivalMinutes)}`);
  if (source && containsAny(source, DANGER_THREE)) chunks.push('!!! Extrémne riziko, over prejazdnosť.');
  else if (source && containsAny(source, DANGER_TWO)) chunks.push('!! Spomaľ, rizikový úsek.');
  if (source && containsAny(source, OFFROAD)) chunks.push('OFF / nespevnený úsek.');

  const technicalComment = technicalText(item.comment);
  if (technicalComment) chunks.push(technicalComment);

  if (!chunks.length && item.place?.place) chunks.push(item.place.place);
  return chunks.join(' · ');
}

function itemSymbol(item: ViewTripItem, index: number, itemCount: number): string {
  if (index === 0) return 'START';

  const source = combinedText(item);
  if (containsAny(source, DANGER_THREE)) return '!!!';
  if (containsAny(source, DANGER_TWO)) return '!!';
  if (containsAny(source, OFFROAD)) return 'OFF';
  if (item.isHome) return 'DOMOV';
  if (item.isVirtualCheckout) return 'OUT';
  if (item.isVirtualStay) return '🏨';
  if (isAccommodation(item)) return 'IN';
  if (containsAny(source, FUEL)) return '⛽';
  if (containsAny(source, FOOD)) return '🍴';
  if (containsAny(source, PHOTO)) return '📷';
  if (containsAny(source, PARKING)) return '🅿';
  if (index === itemCount - 1) return 'CIEĽ';
  return 'STOP';
}

function itemCoordinate(item: CoordinateSource): { lat: number; lng: number } | null {
  if (item.isVirtualStay) return null;
  const lat = item.lat ?? item.place?.lat;
  const lng = item.lng ?? item.place?.lng;
  if (lat == null || lng == null) return null;
  return { lat, lng };
}

function legDistanceKm(
  item: ViewTripItem,
  prevCoords: { lat: number; lng: number } | null,
  coords: { lat: number; lng: number } | null,
): number {
  if (item.distance != null) return item.distance;
  if (!prevCoords || !coords) return 0;
  return computeDistLatLng(prevCoords.lat, prevCoords.lng, coords.lat, coords.lng);
}

function bearingDegrees(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const toDeg = (value: number) => (value * 180) / Math.PI;
  const fromLat = toRad(from.lat);
  const toLat = toRad(to.lat);
  const deltaLng = toRad(to.lng - from.lng);
  const y = Math.sin(deltaLng) * Math.cos(toLat);
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLng);
  return Math.round((toDeg(Math.atan2(y, x)) + 360) % 360);
}

function capText(cap?: number): string {
  return cap === undefined ? '' : `Smer CAP ${cap}.`;
}

function primaryName(item: ViewTripItem): string {
  return item.place?.name || item.text.replace(/^Check out ·\s*/, '').replace(/^Staying at\s*/, '') || 'Bod';
}

function isAccommodation(item: ViewTripItem): boolean {
  return item.place?.category?.name?.toLowerCase() === 'accommodation';
}

function indexSafeTime(item: ViewTripItem): string {
  if (item.isVirtualStay) return '';
  if (item.isVirtualCheckout) return `odchod ${item.time}`;
  if (isAccommodation(item)) return `check-in ${item.time}`;
  return item.time ? `čas ${item.time}` : '';
}

function combinedText(item: Partial<ViewTripItem>): string {
  const place = item.place as Place | undefined;
  return [item.text, item.comment, place?.name, place?.category?.name, place?.place, place?.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function containsAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function technicalText(value?: string | null): string {
  if (!value) return '';
  const text = value
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\bSource:\s*/gi, '')
    .replace(/\bListing notes:\s*/gi, '')
    .replace(/\b(uvidíte|uvidime|krásny|krasny|nádherný|nadherny|malebný|malebny)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || text.length > 140) return '';
  return text;
}

function formatKm(value: number): string {
  return value.toFixed(1);
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours} h ${remaining} min` : `${hours} h`;
}
