import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const externalServices = require('../src/lib/external-services.json');

function getCspConnectSources(nginxConfig) {
    const csp = nginxConfig.match(/Content-Security-Policy "([^"]+)"/)?.[1] || '';
    const connectSrc = csp.match(/connect-src ([^;]+);/)?.[1] || '';
    return connectSrc.split(/\s+/).filter(Boolean);
}

describe('external service configuration', () => {
    it('keeps browser CORS proxy prefixes paired with CSP origins', () => {
        const proxyOrigins = externalServices.corsProxyPrefixes.map(prefix => new URL(prefix).origin);

        expect(proxyOrigins).toEqual(externalServices.corsProxyOrigins);
    });

    it('allows every configured public frontend and CORS proxy in nginx connect-src', () => {
        const nginxConfig = readFileSync('nginx.conf', 'utf8');
        const connectSources = getCspConnectSources(nginxConfig);
        const configuredOrigins = [
            ...externalServices.corsProxyOrigins,
            ...externalServices.pipedInstances,
            ...externalServices.invidiousInstances,
        ];

        configuredOrigins.forEach(origin => {
            expect(connectSources).toContain(origin);
        });
    });
});
