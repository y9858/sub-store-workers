/**
 * L4 Atom
 *
 * Ensure GeoIP MMDB readers are loaded (once per isolate).
 * Data source: runtime MMDB gateway (Country.mmdb / Country-asn.mmdb)
 */

import { Buffer } from 'node:buffer';
import * as mmdb from 'mmdb-lib';
import { debug, warn, error as logError } from '../../../utils/logger.js';

function getGlobalCache() {
    if (!globalThis.__surge_geoip_cache__) {
        globalThis.__surge_geoip_cache__ = {
            readyPromise: null,
            countryReader: null,
            asnReader: null,
            loggedMissing: false,
        };
    }
    return globalThis.__surge_geoip_cache__;
}

function toBufferFromArrayBuffer(ab) {
    return Buffer.from(ab);
}

export async function ensureGeoDbLoaded(env, { requestId = 'unknown' } = {}) {
    const cache = getGlobalCache();
    if (cache.countryReader && cache.asnReader) return cache;
    if (cache.readyPromise) {
        await cache.readyPromise;
        return cache;
    }

    cache.readyPromise = (async () => {
        try {
            const mmdbGateway = env?.__mmdbGateway;
            debug(`[GeoIP] [${requestId}] loading mmdb from runtime gateway ...`);

            if (!mmdbGateway) {
                warn('[GeoIP] runtime mmdb gateway not available; $utils.geoip/ipasn/ipaso will return undefined');
                return;
            }

            const [countryFile, asnFile] = await Promise.all(
                [
                    mmdbGateway.getMmdbFile('Country.mmdb'),
                    mmdbGateway.getMmdbFile('Country-asn.mmdb'),
                ],
            );

            debug(
                `[GeoIP] [${requestId}] gateway get Country.mmdb: ok=${!!countryFile?.ok} status=${countryFile?.status ?? 'n/a'} size=${countryFile?.arrayBuffer?.byteLength ?? 0}`,
            );
            debug(
                `[GeoIP] [${requestId}] gateway get Country-asn.mmdb: ok=${!!asnFile?.ok} status=${asnFile?.status ?? 'n/a'} size=${asnFile?.arrayBuffer?.byteLength ?? 0}`,
            );

            const countryBuffer = countryFile?.arrayBuffer || countryFile?.data?.buffer?.slice?.(0) || countryFile?.data;
            const asnBuffer = asnFile?.arrayBuffer || asnFile?.data?.buffer?.slice?.(0) || asnFile?.data;

            if (!countryBuffer || !asnBuffer) {
                if (!cache.loggedMissing) {
                    cache.loggedMissing = true;
                    warn('[GeoIP] mmdb not found in runtime storage; $utils.geoip/ipasn/ipaso will return undefined');
                }
                return;
            }

            const countryBuf = Buffer.from(countryBuffer instanceof Uint8Array ? countryBuffer : toBufferFromArrayBuffer(countryBuffer));
            const asnBuf = Buffer.from(asnBuffer instanceof Uint8Array ? asnBuffer : toBufferFromArrayBuffer(asnBuffer));

            cache.countryReader = new mmdb.Reader(countryBuf);
            cache.asnReader = new mmdb.Reader(asnBuf);

            debug(`[GeoIP] [${requestId}] mmdb readers initialized`);
        } catch (e) {
            if (!cache.loggedMissing) {
                cache.loggedMissing = true;
                logError('[GeoIP] failed to load MMDB from runtime storage:', e?.stack || e?.message || e);
                logError('[GeoIP] expected mmdb in storage: Country.mmdb, Country-asn.mmdb');
            }
        }
    })();

    await cache.readyPromise;
    return cache;
}
