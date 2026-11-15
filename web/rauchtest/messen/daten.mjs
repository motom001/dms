/**
 * Testdaten der Oberflächen-Messung (#1276): fest erzeugt und wiederholbar, nur Personas und example.org.
 *
 *   - Beispiel-Ablage (wie bei der Einrichtung angeboten) und Demo-Mappen mit festem Startwert (`--mappen`, Vorgabe
 *     5.000 wie die Lasttest-Stufe „klein“);
 *   - lange Post: ein PDF mit 100 Seiten Text (rund 40.000 Wörter, Textebene), der Betreff steht auf der letzten Seite –
 *     der Fall aus #1255;
 *   - Mappe mit vielen Dokumenten: ein Vertrag mit 59 Briefen und einem PDF mit 60 Seiten;
 *   - Tabelle mit vielen Zeilen: Tabellenfeld „Rechnungen“ am Vertrag, ein Vertrag mit 300 Rechnungen.
 *
 * `einrichten` braucht ein frisches Ablago (mit Datenbank-Anbindung, noch ohne Haushalt). `laden` sucht die Ids für
 * die Messung über die Schnittstelle zusammen – über Namen, damit auch ein zweiter Lauf ohne Zustandsdatei klappt.
 */
import { beispielPdf, beispielPdfSeiten } from '../pdf.mjs';

/** Konto der Messung (Persona Lena, eigene Adresse) – nur in der Mess-Installation. */
export const KONTO = { email: 'lena.messung@example.org', name: 'Lena Messung', passwort: 'messung-passwort-1276' };
const VIELE_DOKUMENTE = 'Hausratversicherung Messung';
const TABELLE = 'Stromvertrag Messung';
const LANGE_POST = 'Hausrat Versicherung Messung 2027';
const TABELLENFELD = 'messung_rechnungen';

/** Kleiner Client für die Schnittstelle mit Sitzung (Cookie) und optionalem Einrichtungscode. */
export function schnittstelle(basis, code) {
  let cookie = '';
  async function api(methode, pfad, body, { roh } = {}) {
    const r = await fetch(basis + pfad, {
      method: methode,
      headers: { 'x-dms': '1', ...(code ? { 'x-einrichtungscode': code } : {}), ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'content-type': roh ? 'application/octet-stream' : 'application/json' } : {}) },
      body: body === undefined ? undefined : roh ? body : JSON.stringify(body),
    });
    const neu = r.headers.get('set-cookie');
    if (neu) cookie = neu.split(';')[0];
    const text = await r.text();
    if (!r.ok) throw Object.assign(new Error(`${methode} ${pfad}: ${r.status} ${text.slice(0, 300)}`), { status: r.status });
    return text ? JSON.parse(text) : null;
  }
  return { api, cookie: () => cookie };
}

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/** Bis der Auftrag der Werkbank (Demo-Mappen) fertig ist. */
async function auftragAbwarten(api) {
  for (;;) {
    const a = await api('GET', '/api/werkbank/auftrag');
    if (!a || a.status === 'fertig') return;
    if (a.status === 'fehler') throw new Error(`Demo-Mappen: ${a.fehler}`);
    await warte(1000);
  }
}

/** Arbeit im Hintergrund (Text der PDFs, Vorschaubilder) abwarten, wie der Lasttest – höchstens 15 Minuten. */
export async function hintergrundAbwarten(api) {
  const t0 = Date.now();
  for (;;) {
    const u = await api('GET', '/api/werkbank/uebersicht').catch(() => null);
    const offen = u?.texterkennung ? (u.texterkennung.wartet ?? 0) + (u.texterkennung.laeuft ?? 0) : 0;
    const l = await api('GET', '/api/werkbank/last').catch(() => null);
    if (!offen && (l?.schleife?.p99 ?? 0) < 100) return;
    if (Date.now() - t0 > 15 * 60_000) { console.log('Arbeit im Hintergrund läuft noch – es wird trotzdem gemessen.'); return; }
    await warte(3000);
  }
}

const hochladen = (api, mappe, name, pdf) =>
  api('POST', `/api/mappen/${mappe}/dokumente?register=dokumente&name=${encodeURIComponent(name)}&typ=application/pdf`, pdf, { roh: true });

