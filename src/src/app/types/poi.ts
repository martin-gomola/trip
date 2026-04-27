export interface Category {
  id: number;
  name: string;
  image_id: number;
  image: string;
  color?: string;
  icon?: string;
}

export interface Place {
  id: number;
  name: string;
  lat: number;
  lng: number;
  place: string;
  category: Category;
  category_id?: number;

  user?: string;
  gpx?: string;
  image?: string;
  image_id?: number;
  price?: number;
  price_currency?: string;
  description?: string;
  url?: string;
  duration?: number;
  checkin_time?: string;
  checkout_time?: string;
  allowdog?: boolean;
  visited?: boolean;
  favorite?: boolean;
  restroom?: boolean;
}

export interface ProviderBoundaries {
  northeast: { lat: number; lng: number };
  southwest: { lat: number; lng: number };
}
