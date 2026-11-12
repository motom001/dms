import { api, ApiFehler, setzeEinrichtungscode } from '../api';
import { t } from '../sprache';
import { sprache } from '../../../shared/src/sprache';
import { geheim, holeStand, planAus, setzeStand, STUFEN, type Lauf, type Stufe, type StufeStand } from './stand';

/**
 * „Jetzt einrichten“ (#804): führt aus, was der Assistent gesammelt hat – Stufe für Stufe mit Fortschritt. Scheitert
 * eine Stufe, bleibt alles Erledigte erhalten; „Erneut versuchen“ macht dort weiter und legt nichts doppelt an
 * (jede Stufe prüft vorher, ob es schon da ist). Danach Schlüssel und Notfallblatt auf der Abschlussseite.
 */

export function neuerLauf(): Lauf {
  return { stufen: Object.fromEntries(STUFEN.map((s) => [s, { zustand: 'wartet' }])) as Record<Stufe, StufeStand>, laeuft: false, fertig: false };
}

const setzeLauf = (f: (l: Lauf) => Lauf) => setzeStand((x) => (x.lauf ? { ...x, lauf: f(x.lauf) } : x));
const setzeStufe = (s: Stufe, st: StufeStand) => setzeLauf((l) => ({ ...l, stufen: { ...l.stufen, [s]: st } }));

/** Ohne Paket-Version: „texterkennung@1.2.0“ → „texterkennung“. */
const ohneVersion = (id: string) => id.split('@')[0];

/** Je Stufe: was zu tun ist; „ausgelassen“ = nichts gesammelt (leer gelassen). Rückgabe: Hinweis zur Stufe. */
const AUSFUEHREN: Record<Stufe, () => Promise<string | void | 'ausgelassen'>> = {
  async ablage() {
    const s = holeStand().sammlung;
    if (!geheim.konto) throw new Error(t('einrichtung.lauf.passwort.neu'));
    try {
      await api.einrichten({ mandant: s.ablage.trim(), name: s.konto.name.trim(), email: s.konto.email.trim(), passwort: geheim.konto, sprache: sprache() });
    } catch (e) {
      // Schon angelegt (etwa Antwort verloren) und angemeldet: dann gilt die Stufe als erledigt.
      if (!(e instanceof ApiFehler && e.status === 409 && await api.einrichtungStand().then(() => true, () => false))) throw e;
    }
    setzeEinrichtungscode(null);
    geheim.konto = '';
  },
  async schluessel() {
    const st = await api.tresor();
    if (st.zustand === 'vorhanden') return;
    if (st.zustand !== 'fehlt') throw new Error(t('einrichtung.lauf.schluessel.zustand'));
    await api.tresorErzeugen();
  },
  async adresse() {
    const a = holeStand().sammlung.optional.adresse.trim();
    if (!a) return 'ausgelassen';
    await api.adresseSpeichern(a);
  },
  async region() {
    const b = holeStand().sammlung.optional.bundesland;
    if (!b) return 'ausgelassen';
    await api.regionSetzen({ bundesland: b as never });
  },
  // Merkmal „beruflich genutzt“ (#1032) aus dem Schritt „Nutzung“ (#1045); die Werkbank-Vorlage folgt ihm.
  async nutzung() {
    if (!holeStand().sammlung.optional.beruflich) return 'ausgelassen';
    await api.setzeMerkmale({ beruflich: true });
  },
  async mail() {
    const m = holeStand().sammlung.optional.mail;
    if (!m) return 'ausgelassen';
    if (m.mitPasswort && !geheim.mail) throw new Error(t('einrichtung.lauf.mail.passwort'));
    // Im Assistenten nur mit Passwort; OAuth richtet man danach in der Werkbank ein (#813).
    await api.mailSpeichern({ anmeldung: 'passwort', aktiv: m.aktiv, host: m.host.trim(), port: m.port, verbindung: m.verbindung, benutzer: m.benutzer.trim(), absender: m.absender.trim(), selbstsigniert: m.selbstsigniert, ...(geheim.mail ? { passwort: geheim.mail } : {}) });
  },
  // Notfallkontakte (#812): nach dem Versand, damit die Info-Mail gleich hinausgeht. Beim Wiederholen nichts doppelt –
  // eine Adresse, die schon eingetragen ist, wird übersprungen.
  async notfallkontakte() {
    const liste = holeStand().sammlung.optional.notfallkontakte ?? [];
    if (!liste.length) return 'ausgelassen';
    const da = new Set((await api.notfallkontakte()).kontakte.map((k) => k.email.toLowerCase()));
    for (const k of liste) if (!da.has(k.email.trim().toLowerCase())) await api.notfallkontaktAnlegen(k);
  },
  async beispiele() {
    if (!holeStand().sammlung.optional.beispiele) return 'ausgelassen';
    try { await api.beispiele(); } catch (e) {
      // 409: Es gibt schon Mappentypen – beim Wiederholen die eben geladenen.
      if (!(e instanceof ApiFehler && e.status === 409)) throw e;
    }
  },
  async pakete() {
    const w = holeStand().sammlung.pakete;
    if (!w || !w.eingabe.pakete?.length) return 'ausgelassen';
    if (w.mitEinstellungen && !geheim.paketEinstellungen) throw new Error(t('einrichtung.lauf.pakete.einstellungen'));
    const installiert = new Set((await api.pakete()).installiert.map((p) => p.id));
    const rest = w.eingabe.pakete.filter((id) => !installiert.has(ohneVersion(id)));
    if (!rest.length) return;
    const e = await api.paketAblaufInstallieren({ ...w.eingabe, pakete: rest, einstellungen: geheim.paketEinstellungen ?? {} });
    setzeLauf((l) => ({ ...l, pakete: e }));
    const nicht = [...e.fehlgeschlagen.map((f) => f.name), ...e.nichtInstalliert.map((f) => f.name)];
    if (nicht.length) return t('einrichtung.lauf.pakete.teil', { namen: nicht.join(', ') });
  },
  // „Deine Organisation“ (#1045, #995): nach den Paketen, weil Basis den Mappentyp mitbringt. Gibt es schon eine eigene
  // Organisation (etwa nach „Erneut versuchen“), ist nichts zu tun; fehlt der Mappentyp, bleibt ein Hinweis statt eines
  // Fehlers – die Organisation lässt sich danach in der Ablage anlegen.
  async organisation() {
    const s = holeStand().sammlung;
    if (!s.organisation || !s.optional.beruflich) return 'ausgelassen';
    const st = await api.organisation();
    if (st.organisationen.length) return;
    if (!st.typen.length) return t('einrichtung.lauf.organisation.ohne-basis', { name: s.organisation.name });
    await api.organisationAnlegen(s.organisation);
  },
};

