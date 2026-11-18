import { feldLabel } from '../../../../shared/src/beschriftung';
import { sichtbareRegister } from '../../../../shared/src/darstellung';
import {
  standardRegister,
  trefferlistenVon,
  zielErlaubt,
  type Feld as FeldDef,
  type Mappe,
  type Mappentyp,
  type Register,
  type Verweiskonflikt,
  vorlageFelder,
  wirksameVorlage,
} from '../../../../shared/src/model';
import { gebietsschema } from '../../../../shared/src/sprache';
import { teileVon } from '../../../../shared/src/zusammengesetzt';
import { mappenApi, type MappeDetails, type Rueckverweis } from '../../api/mappen';
import type { useDaten } from '../../daten';
import { titelOder } from '../../seiten';
import { t } from '../../sprache';

export const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' });

/** Register des Typs; ältere Typen ohne Register bekommen die Standardregister. Ausgeblendete (#655) zeigt die Mappe nicht. */
export const registerVon = (mappentyp: Mappentyp): Register[] =>
  sichtbareRegister(mappentyp.register?.length ? mappentyp.register : standardRegister(mappentyp.felder));

/** Zähler für neue Dateien im Formular (Schlüssel bis zum Speichern). */
let zaehler = 0;
export const neueUid = () => `n${++zaehler}`;

/** Die nächste Post aus „Neue Post“ (#936) – wie die Ansicht sie zuerst zeigt; ohne Ansicht oder Post keine. */
export async function naechstePost(sicht: string | null | undefined): Promise<Mappe | undefined> {
  if (!sicht) return undefined;
  try {
    return (await mappenApi.seite(sicht, 0, 1)).mappen.find((m) => !m.verborgen);
  } catch {
    return undefined;
  }
}

/** Rückfrage zu „Mit verknüpften Mappen löschen …“ (#424, #1210): unter „Stattdessen“ und im Menü „Mappe“ gleich. */
export const mitVerknuepftenFrage = (titel: string | null | undefined) => ({
  titel: t('ablage.mappeformular.mit-verknuepften.frage', { titelOder: titelOder(titel ?? undefined) }),
  text: t('ablage.mappeformular.mit-verknuepften.text'),
  ja: t('ablage.mappeformular.mit-verknuepften.ja'),
});

/** In die Zwischenablage; ohne HTTPS (z. B. http://nas:8080) über ein unsichtbares Textfeld. */
export async function kopiere(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* weiter mit dem Rückfall */
  }
  const hTMLTextAreaElement = document.createElement('textarea');
  hTMLTextAreaElement.value = text;
  hTMLTextAreaElement.setAttribute('readonly', '');
  hTMLTextAreaElement.style.position = 'fixed';
  hTMLTextAreaElement.style.opacity = '0';
  document.body.appendChild(hTMLTextAreaElement);
  hTMLTextAreaElement.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    hTMLTextAreaElement.remove();
  }
}

/** Felder, die aus diesem Verweisfeld folgen (#886). */
export const folgendeAus = (typ: Mappentyp, key: string) =>
  typ.felder.filter((x) => x.typ === 'referenz' && x.folgtAus?.feld === key).map((x) => x.key);

/** „passt nicht zu „Organisation““ bzw. „passt nicht zur Auswahlregel dieses Felds“ (#887) – nie „Filter“. */
export function unpassendText(felder: FeldDef[], keys: string[]): string {
  const namen = keys
    .map((k) => felder.find((f) => f.key === k))
    .filter((f): f is FeldDef => !!f)
    .map((f) => `„${feldLabel(f)}“`);
  return namen.length
    ? t('felder.verweis.unpassend', { felder: new Intl.ListFormat(gebietsschema(), { type: 'conjunction' }).format(namen) })
    : t('felder.verweis.unpassend.regel');
}

/** Mappen, die laut Register hierher verweisen (alle oder nur gewählte Quellen). */
export function verknuepfungsGruppen(
  d: ReturnType<typeof useDaten>,
  mappe: Mappe | undefined,
  typId: string,
  register: Register,
  details?: MappeDetails | null,
) {
  const gewaehlt = register.quellen ?? [];
  return d.typen.flatMap((mappentyp) =>
    mappentyp.felder
      .filter((f) => f.typ === 'referenz' && zielErlaubt(f, typId))
      .filter((f) => !gewaehlt.length || gewaehlt.some((q) => q.typId === mappentyp.id && q.feldKey === f.key))
      .map((f) => ({
        t: mappentyp,
        f,
        // Trefferliste dieser Quelle (#75); fehlt sie (mehr), einfache Liste.
        liste: trefferlistenVon(mappentyp).find(
          (l) => l.key === gewaehlt.find((q) => q.typId === mappentyp.id && q.feldKey === f.key)?.trefferliste,
        ),
        treffer:
          !mappe || !details
            ? ([] as Rueckverweis[])
            : details.rueckverweise.filter((r) => r.quelleTypId === mappentyp.id && r.feldKey === f.key),
      })),
  );
}