/** Seiten mit Fließtext wie in Versicherungsbedingungen (55 Zeilen je Seite), fest erzeugt. */
function bedingungen(seiten, schluss) {
  const zeile = (n) => `Versicherungsbedingungen Abschnitt ${n} Beitrag 84,20 EUR ab 01.03.2027 Hausrat Beispielweg 12 Dresden Seite`;
  const s = Array.from({ length: seiten }, (_, i) => Array.from({ length: 55 }, (_, k) => zeile(i * 55 + k)).join('\n'));
  if (schluss) s[seiten - 1] += `\n${schluss}`;
  return beispielPdfSeiten(s);
}

/** Frisches Ablago einrichten und die Testdaten anlegen. */
export async function einrichten(basis, { code, mappen = 5000 } = {}) {
  const { api } = schnittstelle(basis, code);
  await api('POST', '/api/konto/einrichten', { mandant: 'Haushalt Messung', email: KONTO.email, name: KONTO.name, passwort: KONTO.passwort });
  // Verwaltungsmodus für Werkbank und Mappentypen; frisch angemeldet, also ohne Passwortabfrage.
  await api('POST', '/api/konto/verwaltung', {}).catch(() => {});
  // Den Assistenten schließen (#804) wie ladezeiten.mjs: Schlüssel, Notfallblatt, Schritt „fertig“.
  await api('POST', '/api/werkbank/tresor/erzeugen').catch(() => {});
  await api('GET', '/api/werkbank/notfallblatt').catch(() => {});
  await api('POST', '/api/werkbank/einrichtung/schritt', { schritt: 'fertig' }).catch(() => {});
  await api('POST', '/api/entdecken/rundgaenge/ablago', { stand: 'gesehen' }).catch(() => {});
  console.log('Beispiel-Ablage …');
  await api('POST', '/api/beispiele');
  console.log(`${mappen.toLocaleString('de-DE')} Demo-Mappen …`);
  await api('POST', '/api/werkbank/demo', { anzahl: mappen, startwert: 'oberflaeche-1276' });
  await auftragAbwarten(api);
  const typen = await api('GET', '/api/typen');
  const vertrag = typen.find((t) => t.name === 'Vertrag' && !t.system);
  const rechnung = typen.find((t) => t.name === 'Rechnung' && !t.system);
  // Tabellenfeld „Rechnungen“ am Vertrag über das Verweisfeld der Rechnung (wie der Lasttest, #1254).
  const verweis = rechnung.felder.find((x) => x.typ === 'referenz' && x.zielTypen?.includes(vertrag.id));
  const erstes = vertrag.register.findIndex((r) => r.art === 'felder');
  await api('PUT', `/api/typen/${vertrag.id}`, { ...vertrag, felder: [...vertrag.felder, { key: TABELLENFELD, label: 'Rechnungen (Messung)', typ: 'tabelle', quelle: { typId: rechnung.id, feldKey: verweis.key } }],
    register: vertrag.register.map((r, i) => (i === erstes ? { ...r, felder: [...(r.felder ?? []), TABELLENFELD] } : r)) });
  // Vertragspartner ist Pflicht: die Stadtwerke aus der Beispiel-Ablage.
  const partnerTyp = typen.find((t) => t.id === vertrag.felder.find((f) => f.key === 'vertragspartner')?.zielTypen?.[0]);
  const partner = (await api('GET', `/api/mappen?${new URLSearchParams({ sicht: partnerTyp.id, von: '0', anzahl: '1', suche: 'Stadtwerke' })}`)).mappen[0].id;
  console.log('Vertrag mit 300 Rechnungen …');
  const strom = await api('POST', '/api/mappen', { typId: vertrag.id, werte: { bezeichnung: TABELLE, vertragspartner: partner, vertragsnummer: 'SM-0', beginn: '2024-01-01' } });
  for (let i = 0; i < 300; i += 10) {
    await Promise.all(Array.from({ length: 10 }, (_, k) => {
      const n = i + k + 1;
      const monat = String((n % 12) + 1).padStart(2, '0');
      return api('POST', '/api/mappen', { typId: rechnung.id, werte: { rechnungsnummer: `SM-R-${String(n).padStart(3, '0')}`, [verweis.key]: strom.id,
        rechnungsdatum: `${2002 + Math.floor(n / 12)}-${monat}-15`, betrag: { betrag: 40 + (n % 37), waehrung: 'EUR' }, bezahlt: n % 5 !== 0 } });
    }));
  }
  console.log('Vertrag mit 60 Dokumenten …');
  const viele = await api('POST', '/api/mappen', { typId: vertrag.id, werte: { bezeichnung: VIELE_DOKUMENTE, vertragspartner: partner, vertragsnummer: 'HR-2027-0001', beginn: '2027-03-01' } });
  await hochladen(api, viele.id, 'Hausrat Bedingungen.pdf', bedingungen(60));
  for (let i = 1; i <= 59; i++) await hochladen(api, viele.id, `Messbrief ${String(i).padStart(2, '0')}.pdf`, beispielPdf(`Messbrief ${i} Hausrat Beispiel 2027`));
  console.log('Lange Post (100 Seiten) …');
  const post = await api('POST', '/api/post', { betreff: LANGE_POST });
  await hochladen(api, post.id, 'Hausrat Bedingungen 2027.pdf', bedingungen(100, LANGE_POST));
  console.log('Arbeit im Hintergrund abwarten …');
  await hintergrundAbwarten(api);
  console.log('Eingerichtet.');
}

