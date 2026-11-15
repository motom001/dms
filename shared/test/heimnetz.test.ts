import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { HEIMNETZ_ENDUNGEN, HEIMNETZ_ENDUNGEN_HINWEIS, heimnetzName, imHeimnetz, rechnername } from '../../shared/src/heimnetz';

describe('Heimnetz-Erkennung an einer Stelle (#595)', () => {
  it('home.arpa (RFC 8375) gehört zu den Endungen, die Hinweis-Liste enthält die strenge', () => {
    assert.deepEqual([...HEIMNETZ_ENDUNGEN], ['local', 'lan', 'internal', 'home.arpa']);
    for (const e of HEIMNETZ_ENDUNGEN) assert.ok(HEIMNETZ_ENDUNGEN_HINWEIS.includes(e), e);
  });

  it('Ausnahme (http ohne TLS): nur echte Heimnetz-Adressen', () => {
    for (const a of ['http://localhost:8080', 'http://127.0.0.1', 'http://10.1.2.3', 'http://172.16.0.1', 'http://172.31.255.1', 'http://192.168.1.5',
      'http://[::1]:3000', 'http://[fd00::1]', 'http://[fe80::1]', 'http://keycloak', 'http://nas.local', 'http://auth.lan', 'http://sso.internal',
      'http://auth.home.arpa', 'http://AUTH.Home.Arpa:9000', 'http://login.wohnung.home.arpa'])
      assert.equal(imHeimnetz(a), true, a);
    for (const a of ['http://home.arpa.example.org', 'http://auth.home.arpa.example.org', 'http://evilhome.arpa', 'http://xhome.arpa',
      'http://localhost.example.org', 'http://10.example.org', 'http://192.168.example.org', 'http://172.20.example.org',
      'http://dms.fritz.box', 'http://nas.home', 'http://100.64.1.2', 'http://169.254.1.1', 'http://172.32.0.1', 'http://203.0.113.7',
      'http://[2001:db8::1]', 'http://login.example.org', 'kein url', ''])
      assert.equal(imHeimnetz(a), false, a);
  });

  it('Hinweis: zusätzlich Router- und Gewohnheitsnamen sowie weitere nicht öffentliche Bereiche', () => {
    for (const a of ['https://dms.fritz.box', 'http://nas.home', 'http://srv.intranet', 'http://nas.localdomain', 'http://dms.localhost', 'http://100.64.1.2', 'http://169.254.3.4', 'http://auth.home.arpa'])
      assert.equal(imHeimnetz(a, 'hinweis'), true, a);
    for (const a of ['https://dms.example.org', 'https://home.arpa.example.org', 'https://203.0.113.7', 'https://[2001:db8::1]'])
      assert.equal(imHeimnetz(a, 'hinweis'), false, a);
  });

  it('Rechnername: klein, ohne Klammern; ungültig ergibt null', () => {
    assert.equal(rechnername('http://NAS.Local:8080/x'), 'nas.local');
    assert.equal(rechnername('http://[FD00::1]:3000'), 'fd00::1');
    assert.equal(rechnername('kaputt'), null);
    assert.equal(heimnetzName('[::1]'), true);
    assert.equal(heimnetzName(''), false);
  });
});
