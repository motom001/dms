import http from 'node:http';
import https from 'node:https';
import { AUSSEN_GRENZEN } from '../../../shared/src/automatisierung';
import { AUSSEN_ANTWORT_MAX } from '../grundlagen/grenzen';
import { mitNetzUrsache } from '../grundlagen/fehler';
import { isIP } from 'node:net';
import { AdresseGesperrt, adresseErlaubt, dnsAlle, pruefendesLookup, type Aufloesen } from '../grundlagen/netzadressen';

/**
 * Sicherer Abruf für „URL aufrufen“ (#671) – Schutz gegen SSRF. Eigener Baustein, weil der Abruf für Katalog und Pakete
 * (`holeDaten` in pakete/verwaltung/abruf.ts) für einen anderen Zweck gebaut ist: nur GET, folgt Weiterleitungen (auf https), liefert den
 * Inhalt und prüft keine Adressen. Hier dagegen:
 *
 * - **Keine Weiterleitungen:** 3xx ist ein Fehler (dauerhaft) – Ablago folgt nie.
 * - **Adressen prüfen beim Verbinden:** Der Rechnername wird hier aufgelöst (eigenes `lookup` an der Verbindung, kein
 *   zweites Auflösen danach – DNS-Rebinding greift nicht). Erlaubt sind nur öffentliche Adressen; Loopback, private Netze,
 *   Link-Local, CGNAT und Dokumentationsnetze nur bei einem ausdrücklichen Heimnetz-Ziel; Metadaten-Adressen von
 *   Cloud-Anbietern, `0.0.0.0/8`, Multicast und Broadcast nie. Zeigt ein Name auf **eine** gesperrte Adresse, gilt er
 *   ganz als gesperrt. IPv4 in IPv6 (`::ffff:…`, NAT64 `64:ff9b::/96`) wird wie IPv4 geprüft.
 * - **Zeitlimit** für alles (Verbinden bis Ende der Antwort), **Größenlimit der Antwort** – gelesen wird höchstens
 *   `AUSSEN_ANTWORT_MAX` und verworfen; Ablago wertet die Antwort nicht aus (kein API-Client), nur den Status.
 * - Kein Verbindungs-Pool (jede Zustellung verbindet und prüft neu), TLS immer geprüft, kein Proxy aus der Umgebung.
 */

export { adressArt, adresseErlaubt } from '../grundlagen/netzadressen';

export interface AbrufAuftrag {
  adresse: string;
  methode: 'GET' | 'POST';
  koepfe: Record<string, string>;
  rumpf?: Buffer;
  heimnetz: boolean;
}
/**
 * Ergebnis: `ok` bei 2xx; `dauerhaft` = nicht wiederholen (Weiterleitung, 4xx außer 408/429, gesperrte Adresse,
 * ungültige Adresse) – sonst (Netz, Zeit, 408, 429, 5xx) später noch einmal.
 */
export interface AbrufErgebnis {
  ok: boolean;
  status: number | null;
  fehler: string | null;
  dauerhaft: boolean;
  ms: number;
}

export interface AbrufOptionen {
  zeitlimitMs?: number;
  antwortMax?: number;
  aufloesen?: Aufloesen;
}

export type SichererAbruf = (a: AbrufAuftrag, o?: AbrufOptionen) => Promise<AbrufErgebnis>;

export const sichererAbruf: SichererAbruf = (a, o = {}) =>
  new Promise((fertig) => {
    const start = Date.now();
    const ende = (x: Omit<AbrufErgebnis, 'ms'>) => fertig({ ...x, ms: Date.now() - start });
    let u: URL;
    try {
      u = new URL(a.adresse);
    } catch {
      ende({ ok: false, status: null, fehler: 'Adresse ungültig', dauerhaft: true });
      return;
    }
    if (u.username || u.password || (u.protocol !== 'https:' && !(u.protocol === 'http:' && a.heimnetz))) {
      ende({ ok: false, status: null, fehler: 'Nur https (http nur bei Heimnetz-Zielen), ohne Zugangsdaten', dauerhaft: true });
      return;
    }
    const host = u.hostname.replace(/^\[|\]$/g, '');
    // IP-Adresse direkt in der Adresse: Node ruft dann kein lookup – also hier prüfen.
    if (isIP(host) && !adresseErlaubt(host, a.heimnetz)) {
      ende({ ok: false, status: null, fehler: new AdresseGesperrt(host).message, dauerhaft: true });
      return;
    }
    const max = o.antwortMax ?? AUSSEN_ANTWORT_MAX;
    const modul = u.protocol === 'https:' ? https : http;
    let erledigt = false;
    const req = modul.request(
      u,
      {
        method: a.methode,
        agent: false,
        headers: {
          'user-agent': 'Ablago-Automatisierung',
          accept: '*/*',
          ...a.koepfe,
          ...(a.rumpf ? { 'content-length': String(a.rumpf.length) } : {}),
        },
        lookup: pruefendesLookup(a.heimnetz, o.aufloesen ?? dnsAlle) as never,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        let gelesen = 0;
        const abschluss = () => {
          if (erledigt) return;
          erledigt = true;
          clearTimeout(uhr);
          if (status >= 200 && status < 300) ende({ ok: true, status, fehler: null, dauerhaft: false });
          else if (status >= 300 && status < 400)
            ende({ ok: false, status, fehler: 'Weiterleitung – Ablago folgt keinen Weiterleitungen', dauerhaft: true });
          else ende({ ok: false, status, fehler: `HTTP ${status}`, dauerhaft: status !== 408 && status !== 429 && status < 500 });
        };
        // Antwort lesen und verwerfen – höchstens `max` Bytes, dann abbrechen (der Status zählt).
        res.on('data', (s: Buffer) => {
          gelesen += s.length;
          if (gelesen > max) {
            res.destroy();
            abschluss();
          }
        });
        res.on('end', abschluss);
        res.on('close', abschluss);
        res.on('error', abschluss);
      },
    );
    const uhr = setTimeout(
      () => req.destroy(new Error(`Keine Antwort in ${Math.round((o.zeitlimitMs ?? AUSSEN_GRENZEN.zeitlimitS * 1000) / 1000)} Sekunden`)),
      o.zeitlimitMs ?? AUSSEN_GRENZEN.zeitlimitS * 1000,
    );
    uhr.unref?.();
    req.on('error', (e) => {
      if (erledigt) return;
      erledigt = true;
      clearTimeout(uhr);
      ende({
        ok: false,
        status: null,
        fehler: mitNetzUrsache(e).slice(0, 300),
        dauerhaft: e instanceof AdresseGesperrt || e.message.includes('SSRF-Schutz'),
      });
    });
    req.end(a.rumpf);
  });
