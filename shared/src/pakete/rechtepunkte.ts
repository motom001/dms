/** Paketverwaltung (#1278 aus pakete.ts): Läufer-Zustand und Rechte eines Pakets als Punkte für die Anzeige. */
import { type InstalliertesPaket, BEREICH } from './katalog';
import { vergleicheVersion } from './versionen';
import {
  DMS_VOLLTEXT_AB,
  type EreignisArt,
  type PaketCode,
  ALLE_TYPEN,
  DOKUMENT_RECHTE,
  type Schnittstelle,
  SCHNITTSTELLEN,
  SCHNITTSTELLE_HILFE,
  istKiPaket,
  EREIGNISSE,
  MAPPEN_EREIGNISSE,
} from './schnittstellen';
import { t } from '../texte';
import type { Hilfeort } from '../hilfe';
import { dateitypName } from '../dateiumwandlung';
import { type PaketdatenBereich, bereichName } from '../paketdaten';

/**
 * Bekommt ein Paket `volltext.fertig` auch für Dokumente ohne Text (#458)? Ja, wenn es die Texterkennung übernimmt
 * (`dms:texterkennung`) oder sein Manifest mindestens DMS 0.133.0 verlangt – ältere Pakete (z. B. für Vektoren)
 * kennen nur Ereignisse mit Text.
 */
export function kenntVolltextOhneText(p: Pick<InstalliertesPaket, 'dms' | 'laeufer'>): boolean {
  if (hatSchnittstelle(p.laeufer, 'dms:texterkennung')) return true;
  const m = p.dms ? BEREICH.exec(p.dms.trim()) : null;
  return !!m && vergleicheVersion(m[2], DMS_VOLLTEXT_AB) >= 0;
}

/** Zustand des Paket-Läufers (#403): aus (kein Paket mit Code), startet, bereit, neustart (nach Absturz), pausiert (Wartung). */
export type LaeuferZustand = 'aus' | 'startet' | 'bereit' | 'neustart' | 'pausiert';

/**
 * Text für „Stand“ in der Werkbank – passend zu dem, was der Läufer gerade tut. wartet: Stand ändert sich gleich
 * von selbst (die Werkbank fragt dann nach).
 */
export function laeuferZustandText(
  x: { zustand: LaeuferZustand; absturz: string | null; paket: { geladen: boolean; fehler: string | null; aufrufe: number } | null },
  zeit: (iso: string) => string,
): { text: string; fehler: boolean; wartet: boolean } {
  if (x.paket?.fehler) return { text: x.paket.fehler, fehler: true, wartet: false };
  if (x.zustand === 'pausiert') return { text: t('gemeinsam.pakete.pausiert-wartungsmodus'), fehler: false, wartet: false };
  if (x.zustand === 'neustart')
    return {
      text: t('gemeinsam.pakete.abgestuerzt-startet-neu', { wert: x.absturz ? t('gemeinsam.pakete.um', { zeit: zeit(x.absturz) }) : '' }),
      fehler: true,
      wartet: true,
    };
  if (x.zustand !== 'bereit' || !x.paket?.geladen) return { text: t('gemeinsam.pakete.startet'), fehler: false, wartet: true };
  if (x.absturz) return { text: t('gemeinsam.pakete.neu-gestartet-nach-absturz', { zeit: zeit(x.absturz) }), fehler: false, wartet: false };
  return {
    text: x.paket.aufrufe ? t('gemeinsam.pakete.bereit') : t('gemeinsam.pakete.bereit-wartet-auf-das'),
    fehler: false,
    wartet: false,
  };
}

/**
 * Netzwerkzugriff eines Pakets mit Code (#449) – so in der Vorschau, im Handbuch und auf der Katalog-Webseite.
 * adressen: Namen der Einstellungen vom Typ „adresse“ (#444), deren Wert der Administrator einträgt und bestätigt.
 */
