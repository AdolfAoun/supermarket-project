import { lookup as dnsLookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIPv4 } from 'node:net';
import { HttpError } from '../../middleware/errors.js';
import { mapsUrl, parseGoogleMaps, type JourneyImport } from './google-maps.js';

const blocked = new BlockList();
for (const [network, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16],
  ['192.88.99.0', 24], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]] as const) blocked.addSubnet(network, prefix, 'ipv4');
export const publicAddress = (address: string) => isIPv4(address) && !blocked.check(address, 'ipv4');
export interface ResolverIO {
  lookup(host: string): Promise<{ address: string; family: number }[]>;
  headers(url: URL, address: string, signal: AbortSignal): Promise<{ status: number; location?: string }>;
}
export const resolverIO: ResolverIO = {
  lookup: host => dnsLookup(host, { all: true, family: 4 }),
  headers: (url, address, signal) => new Promise((resolve, reject) => {
    // Pin the validated IPv4 to the socket while retaining the original Host/SNI
    // and normal TLS certificate checks. No proxy, cookie jar or pooled socket.
    const req = request(url, { method: 'GET', agent: false, signal, maxHeaderSize: 16_384, family: 4,
      lookup: (_host, _options, callback) => callback(null, address, 4),
      headers: { 'User-Agent': 'LebanonSupermarketCapstone/1.0', Accept: 'text/html' } }, response => {
      resolve({ status: response.statusCode ?? 0, location: response.headers.location });
      // Headers only: do not buffer or scrape any HTML response body.
      response.destroy();
    });
    req.on('error', reject); req.end();
  }),
};
export function createGoogleMapsImporter(io: ResolverIO = resolverIO, timeoutMs = 5000) {
  return async (value: unknown): Promise<JourneyImport> => {
    let url = mapsUrl(value);
    // Expanded links need no network access.
    if (url.hostname !== 'maps.app.goo.gl') return parseGoogleMaps(url);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new HttpError(422, 'Google Maps link resolution timed out. Try an expanded link.')); }, timeoutMs);
    });
    const work = async () => {
      const seen = new Set<string>();
      for (let hop = 0; hop <= 4; hop++) {
        if (controller.signal.aborted) throw new Error('Cancelled');
        if (seen.has(url.href)) throw new HttpError(422, 'Google Maps redirect loop');
        seen.add(url.href);
        if (url.hostname !== 'maps.app.goo.gl') {
          try { return parseGoogleMaps(url); } catch (error) {
            if (!(error instanceof HttpError) || error.status !== 422) throw error;
          }
        }
        const addresses = await io.lookup(url.hostname);
        if (controller.signal.aborted) throw new Error('Cancelled');
        if (!addresses.length || addresses.some(a => a.family !== 4 || !publicAddress(a.address))) throw new HttpError(422, 'Unsafe Google Maps network target');
        const response = await io.headers(url, addresses[0].address, controller.signal);
        if (![301, 302, 303, 307, 308].includes(response.status) || !response.location) throw new HttpError(422, 'Google Maps did not provide a supported redirect. Paste an expanded link.');
        if (response.location.length > 8192) throw new HttpError(422, 'Google Maps redirect is too large');
        url = mapsUrl(new URL(response.location, url).href);
      }
      throw new HttpError(422, 'Too many Google Maps redirects');
    };
    try { return await Promise.race([work(), deadline]); }
    catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(422, 'Google Maps link could not be resolved. Try an expanded link.');
    } finally { clearTimeout(timer!); controller.abort(); }
  };
}
