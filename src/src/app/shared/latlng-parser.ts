import OpenLocationCode from 'open-location-code-typescript';

// Long Google Maps URL patterns. Coordinates are present in the URL itself,
// so we can extract them client-side without a network call. Short share
// links (maps.app.goo.gl/<id>) require redirect resolution which is handled
// by the backend `/api/geo/resolve-link` endpoint instead.
const patternMapsAt = /[?&/]@?(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/;
const patternMapsBang = /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/;
const patternMapsQuery = /[?&](?:q|ll|center|destination)=(-?\d{1,3}\.\d+)(?:%2C|,)(-?\d{1,3}\.\d+)/i;

const patternDEC = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
const patternDD = /^\s*(\d{1,3}(?:\.\d+)?)°?\s*([NS])\s*,\s*(\d{1,3}(?:\.\d+)?)°?\s*([EW])\s*$/i;
const patternDMS =
  /^\s*(\d{1,3})°\s*(\d{1,2})['′]\s*(\d{1,2}(?:\.\d+)?)["″]?\s*([NS])\s*,\s*(\d{1,3})°\s*(\d{1,2})['′]\s*(\d{1,2}(?:\.\d+)?)["″]?\s*([EW])\s*$/i;
const patternDMM =
  /^\s*(\d{1,3})°\s*(\d{1,2}(?:\.\d+)?)['′]?\s*([NS])\s*,\s*(\d{1,3})°\s*(\d{1,2}(?:\.\d+)?)['′]?\s*([EW])\s*$/i;

function _dmsToDecimal(deg: number, min: number, sec: number, dir: string): number {
  const dec = deg + min / 60 + sec / 3600;
  return /[SW]/i.test(dir) ? -dec : dec;
}

function _dmmToDecimal(deg: number, min: number, dir: string): number {
  const dec = deg + min / 60;
  return /[SW]/i.test(dir) ? -dec : dec;
}

export function formatLatLng(num: number): string {
  const decimals = num.toString().split('.')[1]?.length || 0;
  return num.toFixed(Math.min(decimals, 5));
}

/** Returns true when the string looks like a URL (any scheme). */
export function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/** Returns true when the URL is a Google Maps short share link that requires
 *  server-side redirect resolution. */
export function isGoogleMapsShortLink(value: string): boolean {
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(value.trim());
}

function _validCoord(lat: number, lng: number): boolean {
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** Try to extract coordinates from a long Google Maps URL without any
 *  network call. Returns undefined for short links or non-Maps URLs. */
function _parseGoogleMapsUrl(value: string): [number, number] | undefined {
  const query = value.match(patternMapsQuery);
  if (query) {
    const lat = parseFloat(query[1]);
    const lng = parseFloat(query[2]);
    if (_validCoord(lat, lng)) return [lat, lng];
  }

  const at = value.match(patternMapsAt);
  if (at) {
    const lat = parseFloat(at[1]);
    const lng = parseFloat(at[2]);
    if (_validCoord(lat, lng)) return [lat, lng];
  }

  const bang = value.match(patternMapsBang);
  if (bang) {
    const lat = parseFloat(bang[1]);
    const lng = parseFloat(bang[2]);
    if (_validCoord(lat, lng)) return [lat, lng];
  }

  return undefined;
}

export function checkAndParseLatLng(value: string | number): [number, number] | undefined {
  if (typeof value !== 'string') return undefined;

  // Parse PlusCode
  if (OpenLocationCode.isValid(value)) {
    const result = OpenLocationCode.decode(value);
    return [result.latitudeCenter, result.longitudeCenter];
  }

  // Parse long Google Maps URL (short links return undefined and must be
  // resolved server-side).
  if (looksLikeUrl(value)) {
    return _parseGoogleMapsUrl(value);
  }

  // Parse DMS, DD, DDM to decimal [Lat, Lng]
  const dec = value.match(patternDEC);
  if (dec) {
    const lat = parseFloat(dec[1]);
    const lng = parseFloat(dec[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return [lat, lng];
    }
  }

  const dd = value.match(patternDD);
  if (dd) {
    let lat = parseFloat(dd[1]);
    let lng = parseFloat(dd[3]);
    lat *= /S/i.test(dd[2]) ? -1 : 1;
    lng *= /W/i.test(dd[4]) ? -1 : 1;
    return [lat, lng];
  }

  const dms = value.match(patternDMS);
  if (dms) {
    const lat = _dmsToDecimal(+dms[1], +dms[2], +dms[3], dms[4]);
    const lng = _dmsToDecimal(+dms[5], +dms[6], +dms[7], dms[8]);
    return [lat, lng];
  }

  const dmm = value.match(patternDMM);
  if (dmm) {
    const lat = _dmmToDecimal(+dmm[1], +dmm[2], dmm[3]);
    const lng = _dmmToDecimal(+dmm[4], +dmm[5], dmm[6]);
    return [lat, lng];
  }

  return undefined;
}
