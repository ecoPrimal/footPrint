import wordlist from '../data/bip39-en.json';

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/** Encode geohash from lat/lng at given precision (number of chars). */
export function encodeGeohash(lat: number, lng: number, precision: number): string {
  let minLat = -90;
  let maxLat = 90;
  let minLng = -180;
  let maxLng = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let even = true;

  while (hash.length < precision) {
    if (even) {
      const mid = (minLng + maxLng) / 2;
      if (lng >= mid) {
        ch = (ch << 1) | 1;
        minLng = mid;
      } else {
        ch <<= 1;
        maxLng = mid;
      }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat >= mid) {
        ch = (ch << 1) | 1;
        minLat = mid;
      } else {
        ch <<= 1;
        maxLat = mid;
      }
    }
    even = !even;
    bit++;
    if (bit === 5) {
      hash += BASE32.charAt(ch);
      bit = 0;
      ch = 0;
    }
  }

  return hash;
}

/** Decode geohash to { lat, lng, latError, lngError }. */
export function decodeGeohash(hash: string): { lat: number; lng: number; latError: number; lngError: number } {
  let minLat = -90;
  let maxLat = 90;
  let minLng = -180;
  let maxLng = 180;
  let even = true;

  for (const c of hash) {
    const cd = BASE32.indexOf(c);
    if (cd === -1) throw new Error(`Invalid geohash character: ${c}`);

    for (let mask = 16; mask >= 1; mask >>= 1) {
      if (even) {
        const mid = (minLng + maxLng) / 2;
        if (cd & mask) minLng = mid;
        else maxLng = mid;
      } else {
        const mid = (minLat + maxLat) / 2;
        if (cd & mask) minLat = mid;
        else maxLat = mid;
      }
      even = !even;
    }
  }

  const lat = (minLat + maxLat) / 2;
  const lng = (minLng + maxLng) / 2;
  const latError = (maxLat - minLat) / 2;
  const lngError = (maxLng - minLng) / 2;

  return { lat, lng, latError, lngError };
}

/** Decode geohash to bounding box. */
export function geohashBounds(hash: string): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  let minLat = -90;
  let maxLat = 90;
  let minLng = -180;
  let maxLng = 180;
  let even = true;

  for (const c of hash) {
    const cd = BASE32.indexOf(c);
    if (cd === -1) throw new Error(`Invalid geohash character: ${c}`);

    for (let mask = 16; mask >= 1; mask >>= 1) {
      if (even) {
        const mid = (minLng + maxLng) / 2;
        if (cd & mask) minLng = mid;
        else maxLng = mid;
      } else {
        const mid = (minLat + maxLat) / 2;
        if (cd & mask) minLat = mid;
        else maxLat = mid;
      }
      even = !even;
    }
  }

  return { minLat, maxLat, minLng, maxLng };
}

/** Encode coordinates to SayWhere phrase. Precision: 1-6 words. */
export function encode(lat: number, lng: number, precision = 3): string {
  if (precision < 1 || precision > 6) {
    throw new Error('Precision must be between 1 and 6 words');
  }

  const geohash = encodeGeohash(lat, lng, precision * 2);
  const words: string[] = [];

  for (let i = 0; i < geohash.length; i += 2) {
    const char1 = geohash.charAt(i);
    const char2 = geohash.charAt(i + 1);
    const char1Idx = BASE32.indexOf(char1);
    const char2Idx = BASE32.indexOf(char2);
    if (char1Idx === -1 || char2Idx === -1) {
      throw new Error('Invalid geohash character');
    }

    const chunkValue = char1Idx * 32 + char2Idx;
    const parity = popcount(chunkValue) % 2;
    const wordIndex = (chunkValue << 1) | parity;
    const word = wordlist[wordIndex];
    if (word === undefined) {
      throw new Error(`Invalid word index: ${wordIndex}`);
    }
    words.push(word);
  }

  return words.join('.');
}

/** Decode SayWhere phrase to coordinates and bounds. */
export function decode(phrase: string): {
  lat: number;
  lng: number;
  latError: number;
  lngError: number;
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  precision: number;
  geohash: string;
} {
  const words = phrase.split('.');
  const chunks: string[] = [];

  for (const word of words) {
    const wordIndex = wordlist.indexOf(word);
    if (wordIndex === -1) {
      throw new Error(`Unknown word: ${word}`);
    }
    if ((wordIndex & 1) !== popcount(wordIndex >>> 1) % 2) {
      throw new Error(`Parity mismatch for word: ${word}`);
    }

    const chunkValue = wordIndex >>> 1;
    const char1 = BASE32.charAt(Math.floor(chunkValue / 32));
    const char2 = BASE32.charAt(chunkValue % 32);
    chunks.push(char1 + char2);
  }

  const geohash = chunks.join('');
  const decoded = decodeGeohash(geohash);
  const bounds = geohashBounds(geohash);

  return {
    ...decoded,
    bounds,
    precision: words.length,
    geohash,
  };
}

/** Get cell bounding box for a SayWhere phrase. */
export function cellBounds(phrase: string): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const { geohash } = decode(phrase);
  return geohashBounds(geohash);
}

/** Popcount (number of set bits). */
function popcount(n: number): number {
  let count = 0;
  let v = n;
  while (v) {
    count += v & 1;
    v >>>= 1;
  }
  return count;
}