export function netzText(netz: string[], adressen: string[] = []): string {
  const einst = adressen.map((a) => t('gemeinsam.pakete.der-adresse-aus-der', { a }));
  if (!netz.length && !einst.length) return t('gemeinsam.pakete.kein-zugriff-auf-netzwerk');
  return t('gemeinsam.pakete.zugriff-auf-netzwerk-internet', { wert: [...netz, ...einst].join(', ') });
}

/** Hilfe-Ort im Administratorhandbuch (Pakete mit Code) je Ereignis (#449); Schlüssel wie in shared/src/hilfe.ts. */
export const EREIGNIS_HILFE: Record<EreignisArt, Hilfeort> = {
  'post.angelegt': 'pakete.ereignis.post_angelegt',
  'dokument.hochgeladen': 'pakete.ereignis.dokument_hochgeladen',
  'texterkennung.fertig': 'pakete.ereignis.texterkennung_fertig',
  'volltext.fertig': 'pakete.ereignis.volltext_fertig',
  'paket.einstellungen_geaendert': 'pakete.ereignis.einstellungen_geaendert',
  'datei.umwandeln': 'pakete.ereignis.datei_umwandeln',
  'sicherung.fertig': 'pakete.ereignis.sicherung_fertig',
  'datei.volltext': 'pakete.ereignis.datei_volltext',
  'datei.archivfassung': 'pakete.ereignis.datei_archivfassung',
  'mappe.angelegt': 'pakete.ereignis.mappe',
  'mappe.geaendert': 'pakete.ereignis.mappe',
  'mappe.geloescht': 'pakete.ereignis.mappe',
  'mappe.wiederhergestellt': 'pakete.ereignis.mappe',
  'frist.erreicht': 'pakete.ereignis.frist_erreicht',
  'zeitplan.ausgefuehrt': 'pakete.ereignis.zeitplan_ausgefuehrt',
};

/**
 * Welche mitgelieferten Automatisierungen beim Installieren angehakt sind (#712, #1082): Nennt das Paket `eingeschaltet`
 * an mindestens einer, genau die mit `eingeschaltet: true`; nennt es das nirgends (Pakete von vor #1082), wie bisher alle.
 * Der Admin kann jede abwählen.
 */
export function vorausgewaehlt(autos: ReadonlyArray<{ schluessel: string; eingeschaltet?: boolean }>): string[] {
  const angegeben = autos.some((a) => a.eingeschaltet !== undefined);
  return autos.filter((a) => (angegeben ? a.eingeschaltet === true : true)).map((a) => a.schluessel);
}

/** Ein Punkt der Rechte-Liste in der Vorschau (#449): Text, Handbuch-Stelle, ggf. Unterliste (Ereignisse). */
export interface RechtePunkt {
  text: string;
  hilfe: Hilfeort;
  unter?: Array<{ text: string; hilfe: Hilfeort }>;
}

/**
 * Berechnete Felder eines Pakets (#1034) für die Rechte-Vorschau: je Mappentyp (lesbarer Name) die Bezeichnungen der
 * Felder mit `berechnet: true`.
 */
export interface BerechneteFelder {
  typ: string;
  felder: string[];
}

/**
 * Rechte und Netzwerkzugriff für die Rückfrage bei der Installation (#338, #449): je Recht ein Punkt, Ereignisse als
 * Unterliste. `berechnet` (#1034): Felder, die das Paket berechnet – sie und Hinweise (`dms:hinweise`) stehen als eigene
 * Punkte da, dazu der Satz, dass alle sie sehen, die die Mappe lesen (Ergänzung Sicherheit).
 */