/** Gründe je unpassender Mappe aus den Konflikten der gespeicherten Mappe (#887). */
export const grundAus = (k: Verweiskonflikt[] | undefined, feld: string): Record<string, string[]> | undefined => {
  const x = k?.find((y) => y.feld === feld);
  return x ? Object.fromEntries(x.ids.map((id) => [id, x.eigeneFelder])) : undefined;
};

/** Geschützte Felder (#995): nur lesbar mit dem Hinweis, wer sie ändert. `null` = alle geschützten Felder des Typs. */
export function schreibschutzGesperrt(typ: Mappentyp, gesperrt: string[] | null): Record<string, string> {
  return Object.fromEntries(
    typ.felder
      .filter((f) => f.schreibschutz && (gesperrt === null || gesperrt.includes(f.key)))
      .map((f) => [f.key, t('felder.schreibschutz.nur-verwaltung')]),
  );
}

/** Zusammengesetzte Felder (#1050): nur lesbar, darunter „setzt sich zusammen aus …“ mit den Bezeichnungen der Teile. */
export function zusammengesetztGesperrt(typ: Mappentyp): Record<string, string> {
  return Object.fromEntries(
    typ.felder
      .filter((f) => f.typ === 'zusammengesetzt')
      .map((f) => {
        const teile = teileVon(typ.felder, f).map((x) => feldLabel(x));
        return [
          f.key,
          t('felder.zusammengesetzt.aus', { felder: new Intl.ListFormat(gebietsschema(), { type: 'conjunction' }).format(teile) }),
        ];
      }),
  );
}

/** Berechnete Felder (#1034): nur lesbar, darunter „berechnet von …“ bzw. „nicht mehr berechnet“ mit dem Paketnamen. */
export function berechnetGesperrt(typ: Mappentyp): Record<string, string> {
  return Object.fromEntries(
    typ.felder
      .filter((f) => f.berechnetVon)
      .map((f) => {
        const b = typ.berechnung?.[f.berechnetVon!];
        const paket = b?.name ?? f.berechnetVon!;
        return [f.key, b?.aktiv === false ? t('felder.berechnet.nicht-mehr', { paket }) : t('felder.berechnet.von', { paket })];
      }),
  );
}

/** „um 17:04“ (heute) bzw. „am 01.11.2026 um 17:04“. */
export function wann(iso: string): string {
  const d = new Date(iso);
  const uhrzeit = d.toLocaleTimeString(gebietsschema(), { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString()
    ? t('mappen.konflikt.heute', { uhrzeit })
    : t('mappen.konflikt.am', {
        datum: d.toLocaleDateString(gebietsschema(), { day: '2-digit', month: '2-digit', year: 'numeric' }),
        uhrzeit,
      });
}

/**
 * Lohnt eine Übersetzung (#732)? Lange Texte und formatierte Texte immer; einzeilige Textfelder nur ohne Format (keine
 * E-Mail, IBAN, Telefonnummer) und erst ab vier Wörtern – Namen und Nummern übersetzt niemand.
 */
export function feldUebersetzbar(f: FeldDef, wert: string): boolean {
  if (!wert.trim()) return false;
  if (f.typ === 'langtext' || f.typ === 'formatiert') return true;
  return f.typ === 'text' && !f.format && wert.trim().split(/\s+/).length >= 4;
}

/**
 * Feld für Bezeichnung bzw. Titel (#1288): Besteht der Titel eines Typs aus genau einem einfachen Textfeld, belegt
 * „+ <Typ> „xyz“ anlegen …“ es mit dem Getippten vor. Sonst keins (z. B. Vorname und Nachname getrennt).
 */
export function titelFeld(typ: Mappentyp): string | undefined {
  const vorlage = wirksameVorlage(typ).trim();
  const [k, ...rest] = vorlageFelder(vorlage);
  if (!k || rest.length || vorlage !== `{${k}}`) return undefined;
  const f = typ.felder.find((x) => x.key === k);
  return f && f.typ === 'text' && !f.mehrfach && !f.ausgeblendet && !f.berechnetVon ? f.key : undefined;
}
