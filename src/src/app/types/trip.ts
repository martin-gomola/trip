import { Place } from './poi';

export interface TripBase {
  id: number;
  name: string;
  image?: string;
  archived?: boolean;
  user: string;
  days: number;
  collaborators: TripMember[];
  currency: string;
  home_name?: string;
  home_lat?: number;
  home_lng?: number;
}

export interface TripBaseWithDates extends TripBase {
  daterange?: Date[];
}

export interface Trip {
  id: number;
  name: string;
  image?: string;
  archived?: boolean;
  user: string;
  days: TripDay[];
  collaborators: TripMember[];
  currency: string;
  home_name?: string;
  home_lat?: number;
  home_lng?: number;
  notes?: string;
  archival_review?: string;
  attachments?: TripAttachment[];

  // POST / PUT
  places: Place[];
  place_ids: number[];
  shared?: boolean;
}

export interface TripAttachment {
  id: number;
  filename: string;
  file_size: number;
  uploaded_by: string;
}

export interface TripDay {
  id: number;
  dt?: string;
  label: string;
  items: TripItem[];
  notes?: string;
  day_start_time?: string;
}

export interface TripItem {
  id: number;
  /**
   * Activities: target arrival pin (HH:MM, required at form level).
   * Stays: optional check-in override (null = use place.checkin_time).
   */
  time: string | null;
  text: string;
  comment?: string;
  place?: Place;
  lat?: number;
  lng?: number;
  price?: number;
  price_currency?: string;
  day_id: number;
  status?: string | TripStatus;
  image?: string;
  image_id?: number;
  gpx?: string;
  paid_by?: string;
  attachments?: TripAttachment[];
  stay_checkout_day_id?: number | null;
  stay_checkout_time?: string | null;
  duration_minutes?: number | null;
}

export interface TripStatus {
  label: string;
  color: string;
}

export interface FlattenedTripItem {
  td_id: number;
  td_label: string;
  td_date?: string;
  id: number;
  time: string;
  text: string;
  comment?: string;
  place?: Place;
  price?: number;
  price_currency?: string;
  lat?: number;
  lng?: number;
  day_id: number;
  status?: TripStatus;
  distance?: number;
  image?: string;
  image_id?: number;
  gpx?: string;
  paid_by?: string;
  attachments?: TripAttachment[];
  stay_checkout_day_id?: number | null;
  stay_checkout_time?: string | null;
  duration_minutes?: number | null;
}

export interface TripMember {
  user: string;
  invited_by: string;
  invited_at: string;
  joined_at?: string;

  balance?: Record<string, number>; // Injected
}

export interface TripInvitation extends TripBase {
  invited_by: string;
  invited_at: string;
}

export interface SharedTripDetails {
  url: string;
  is_full_access?: boolean;
}

export interface PackingItem {
  id: number;
  text: string;
  category: string;
  qt?: number;
  packed?: boolean;
}

export interface ChecklistItem {
  id: number;
  text: string;
  checked?: boolean;
}

export type PrintMapProvider = 'mapy' | 'google';

export interface PrintOptions {
  days: Set<number>;
  props: Set<string>;
  places: boolean;
  notes: boolean;
  metadata: boolean;
  mapProvider: PrintMapProvider;
}

export interface ViewTripItem extends TripItem {
  status?: TripStatus;
  distance?: number;
  eta?: string;
  travelDuration?: string;
  isHome?: boolean;
  isVirtualStay?: boolean;
  isVirtualCheckout?: boolean;
  sourceItemId?: number;
  checkinTime?: string;
  checkoutTime?: string;
  earlyArrivalMinutes?: number;
  /**
   * Difference between computed ETA and the user-pinned `time`.
   * Positive = arriving later than planned, negative = earlier than planned.
   * undefined when no ETA was computed or no `time` is pinned.
   */
  etaDeltaMinutes?: number;
  /**
   * For accommodation arrivals: free-window minutes between physical
   * arrival and effective check-in (effective = item.time override
   * else place.checkin_time). Positive = arrived early, room not yet
   * ready. Negative = arrived after check-in. undefined when ETA or
   * effective check-in cannot be determined.
   */
  freeWindowMinutes?: number;
  /**
   * Effective check-in time string (HH:MM) used by the stay row to
   * narrate the appointment, distinct from the computed arrival ETA.
   */
  effectiveCheckinTime?: string;
}

export interface DayViewModel {
  day: TripDay;
  items: ViewTripItem[];
  stats: {
    count: number;
    cost: number;
    costSummary?: string;
    hasPlaces: boolean;
  };
}

export interface HighlightData {
  paths: { coords: [number, number][]; options: any }[];
  markers: any[];
  gpxData: string[];
  bounds: [number, number][];
  activePlaceIds?: Set<number>;
}

export interface TripRetimingChange {
  item: ViewTripItem;
  oldTime: string;
  newTime: string;
  travelDuration: string;
  distance?: number;
}