export function rechtePunkte(
  c: PaketCode,
  typName: (verweis: string) => string,
  berechnet: BerechneteFelder[] = [],
  zeitplaene: string[] = [],
): RechtePunkt[] {
  const eintrag = (l: string[]) => l.map((v) => (v === ALLE_TYPEN ? t('gemeinsam.pakete.alle-mappentypen') : typName(v))).join(', ');
  const z: RechtePunkt[] = [];
  if (c.rechte.lesen.length)
    z.push({ text: t('gemeinsam.pakete.mappen-lesen', { lesen: eintrag(c.rechte.lesen) }), hilfe: 'pakete.recht.lesen' });
  if (c.rechte.schreiben.length)
    z.push({
      text: t('gemeinsam.pakete.mappen-anlegen-und-aendern', { schreiben: eintrag(c.rechte.schreiben) }),
      hilfe: 'pakete.recht.schreiben',
    });
  if (c.rechte.dokumente !== 'keine') z.push({ text: DOKUMENT_RECHTE[c.rechte.dokumente], hilfe: 'pakete.recht.dokumente' });
  // Dateien umwandeln (#577) und Volltext aus Paketen (#614): mit den Dateitypen, für die das Paket zuständig sein will.
  // Archivfassung (#631) ebenso.
  const typen = (s: Schnittstelle) =>
    s === 'dms:umwandeln'
      ? c.umwandeln
      : s === 'dms:volltext'
        ? c.volltext
        : s === 'dms:archivfassung'
          ? c.archivfassung?.typen
          : undefined;
  for (const s of c.rechte.schnittstellen ?? [])
    z.push({
      text: `${SCHNITTSTELLEN[s]} (${s})${typen(s)?.length ? `: ${[...new Set(typen(s)!.map(dateitypName))].join(', ')}` : ''}`,
      hilfe: SCHNITTSTELLE_HILFE[s],
    });
  // Berechnete Felder (#1034): je Mappentyp die Felder, die nur das Paket schreibt.
  const mitFeldern = berechnet.filter((b) => b.felder.length);
  if (mitFeldern.length)
    z.push({
      text: t('gemeinsam.pakete.berechnet-felder', { felder: mitFeldern.map((b) => `${b.typ}: ${b.felder.join(', ')}`).join('; ') }),
      hilfe: 'pakete.recht.berechnet',
    });
  // Ein Weg über Mappen hinweg (Ergänzung Sicherheit): Was das Paket schreibt, sieht jeder, der die Mappe lesen darf.
  if (mitFeldern.length || hatSchnittstelle(c, 'dms:hinweise'))
    z.push({ text: t('gemeinsam.pakete.berechnet-sichtbar'), hilfe: 'pakete.recht.berechnet' });
  z.push(...paketdatenPunkte(c));
  z.push({
    text: netzText(
      c.netz,
      (c.adressen ?? []).map((a) => a.name),
    ),
    hilfe: c.adressen?.length ? 'pakete.recht.adresse' : 'pakete.recht.netz',
  });
  // KI-Dienst (#796): Inhalte nur aus Mappentypen, die für KI-Dienste zugelassen sind.
  if (istKiPaket(c)) z.push({ text: t('gemeinsam.pakete.ki-nur-zugelassene'), hilfe: 'pakete.ki' });
  // Mappen-Ereignisse (#670) mit den Mappentypen, zu denen das Paket sie bekommt.
  // #686: „*“ heißt hier „alle, die das Paket lesen darf“ – am Mappentyp lässt sich einzelnen Paketen der Zugriff verwehren.
  const zuTypen = c.mappentypen?.length
    ? ` – zu: ${c.mappentypen.map((v) => (v === ALLE_TYPEN ? t('gemeinsam.pakete.allen-mappentypen-die-das') : typName(v))).join(', ')}`
    : '';
  if (c.ereignisse.length)
    z.push({
      text: t('gemeinsam.pakete.reagiert-auf-diese-ereignisse'),
      hilfe: 'pakete.ereignisse',
      unter: c.ereignisse.map((e) => ({
        text: `${EREIGNISSE[e]}${MAPPEN_EREIGNISSE.includes(e) ? zuTypen : ''}`,
        hilfe: EREIGNIS_HILFE[e],
      })),
    });
  // Mitgelieferte Zeitpläne (#1082): „Läuft nach Zeitplan: Verträge täglich prüfen (täglich um 05:00)“ – ohne zusätzliche
  // Rechte; das Paket arbeitet mit den Rechten oben.
  z.push(...zeitplanPunkte(zeitplaene));
  return z;
}