/** Was mit „Jetzt einrichten“ angelegt wird, nacheinander; bricht bei der ersten Stufe mit Fehler ab. */
export async function ausfuehren() {
  const start = holeStand();
  if (start.lauf?.laeuft) return;
  if (!start.lauf) setzeStand((x) => ({ ...x, lauf: neuerLauf() }));
  setzeLauf((l) => ({ ...l, laeuft: true }));
  for (const s of STUFEN) {
    const st = holeStand().lauf!.stufen[s].zustand;
    if (st === 'fertig' || st === 'ausgelassen') continue;
    setzeStufe(s, { zustand: 'laeuft' });
    try {
      const r = await AUSFUEHREN[s]();
      setzeStufe(s, r === 'ausgelassen' ? { zustand: 'ausgelassen' } : { zustand: 'fertig', ...(r ? { meldung: r } : {}) });
    } catch (e) {
      setzeStufe(s, { zustand: 'fehler', meldung: [(e as Error).message, ...(e instanceof ApiFehler ? e.gruende : [])].join(' ') });
      setzeLauf((l) => ({ ...l, laeuft: false }));
      return;
    }
  }
  // Stand der Schritte auf dem Server (Übersicht erinnert an Übersprungenes).
  const l = holeStand().lauf!;
  const fertig = (...s: Stufe[]) => s.some((x) => l.stufen[x].zustand === 'fertig');
  try {
    // Unterbrochen (anderer Browser): Was schon erledigt war, bleibt erledigt.
    const schon = l.unterbrochen ? new Set((await api.einrichtungStand()).erledigt) : new Set<string>();
    await api.einrichtungSchritt('schluessel');
    if (!schon.has('pakete')) await api.einrichtungSchritt('pakete', !(l.pakete?.installiert.length));
    if (!schon.has('optional')) await api.einrichtungSchritt('optional', !fertig('adresse', 'region', 'mail', 'notfallkontakte', 'beispiele'));
  } catch { /* Der Hinweis in der Übersicht ist nicht wichtig genug, um hier aufzuhalten. */ }
  setzeLauf((x) => ({ ...x, laeuft: false, fertig: true }));
}

/** Nach „Ändern“ während des Laufs: die betroffenen Stufen erneut versuchen lassen. */
export function stufenZuruecksetzen(stufen: Stufe[]) {
  setzeLauf((l) => ({ ...l, stufen: { ...l.stufen, ...Object.fromEntries(stufen.filter((s) => l.stufen[s].zustand !== 'fertig').map((s) => [s, { zustand: 'wartet' }])) } }));
}

/** Welche Stufen ein Schritt des Assistenten betrifft – und umgekehrt (für „Ändern“ nach einem Fehler). */
export const STUFEN_JE_SCHRITT = {
  ablage: ['ablage'], konto: ['ablage'], nutzung: ['nutzung', 'organisation'], pakete: ['pakete', 'organisation'], optional: ['adresse', 'region', 'mail', 'notfallkontakte', 'beispiele'],
} as const satisfies Record<string, readonly Stufe[]>;

/** Für die Konfigurationsdatei (#806): aktueller Plan. */
export const aktuellerPlan = () => planAus(holeStand().sammlung);
