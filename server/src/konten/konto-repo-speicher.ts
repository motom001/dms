/** Konten-Ablage im Arbeitsspeicher für Tests (#1278, vorher in `konten/konto-repo.ts`). */
import { randomUUID } from 'node:crypto';
import {
  type KontoRepo,
  type SitzungIntern,
  type SitzungsVerwaltung,
  type Link,
  systemEmail,
  zuletztListe,
  ZULETZT_RUHE_MS,
} from './konto-repo-schnittstelle';
import { type Benutzer, type Vertretung, type Rolle, KEINE_ABWESENHEIT } from '../../../shared/src/model';
import { dienstEmail } from '../repo';

/* ---------------- Arbeitsspeicher (Tests) ---------------- */

/** Was die Teile der Ablage im Arbeitsspeicher gemeinsam halten. */
interface Stand {
  benutzer: Map<string, Benutzer & { hash: string | null }>;
  sitzungen: Map<string, SitzungIntern & { erstellt: Date; geraet: string; ip: string }>;
  vertretungen: Map<string, Vertretung & { gesehen: Date | null }>;
  einstellungen: Map<string, Record<string, unknown>>;
  links: Map<string, Link>;
  notfall: { hash: string; erstellt: Date } | null;
}
const OHNE_MODUS: SitzungsVerwaltung = { verwaltungSeit: null, verwaltungAktiv: null, verwaltungBestaetigt: null, frisch: null };
const ohneHash = ({ hash: _h, ...b }: Benutzer & { hash: string | null }): Benutzer => ({ ...b, hatPasswort: !!_h });

/** Die Ablage aus ihren Teilen (#1278, Schritt 6b-1: nach Fachgruppen zerlegt, Rümpfe unverändert). */
export function speicherKontoRepo(): KontoRepo {
  const s: Stand = {
    benutzer: new Map(),
    sitzungen: new Map(),
    vertretungen: new Map(),
    einstellungen: new Map(),
    links: new Map(),
    notfall: null,
  };
  return {
    ...speicherPersonen(s),
    ...speicherAenderungen(s),
    ...speicherKontenOhneMensch(s),
    ...speicherSitzungen(s),
    ...speicherVerwaltungsmodus(s),
    ...speicherVertretungen(s),
    ...speicherLinksUndNotfall(s),
  };
}

