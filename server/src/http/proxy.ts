import { BlockList, isIP } from 'node:net';
import { t } from '../sprache/sprache';
import { istPrivat } from '../datenschutz/abruf';
import { eigeneGateways, type Gateways } from './gateway';

/**
 * Wem das DMS die Angaben eines Reverse-Proxys glaubt (X-Forwarded-For/-Proto/-Host; #234).
 *
 * - nicht gesetzt oder `auto`: dem eigenen Rechner und privaten Netzen (Loopback, Link-Local,
 *   10/8, 172.16/12, 192.168/16, fc00::/7) – **außer den Gateways der eigenen Netze** (#1355). Über das Gateway
 *   des Docker-Netzes können in manchen Aufbauten (Userland-Proxy, Docker Desktop, Rootless Docker) auch Anfragen
 *   aus dem Internet ankommen; ein Gateway gilt deshalb nie von selbst als Proxy. Ein Reverse-Proxy auf dem Rechner
 *   selbst (er spricht über das Gateway mit dem Container) wird ausdrücklich eingetragen, z. B. `172.17.0.1`.
 * - `false`: niemandem, `true`: allen.
 * - sonst eine Liste von Adressen oder Netzen, durch Komma getrennt (z. B. `172.18.0.0/16`).
 */
export type ProxyVertrauen = boolean | string[] | ((adresse: string, hop: number) => boolean);

/** Benannte Netze, die TRUST_PROXY als Liste annimmt (Fastify, proxy-addr). */
const PRIVATE_NETZE = ['loopback', 'linklocal', 'uniquelocal'];

const gueltig = (x: string) => {
  if (PRIVATE_NETZE.includes(x)) return true;
  const [ip, maske, ...rest] = x.split('/');
  if (rest.length || !isIP(ip)) return false;
  if (maske === undefined) return true;
  const max = isIP(ip) === 4 ? 32 : 128;
  return /^\d{1,3}$/.test(maske) && Number(maske) <= max;
};

/** `auto` (#1355): private Gegenstellen, aber kein Gateway eines eigenen Netzes. Für Fastify (`trustProxy`). */
function automatischesVertrauen(gateways: Gateways = eigeneGateways): (adresse: string) => boolean {
  return (adresse) => istPrivat(adresse) && !gateways.ist(adresse);
}

/**
 * Steht die Adresse in einer ausdrücklich gesetzten Liste `TRUST_PROXY` – als Adresse oder Netz (#1355)? Nur dann
 * gilt eine Anfrage, deren Gegenstelle ein Gateway ist, überhaupt als möglicherweise aus dem Heimnetz. Benannte Netze
 * (`uniquelocal` …) zählen nicht: Sie nennen das Gateway nicht ausdrücklich.
 */
export function ausdruecklichVertraut(vertrauen: ProxyVertrauen | undefined, adresse: string | undefined): boolean {
  if (!Array.isArray(vertrauen) || !adresse) return false;
  const a = adresse.replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i, '$1').replace(/%.*$/, '');
  const f = isIP(a);
  if (!f) return false;
  const liste = new BlockList();
  for (const x of vertrauen) {
    const [ip, m] = x.split('/');
    const g = isIP(ip);
    if (!g) continue;
    if (m === undefined) liste.addAddress(ip, g === 6 ? 'ipv6' : 'ipv4');
    else liste.addSubnet(ip, Number(m), g === 6 ? 'ipv6' : 'ipv4');
  }
  return liste.check(a, f === 6 ? 'ipv6' : 'ipv4');
}

export function proxyVertrauen(
  wert: string | undefined,
  gateways: Gateways = eigeneGateways,
): { trust: ProxyVertrauen; text: string; fehler?: string } {
  const w = (wert ?? '').trim();
  if (!w || w.toLowerCase() === 'auto')
    return { trust: automatischesVertrauen(gateways), text: t('meldungen.proxy.automatisch-eigener-rechner-und') };
  // „aus“ in den üblichen Schreibweisen (#1350).
  if (['false', '0', 'no', 'off', 'nein'].includes(w.toLowerCase())) return { trust: false, text: t('meldungen.proxy.aus') };
  if (w.toLowerCase() === 'true') return { trust: true, text: t('meldungen.proxy.alle-absender') };
  const liste = w
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const falsch = liste.filter((x) => !gueltig(x));
  // Ungültiger Wert (#1350): im Zweifel die strengere Einstellung – niemandem glauben, nicht „auto“.
  if (falsch.length || !liste.length) {
    return {
      trust: false,
      text: t('meldungen.proxy.aus'),
      fehler: t('meldungen.proxy.trust-proxy-ist-keine', { wert: falsch.join(', ') || w }),
    };
  }
  return { trust: liste, text: liste.join(', ') };
}
