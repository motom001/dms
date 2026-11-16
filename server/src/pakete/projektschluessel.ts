/**
 * Öffentliche Schlüssel des DMS-Projekts für den offiziellen Paketkatalog (#594, motom001/dms-registry#74).
 *
 * Die Registry signiert `katalog.json` mit dem Signierschlüssel (Secret in der CI). Der Reserveschlüssel liegt
 * offline beim Maintainer und ersetzt ihn, falls der Signierschlüssel verloren geht oder bekannt wird. Gültig ist
 * eine Signatur mit einem der beiden.
 *
 * Das sind die echten Schlüssel des Maintainers (veröffentlicht in motom001/dms-registry#74). Fingerabdrücke
 * (SHA-256 über die 32 Bytes des Schlüssels, wie das DMS sie anzeigt) stehen in SECURITY.md und SECURITY.en.md;
 * der Test „Projektschlüssel“ prüft, dass beide übereinstimmen.
 *
 * DIES IST DIE EINZIGE STELLE ZUM AUSTAUSCHEN. Austausch: Entwicklerhandbuch → Pakete → „Projektschlüssel
 * austauschen“. Tests signieren nie mit diesen Schlüsseln, sondern geben eigene mit (`projektSchluessel` in den
 * Optionen der Paketverwaltung, `TEST_PROJEKT` in server/test/katalogschluessel.ts). Diese Liste lässt sich im
 * Betrieb nicht von außen ändern – keine Umgebungsvariable, keine Einstellung.
 */
export interface Projektschluessel {
  /** Wofür der Schlüssel da ist (Anzeige, Protokoll). */
  rolle: 'signier' | 'reserve';
  /** Öffentlicher Ed25519-Schlüssel als PEM (SPKI), wie ihn `openssl pkey -pubout` ausgibt. */
  pem: string;
  /** Testschlüssel: privates Gegenstück ist öffentlich bekannt (nur in Tests; die Vorschau warnt dann). */
  test: boolean;
}

export const PROJEKT_SCHLUESSEL: readonly Projektschluessel[] = [
  {
    rolle: 'signier',
    test: false,
    pem: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAtncL0wl0Hpx9nMjCpJGWsiBey0seAxTCv2bEl8Ll4J0=\n-----END PUBLIC KEY-----\n',
  },
  {
    rolle: 'reserve',
    test: false,
    pem: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA9TxkBmuCZZ+crB42fZ7AObKceRuF5IHgn55PIX9/WwI=\n-----END PUBLIC KEY-----\n',
  },
];