/** Personen: zählen, auflisten, holen, anlegen und löschen. */
function speicherPersonen(s: Stand) {
  const { benutzer, sitzungen, links } = s;
  return {
    async anzahlBenutzer() {
      return [...benutzer.values()].filter((b) => !b.art).length;
    },
    async listeBenutzer() {
      const zuletzt = (id: string) => {
        const t = [...sitzungen.values()]
          .filter((x) => x.benutzerId === id && x.ablauf.getTime() > Date.now())
          .map((x) => x.zuletztAktiv.getTime());
        return t.length ? new Date(Math.max(...t)).toISOString() : null;
      };
      return [...benutzer.values()]
        .filter((b) => !b.art)
        .map((b) => ({ ...ohneHash(b), zuletztAktiv: zuletzt(b.id) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    },
    async holeBenutzer(id) {
      const b = benutzer.get(id);
      return b && ohneHash(b);
    },
    async holeHash(email) {
      const b = [...benutzer.values()].find((x) => !x.art && x.email.toLowerCase() === email.toLowerCase());
      return b && { benutzer: ohneHash(b), hash: b.hash };
    },
    async legeBenutzerAn(n) {
      if ([...benutzer.values()].some((x) => x.email.toLowerCase() === n.email.toLowerCase()))
        throw Object.assign(new Error('doppelt'), { code: '23505' });
      const b = {
        id: n.id,
        email: n.email,
        name: n.name,
        rolle: 'mitglied' as Rolle,
        verwaltung: [...(n.verwaltung ?? [])],
        aktiv: true,
        hatPasswort: !!n.passwortHash,
        erstellt: new Date().toISOString(),
        letzteAnmeldung: null,
        entwicklermodus: false,
        sprache: null,
        hash: n.passwortHash,
        abwesenheit: { ...KEINE_ABWESENHEIT },
        deaktiviert: null,
      };
      benutzer.set(n.id, b);
      return ohneHash(b);
    },
    async loescheBenutzer(id) {
      benutzer.delete(id);
      for (const [k, s] of sitzungen) if (s.benutzerId === id) sitzungen.delete(k);
      for (const [k, l] of links) if (l.benutzerId === id) links.delete(k);
    },
  } satisfies Partial<KontoRepo>;
}

/** Änderungen an Personen: Angaben, geschützte Änderungen, Abwesenheit, Passwort und Anmeldung. */
function speicherAenderungen(s: Stand) {
  const { benutzer } = s;
  return {
    async aendereBenutzer(id, d) {
      const alt = benutzer.get(id)!;
      const deaktiviert =
        d.aktiv === undefined
          ? (alt.deaktiviert ?? null)
          : d.aktiv
            ? null
            : alt.aktiv
              ? new Date().toISOString()
              : (alt.deaktiviert ?? null);
      const b = { ...alt, ...d, deaktiviert };
      benutzer.set(id, b);
      return ohneHash(b);
    },
    async aendereGeschuetzt(id, d, pruefe) {
      // Ohne await zwischen Prüfen und Ändern: im Arbeitsspeicher ist das schon eine Einheit.
      const alt = benutzer.get(id)!;
      const neu = {
        ...alt,
        ...(d.verwaltung ? { verwaltung: [...d.verwaltung] } : {}),
        ...(d.aktiv !== undefined ? { aktiv: d.aktiv } : {}),
      };
      const vorher = [...benutzer.values()].filter((b) => !b.art).map(ohneHash);
      const alle = [...benutzer.values()].filter((b) => !b.art).map((b) => ohneHash(b.id === id ? neu : b));
      const grund = pruefe(alle, vorher);
      if (grund) return { grund };
      const deaktiviert =
        d.aktiv === undefined
          ? (alt.deaktiviert ?? null)
          : d.aktiv
            ? null
            : alt.aktiv
              ? new Date().toISOString()
              : (alt.deaktiviert ?? null);
      benutzer.set(id, { ...neu, deaktiviert });
      return { benutzer: ohneHash({ ...neu, deaktiviert }) };
    },
    async setzeAbwesenheit(id, a) {
      const b = { ...benutzer.get(id)!, abwesenheit: { ...a } };
      benutzer.set(id, b);
      return ohneHash(b);
    },
    async setzeHash(id, hash) {
      benutzer.get(id)!.hash = hash;
    },
    async ersetzeHash(id, alt, neu) {
      const b = benutzer.get(id);
      if (!b || b.hash !== alt) return false;
      b.hash = neu;
      return true;
    },
    async notiereAnmeldung(id) {
      benutzer.get(id)!.letzteAnmeldung = new Date().toISOString();
    },
  } satisfies Partial<KontoRepo>;
}

/** Dienstkonten der Pakete und Systemkonten. */
function speicherKontenOhneMensch(s: Stand) {
  const { benutzer } = s;
  return {
    async dienstkonto(paketId) {
      const b = [...benutzer.values()].find((x) => x.art === 'dienst' && x.paketId === paketId);
      return b && ohneHash(b);
    },
    async legeDienstkontoAn(d) {
      const b = {
        id: d.id,
        email: dienstEmail(d.paketId, 'speicher'),
        name: d.name,
        rolle: 'mitglied' as Rolle,
        verwaltung: [],
        aktiv: true,
        hatPasswort: false,
        erstellt: new Date().toISOString(),
        letzteAnmeldung: null,
        entwicklermodus: false,
        hash: null,
        abwesenheit: { ...KEINE_ABWESENHEIT },
        deaktiviert: null,
        art: 'dienst' as const,
        paketId: d.paketId,
      };
      benutzer.set(d.id, b);
      return ohneHash(b);
    },
    async listeDienstkonten() {
      return [...benutzer.values()].filter((b) => b.art === 'dienst').map(ohneHash);
    },
    async systemkonto(kennung) {
      const b = [...benutzer.values()].find((x) => x.art === 'system' && x.systemkonto === kennung);
      return b && ohneHash(b);
    },
    async legeSystemkontoAn(d) {
      const da = [...benutzer.values()].find((x) => x.art === 'system' && x.systemkonto === d.kennung);
      if (da) return ohneHash(da);
      const b = {
        id: d.id,
        email: systemEmail(d.kennung, 'speicher'),
        name: d.name,
        rolle: 'mitglied' as Rolle,
        verwaltung: [],
        aktiv: true,
        hatPasswort: false,
        erstellt: new Date().toISOString(),
        letzteAnmeldung: null,
        entwicklermodus: false,
        hash: null,
        abwesenheit: { ...KEINE_ABWESENHEIT },
        deaktiviert: null,
        art: 'system' as const,
        systemkonto: d.kennung,
      };
      benutzer.set(b.id, b);
      return ohneHash(b);
    },
    async listeSystemkonten() {
      return [...benutzer.values()].filter((b) => b.art === 'system').map(ohneHash);
    },
  } satisfies Partial<KontoRepo>;
}

/** Sitzungen: anlegen, holen, berühren, auflisten und beenden. */
function speicherSitzungen(s: Stand) {
  const { benutzer, sitzungen } = s;
  return {
    async legeSitzungAn(hash, benutzerId, ablauf, info) {
      sitzungen.set(hash, {
        id: randomUUID(),
        benutzerId,
        ablauf,
        zuletztAktiv: new Date(),
        erstellt: new Date(),
        geraet: info.geraet,
        ip: info.ip,
        vertretungId: info.vertretungId ?? null,
        anmeldungVoll: info.voll ? new Date() : null,
        ...OHNE_MODUS,
      });
    },
    async holeSitzung(hash) {
      const x = sitzungen.get(hash);
      return x && { ...x };
    },
    async holeAnmeldung(hash) {
      const x = sitzungen.get(hash);
      const b = x && x.ablauf.getTime() > Date.now() ? benutzer.get(x.benutzerId) : undefined;
      return x && b && b.aktiv && b.art !== 'system' ? { sitzung: { ...x }, benutzer: ohneHash(b) } : undefined;
    },
    async beruehreSitzung(hash) {
      const x = sitzungen.get(hash);
      if (x) x.zuletztAktiv = new Date();
    },
    async listeSitzungen(benutzerId) {
      return [...sitzungen]
        .filter(([, x]) => x.benutzerId === benutzerId && x.ablauf.getTime() > Date.now())
        .map(([hash, x]) => ({
          hash,
          id: x.id,
          benutzerId,
          erstellt: x.erstellt.toISOString(),
          zuletztAktiv: x.zuletztAktiv.toISOString(),
          ablauf: x.ablauf.toISOString(),
          geraet: x.geraet,
          ip: x.ip,
          vertretungId: x.vertretungId,
        }))
        .sort((a, b) => b.zuletztAktiv.localeCompare(a.zuletztAktiv));
    },
    async loescheSitzung(hash) {
      sitzungen.delete(hash);
    },
    async loescheSitzungMitId(benutzerId, id) {
      for (const [k, x] of sitzungen)
        if (x.id === id && x.benutzerId === benutzerId) {
          sitzungen.delete(k);
          return true;
        }
      return false;
    },
    async loescheSitzungenVon(id) {
      for (const [k, s] of sitzungen) if (s.benutzerId === id) sitzungen.delete(k);
    },
  } satisfies Partial<KontoRepo>;
}

/** Verwaltungsmodus der Sitzungen (#818). */
function speicherVerwaltungsmodus(s: Stand) {
  const { benutzer, sitzungen } = s;
  return {
    async sitzungenImVerwaltungsmodus() {
      return [...sitzungen.values()].flatMap((x) => {
        const b = benutzer.get(x.benutzerId);
        if (!b || b.art || !b.aktiv || !x.verwaltungSeit || x.vertretungId || x.ablauf.getTime() <= Date.now()) return [];
        return [{ benutzer: ohneHash(b), sitzung: { ...x } }];
      });
    },
    async setzeSitzungsVerwaltung(hash, d) {
      const x = sitzungen.get(hash);
      if (x) Object.assign(x, d);
    },
    async vergissVerwaltungVon(id) {
      for (const x of sitzungen.values()) if (x.benutzerId === id) Object.assign(x, OHNE_MODUS);
    },
  } satisfies Partial<KontoRepo>;
}

/** Vertretungen und persönliche Einstellungen. */
function speicherVertretungen(s: Stand) {
  const { vertretungen, einstellungen } = s;
  return {
    async legeVertretungAn(v) {
      vertretungen.set(v.id, { ...v, beginn: new Date().toISOString(), ende: null, gesehen: null });
    },
    async beendeVertretung(id) {
      const v = vertretungen.get(id);
      if (v && !v.ende) v.ende = new Date().toISOString();
    },
    async holeVertretung(id) {
      const v = vertretungen.get(id);
      return v && { id: v.id, benutzerId: v.benutzerId, adminId: v.adminId, adminName: v.adminName, beginn: v.beginn, ende: v.ende };
    },
    async ungeseheneVertretungen(benutzerId) {
      return [...vertretungen.values()]
        .filter((v) => v.benutzerId === benutzerId && !v.gesehen)
        .map((v) => ({ id: v.id, benutzerId: v.benutzerId, adminId: v.adminId, adminName: v.adminName, beginn: v.beginn, ende: v.ende }));
    },
    async alleVertretungen() {
      return [...vertretungen.values()].map((v) => ({
        id: v.id,
        benutzerId: v.benutzerId,
        adminId: v.adminId,
        adminName: v.adminName,
        beginn: v.beginn,
        ende: v.ende,
      }));
    },
    async markiereGesehen(benutzerId) {
      for (const v of vertretungen.values()) if (v.benutzerId === benutzerId && !v.gesehen) v.gesehen = new Date();
    },
    async einstellungen(id) {
      return structuredClone(einstellungen.get(id) ?? {});
    },
    async setzeEinstellung(id, k, w) {
      const e = einstellungen.get(id) ?? {};
      if (w === null) delete e[k];
      else e[k] = structuredClone(w);
      einstellungen.set(id, e);
    },
    async merkeVorn(id, k, mappeId, max) {
      const e = einstellungen.get(id) ?? {};
      const liste = zuletztListe(e[k]);
      if (liste[0]?.id === mappeId && liste[0].am && Date.now() - Date.parse(liste[0].am) < ZULETZT_RUHE_MS) return;
      e[k] = [{ id: mappeId, am: new Date().toISOString() }, ...liste.filter((x) => x.id !== mappeId).map((x) => (x.am ? x : x.id))].slice(
        0,
        max,
      );
      einstellungen.set(id, e);
    },
  } satisfies Partial<KontoRepo>;
}

/** Links zum Setzen des Passworts und der Notfallcode. */
function speicherLinksUndNotfall(s: Stand) {
  const { benutzer, sitzungen, links } = s;
  return {
    async legeLinkAn(hash, benutzerId, zweck, ablauf) {
      links.set(hash, { benutzerId, zweck, ablauf, benutzt: null });
    },
    async holeLink(hash) {
      return links.get(hash);
    },
    async verbraucheLink(hash) {
      const l = links.get(hash);
      if (!l || l.benutzt) return false;
      l.benutzt = new Date();
      return true;
    },
    async loescheLinksVon(id) {
      for (const [k, l] of links) if (l.benutzerId === id) links.delete(k);
    },
    async notfallcode() {
      return s.notfall && { ...s.notfall };
    },
    async setzeNotfallcode(hash) {
      s.notfall = hash ? { hash, erstellt: new Date() } : null;
    },
    async loeseNotfallcodeEin(erwartet, benutzerId, passwortHash) {
      // Ohne await zwischen Prüfen und Ändern: im Arbeitsspeicher ist das schon eine Einheit.
      const b = benutzer.get(benutzerId);
      if (!s.notfall || s.notfall.hash !== erwartet || !b) return false;
      s.notfall = null;
      b.hash = passwortHash;
      for (const [k, x] of sitzungen) if (x.benutzerId === benutzerId) sitzungen.delete(k);
      for (const [k, l] of links) if (l.benutzerId === benutzerId) links.delete(k);
      return true;
    },
  } satisfies Partial<KontoRepo>;
}
