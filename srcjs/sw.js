import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// Custom caching strategy for tiles
registerRoute(
    // Match tile URLs
    ({url}) => url.pathname.includes('ImageServer'),
    new CacheFirst({
        cacheName: 'tile-cache',
        plugins: [
            new ExpirationPlugin({
                maxEntries: 1000, // Maximum number of tiles to cache
                maxAgeSeconds: 7 * 24 * 60 * 60 // Cache for 1 week
            }),
            new CacheableResponsePlugin({
                statuses: [0, 200] // Cache successful responses
            })
        ]
    })
);

// Handle precaching
precacheAndRoute([]);