/** Anmelden und die Ids für die Messung zusammensuchen. Bricht ab, wenn das Konto der Messung fehlt (echte Ablage). */
export async function laden(basis) {
  const { api, cookie } = schnittstelle(basis);
  try {
    await api('POST', '/api/konto/anmelden', { email: KONTO.email, passwort: KONTO.passwort });
  } catch (e) {
    throw new Error(`Anmelden mit dem Konto der Messung (${KONTO.email}) scheitert – gemessen wird nur in einer eigenen Mess-Installation, die mit --einrichten vorbereitet ist (${e.message}).`, { cause: e });
  }
  const typen = await api('GET', '/api/typen');
  const vertrag = typen.find((t) => t.name === 'Vertrag' && !t.system).id;
  const rechnung = typen.find((t) => t.name === 'Rechnung' && !t.system).id;
  const finde = async (sicht, titel) => {
    const s = await api('GET', `/api/mappen?${new URLSearchParams({ sicht, von: '0', anzahl: '5', suche: titel })}`);
    const m = s.mappen.find((x) => Object.values(x.werte ?? {}).includes(titel)) ?? s.mappen[0];
    if (!m) throw new Error(`Testdaten fehlen: „${titel}“ – Mess-Installation mit --einrichten vorbereiten.`);
    return m.id;
  };
  const sichten = await api('GET', '/api/sichten');
  const post = typen.find((t) => t.system === 'post');
  return {
    basis, api, cookie: cookie(), vertrag, rechnung,
    neuePostSicht: sichten.neuePost,
    vieleDokumente: await finde(vertrag, VIELE_DOKUMENTE), vieleDokumenteTitel: VIELE_DOKUMENTE,
    tabelle: await finde(vertrag, TABELLE), tabelleTitel: TABELLE,
    langePost: await finde(post.id, LANGE_POST),
    beschreibung: (demo) => `Beispiel-Ablage, ${demo ? `${demo.toLocaleString('de-DE')} Demo-Mappen` : 'Demo-Mappen'}, lange Post 100 Seiten, Vertrag mit 60 Dokumenten (eins mit 60 Seiten), Vertrag mit 300 Rechnungen in der Tabelle`,
  };
}

/** Zweite Sitzung im Verwaltungsmodus (Werkbank): frisch angemeldet, darum ohne Passwortabfrage. */
export async function verwaltungsSitzung(basis) {
  const { api, cookie } = schnittstelle(basis);
  await api('POST', '/api/konto/anmelden', { email: KONTO.email, passwort: KONTO.passwort });
  await api('POST', '/api/konto/verwaltung', {}).catch(() => api('POST', '/api/konto/verwaltung', { passwort: KONTO.passwort }));
  return { api, cookie: cookie() };
}
