/**
 * Code und Aktionen eines Pakets lesen (#1278, Schritt 6a-2; vorher Teil von `liesPaket`): Einstellungen, Code-Angaben,
 * Reiter, Ereignisse, berechnete Felder, Aktionen im Menü „Mappe“ und das gebaute Modul. Fehler sammelt der Lauf.
 */
import { liesMappenaktionen } from '../../paketaktionen';
import { liesCode } from '../../../../shared/src/pakete';
import { liesReiterAngaben } from '../../../../shared/src/paketreiter';
import { liesBeschreibung } from '../../../../shared/src/paketeinstellungen';
import { t } from '../../sprache/sprache';
import { type PaketCodeTeil, type PaketTyp } from './format';
import { type LeseLauf } from './lesen-lauf';

/** WebAssembly-Magie und Version 1. */
const WASM_KOPF = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

const CODE_DATEI = /^code\/(modul\.wasm|daten\/[A-Za-z0-9._-]{1,80})$/;

/** Einstellungen, Code, Aktionen und Modul in dieser Reihenfolge; `zeitplanKarten` aus den Automatisierungen. */
export function liesCodeTeil(l: LeseLauf, typen: PaketTyp[], zeitplanKarten: string[]) {
  const { einst, cl, rg } = liesCodeAngaben(l, typen, zeitplanKarten);
  const ma = pruefeMappenaktionen(l, typen, cl);
  const code = codeTeil(l, cl, rg);
  return { einst, ma, code };
}

/** Einstellungen (#197), Code (#338), Reiter (#996, #1004), Zeitplan (#1082), Mappen-Ereignisse (#670), berechnete Felder (#1034). */
function liesCodeAngaben(l: LeseLauf, typen: PaketTyp[], zeitplanKarten: string[]) {
  const { m, fehler, dateien } = l;
  // Einstellungen (#197): code.einstellungen und code.aktionen.
  const einst = liesBeschreibung(m.code);
  fehler.push(...einst.fehler.map((f) => `manifest.yaml: code.${f}`));
  // Code (#338): Manifest-Angaben, gebautes Modul und Daten.
  const cl = liesCode(
    m.code,
    [...dateien].map(([name, inhalt]) => ({ name, groesse: inhalt.length })),
  );
  // Anzeigen, Prüffunktion und Ausprobieren (#996, #1004): beschreibt das Paket, Ablago stellt dar.
  const rg = liesReiterAngaben(m.code, cl.code?.ereignisse ?? []);
  fehler.push(...rg.fehler.map((f) => `manifest.yaml: ${f}`));
  fehler.push(...cl.fehler.map((f) => (f.startsWith('code/:') ? f.slice('code/: '.length) : `manifest.yaml: ${f}`)));
  // „Paket nach Zeitplan ausführen“ (#1082): Das Paket muss das Ereignis abonnieren, sonst liefe die Karte ins Leere.
  if (zeitplanKarten.length && !cl.code?.ereignisse.includes('zeitplan.ausgefuehrt'))
    fehler.push(t('meldungen.pakete.automatisierung-paket-ereignis', { wo: [...new Set(zeitplanKarten)].join(', ') }));
  // Mappen-Ereignisse (#670): Schlüssel ohne Präfix sind eigene Mappentypen; fremde (paket:typ, dms:post) und „*“ seit #686.
  for (const k of cl.code?.mappentypen ?? [])
    if (k !== '*' && !k.includes(':') && !typen.some((t) => t.schluessel === k))
      fehler.push(t('meldungen.pakete.manifest-yaml-code-mappentypen', { k }));
  // Berechnete Felder (#1034): Den Wert schreibt der Code – er muss den eigenen Mappentyp schreiben dürfen.
  for (const ty of typen) {
    const felder = ty.felder.filter((f) => f.berechnet === true);
    if (!felder.length) continue;
    const darf = (cl.code?.rechte.schreiben ?? []).some((v) => v === '*' || v === ty.schluessel || v === `${l.id}:${ty.schluessel}`);
    if (!darf)
      fehler.push(t('meldungen.pakete.berechnet-ohne-schreiben', { typ: ty.name, felder: felder.map((f) => `„${f.label}“`).join(', ') }));
  }
  return { einst, cl, rg };
}

/**
 * Aktionen im Menü „Mappe“ (#1039): Mappentypen des Pakets oder seiner Abhängigkeiten; mit Code nur, wenn er die
 * Mappentypen auch lesen darf (er bekommt die Werte der Mappe).
 */
function pruefeMappenaktionen(l: LeseLauf, typen: PaketTyp[], cl: ReturnType<typeof liesCode>) {
  const { m, fehler, abh } = l;
  const id = l.id;
  const ma = liesMappenaktionen(m.mappenaktionen, { hatCode: !!cl.code });
  fehler.push(...ma.fehler.map((f) => `manifest.yaml: ${f}`));
  for (const a of ma.aktionen) {
    for (const vw of [...a.mappentypen, ...(a.anlegen ?? [])]) {
      const [pk, sl] = vw.includes(':') ? vw.split(':') : [id, vw];
      if (pk === id ? !typen.some((x) => x.schluessel === sl) : !(pk in abh))
        fehler.push(t('meldungen.pakete.aktion-typ-fehlt', { aktion: a.name, typ: vw }));
    }
    if (!a.dialog && cl.code) {
      const lesen = cl.code.rechte.lesen;
      const darf = (vw: string) =>
        lesen.includes('*') ||
        lesen.includes(vw) ||
        (!vw.includes(':') && lesen.includes(`${id}:${vw}`)) ||
        (vw.startsWith(`${id}:`) && lesen.includes(vw.slice(id.length + 1)));
      for (const vw of a.mappentypen) if (!darf(vw)) fehler.push(t('meldungen.pakete.aktion-ohne-lesen', { aktion: a.name, typ: vw }));
    }
  }
  return ma;
}

/** Das gebaute Modul und die Daten des Codes; ohne Modul (z. B. nur Einstellungen) läuft kein Code. */
function codeTeil(l: LeseLauf, cl: ReturnType<typeof liesCode>, rg: ReturnType<typeof liesReiterAngaben>): PaketCodeTeil | null {
  const { dateien, fehler } = l;
  let code: PaketCodeTeil | null = null;
  if (cl.code) {
    const modul = dateien.get('code/modul.wasm');
    // Ohne gebautes Modul (z. B. nur Einstellungen) lässt sich das Paket installieren; es läuft dann kein Code.
    if (!modul) {
      /* Hinweis in der Vorschau */
    } else if (modul.length < 8 || !modul.subarray(0, 8).equals(WASM_KOPF)) fehler.push(t('meldungen.pakete.code-modul-wasm-ist'));
    // Andere Dateien unter code/ (Quellcode) stören nicht; geladen werden nur modul.wasm und daten/….
    if (modul)
      code = {
        info: rg.angaben ? { ...cl.code, reiter: rg.angaben } : cl.code,
        dateien: [...dateien].filter(([n]) => CODE_DATEI.test(n)).map(([n, inhalt]) => ({ name: n.slice('code/'.length), inhalt })),
      };
  }
  return code;
}