/** Einrichtung und Nachweise lesen (#1054): die angefragten Bereiche – wirksam erst, wenn der Administrator sie anhakt. */
function paketdatenPunkte(c: PaketCode): RechtePunkt[] {
  const bereiche = (l: PaketdatenBereich[]) => l.map(bereichName).join(', ');
  return [
    ...(c.rechte.einrichtung?.length
      ? [
          {
            text: t('gemeinsam.pakete.recht-einrichtung', { bereiche: bereiche(c.rechte.einrichtung) }),
            hilfe: 'pakete.recht.einrichtung' as const,
          },
        ]
      : []),
    ...(c.rechte.nachweise?.length
      ? [
          {
            text: t('gemeinsam.pakete.recht-nachweise', { bereiche: bereiche(c.rechte.nachweise) }),
            hilfe: 'pakete.recht.nachweise' as const,
          },
        ]
      : []),
  ];
}

/** „Läuft nach Zeitplan: …“ (#1082) – leer ohne mitgelieferte Zeitpläne. */
function zeitplanPunkte(zeitplaene: string[]): RechtePunkt[] {
  return zeitplaene.length
    ? [{ text: t('gemeinsam.pakete.zeitplan-laeuft', { liste: zeitplaene.join('; ') }), hilfe: 'pakete.zeitplan' }]
    : [];
}

/** Rechte-Punkte als einfache Zeilen (z. B. in der Fehlermeldung, wenn die Bestätigung fehlt). */
export const rechteZeilen = (punkte: RechtePunkt[]): string[] =>
  punkte.map((p) => (p.unter ? `${p.text} ${p.unter.map((u) => u.text).join('; ')}` : p.text));
export const rechteText = (c: PaketCode, typName: (verweis: string) => string): string[] => rechteZeilen(rechtePunkte(c, typName));

/** Gleiche Rechte und gleicher Netzwerkzugriff? (Sonst muss ein Update neu bestätigt werden.) */
export const gleicheRechte = (a: PaketCode | undefined, b: PaketCode | undefined) =>
  JSON.stringify(rechteSchluessel(a)) === JSON.stringify(rechteSchluessel(b));
const rechteSchluessel = (c: PaketCode | undefined) =>
  c
    ? [
        [...c.rechte.lesen].sort(),
        [...c.rechte.schreiben].sort(),
        c.rechte.dokumente,
        [...c.netz].sort(),
        ...(c.rechte.schnittstellen?.length ? [[...c.rechte.schnittstellen].sort()] : []),
        ...(c.adressen?.length ? [c.adressen.map((a) => a.schluessel).sort()] : []),
        ...(c.volltext?.length ? [['volltext', ...[...c.volltext].sort()]] : []),
        ...(c.archivfassung?.typen.length ? [['archivfassung', ...[...c.archivfassung.typen].sort()]] : []),
        ...(c.mappentypen?.length ? [['mappentypen', ...[...c.mappentypen].sort()]] : []),
        ...(c.rechte.einrichtung?.length ? [['einrichtung', ...c.rechte.einrichtung]] : []),
        ...(c.rechte.nachweise?.length ? [['nachweise', ...c.rechte.nachweise]] : []),
      ]
    : null;
/** Darf das Paket diese Schnittstelle des Kerns nutzen (#442)? */
export const hatSchnittstelle = (c: PaketCode | undefined, s: Schnittstelle) => !!c?.rechte.schnittstellen?.includes(s);
