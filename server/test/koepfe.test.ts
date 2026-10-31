/** Sicherheits-Header (#239). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { einbettenAus, sicherheitsKoepfe } from '../src/koepfe';

describe('Sicherheits-Header (#239)', () => {
  const ohne = einbettenAus(undefined);
  it('schützt die Oberfläche mit CSP und gegen Einbetten', () => {
    const k = sicherheitsKoepfe({ pfad: '/ablage', https: false, html: true, csp: false }, ohne);
    assert.equal(k['x-frame-options'], 'SAMEORIGIN');
    assert.equal(k['x-content-type-options'], 'nosniff');
    assert.equal(k['referrer-policy'], 'same-origin');
    assert.match(k['content-security-policy'], /script-src 'self'/);
    assert.match(k['content-security-policy'], /frame-ancestors 'self'$/);
    assert.equal(k['strict-transport-security'], undefined, 'ohne HTTPS kein HSTS');
  });
  it('HSTS bei HTTPS, Hilfe ohne strenge CSP, vorhandene CSP bleibt', () => {
    assert.equal(sicherheitsKoepfe({ pfad: '/', https: true, html: true, csp: false }, ohne)['strict-transport-security'], 'max-age=31536000');
    assert.equal(sicherheitsKoepfe({ pfad: '/hilfe/admin/', https: false, html: true, csp: false }, ohne)['content-security-policy'], "frame-ancestors 'self'");
    assert.equal(sicherheitsKoepfe({ pfad: '/api/dokumente/x', https: false, html: false, csp: true }, ohne)['content-security-policy'], undefined);
  });
  it('erlaubt Einbetten nur für genannte Ursprünge', () => {
    const e = einbettenAus('https://ha.example.org, http://nas:8123/ quatsch');
    assert.deepEqual(e.urspruenge, ['https://ha.example.org', 'http://nas:8123']);
    assert.match(e.fehler ?? '', /quatsch/);
    const k = sicherheitsKoepfe({ pfad: '/', https: false, html: true, csp: false }, e);
    assert.equal(k['x-frame-options'], undefined);
    assert.match(k['content-security-policy'], /frame-ancestors 'self' https:\/\/ha\.example\.org http:\/\/nas:8123/);
  });
});
