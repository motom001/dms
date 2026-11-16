/**
 * `baue`: reine Funktion (testbar ohne DMS), die aus Eingabe und Stand das Paket samt Prüfung baut. Die Schritte
 * stehen je Teil in eigenen Dateien (#1278, Schritt 6a): `bau-typen`, `bau-sichten`, `bau-beispiele`, `bau-dateien`;
 * den gemeinsamen Stand hält `bau-lauf`.
 */
import { BEREICH, PAKET_ID, VERSION, vergleicheVersion } from '../../../../shared/src/pakete';
import {
  BESCHREIBUNG_LAENGE,
  GITHUB,
  istFreieLizenz,
  KEINE_LIZENZ,
  LIZENZEN,
  LIZENZNAME_LAENGE,
  LIZENZTEXT_MAX,
  lizenzVerweis,
  NAME_LAENGE,
  naechsteVersion,
  naechsteVersionen,
  type PaketErstellenEingabe,
  type VersionsLage,
} from '../../../../shared/src/paketerstellung';
import { t } from '../../sprache/sprache';
import { gebietsschema } from '../../../../shared/src/sprache';
import { type Bau, erkenneArt, type ErstellenDaten, untergrenze } from './bau-hilfen';
import { type BauLauf, hinweis, neuerLauf } from './bau-lauf';
import { eigeneTypen, typInsPaket, vergibTypSchluessel } from './bau-typen';
import { sichtenInsPaket } from './bau-sichten';
import { beispieleInsPaket, entdeckenInsPaket, wortlistenInsPaket } from './bau-beispiele';
import { dateienVon, genutzteFunktionen, inhaltVon } from './bau-dateien';
import { bekannteVersion, DMS_ANGABE, dmsOptionen, mindestversion } from './mindestversion';

/** 1. Angaben: Id, Name, Version (Form), Beschreibung und Autor. */
function pruefeAngaben(l: BauLauf) {
  const { e, d, id, probleme } = l;
  if (!PAKET_ID.test(id)) probleme.push(t('meldungen.paketerstellung.id-nur-kleinbuchstaben-ziffern'));
  else if (id === 'dms') probleme.push(t('meldungen.paketerstellung.id-dms-ist-fuer'));
  else if (d.pakete.some((p) => p.id === id)) probleme.push(t('meldungen.paketerstellung.id-das-paket-ist', { id }));
  const name = e.name.trim();
  if (name.length < NAME_LAENGE.min || name.length > NAME_LAENGE.max)
    probleme.push(
      t('meldungen.paketerstellung.name-bis-zeichen', {
        min: NAME_LAENGE.min,
        max: NAME_LAENGE.max,
      }),
    );
  if (!VERSION.test(e.version.trim())) probleme.push(t('meldungen.paketerstellung.version-drei-zahlen-z'));
  const beschreibung = e.beschreibung.trim().replace(/\s+/g, ' ');
  if (beschreibung.length < BESCHREIBUNG_LAENGE.min || beschreibung.length > BESCHREIBUNG_LAENGE.max)
    probleme.push(
      t('meldungen.paketerstellung.beschreibung-bis-zeichen-ein', {
        min: BESCHREIBUNG_LAENGE.min,
        max: BESCHREIBUNG_LAENGE.max,
      }),
    );
  const autor = {
    name: e.autor.name.trim(),
    github: e.autor.github.trim().replace(/^@/, ''),
  };
  if (!autor.name) probleme.push(t('meldungen.paketerstellung.autor-bitte-deinen-namen'));
  if (autor.github && !GITHUB.test(autor.github)) probleme.push(t('meldungen.paketerstellung.github-nur-buchstaben-ziffern'));
  if (!autor.github) hinweis(l, t('meldungen.paketerstellung.ohne-github-namen-laesst'));
  return { name, beschreibung, autor };
}

/** Lizenz (#651): freie aus der Liste, eigene (Name + Text → LICENSE) oder keine. */
function pruefeLizenz(l: BauLauf) {
  const { e, probleme } = l;
  const art = e.lizenzArt ?? 'frei';
  let lizenz = '';
  if (art === 'frei') {
    if (!istFreieLizenz(e.lizenz))
      probleme.push(
        t('meldungen.paketerstellung.lizenz-bitte-eine-freie', {
          LIZENZEN: LIZENZEN.join(', '),
        }),
      );
    else lizenz = e.lizenz;
  } else if (art === 'eigen') {
    const n = (e.lizenzName ?? '').trim();
    if (n.length < LIZENZNAME_LAENGE.min || n.length > LIZENZNAME_LAENGE.max)
      probleme.push(
        t('meldungen.paketerstellung.lizenz-name-der-eigenen', {
          min: LIZENZNAME_LAENGE.min,
          max: LIZENZNAME_LAENGE.max,
        }),
      );
    if (!(e.lizenzText ?? '').trim()) probleme.push(t('meldungen.paketerstellung.lizenz-bitte-den-text'));
    else if ((e.lizenzText ?? '').length > LIZENZTEXT_MAX)
      probleme.push(
        t('meldungen.paketerstellung.lizenz-der-lizenztext-ist', {
          LIZENZTEXT_MAX: LIZENZTEXT_MAX.toLocaleString(gebietsschema()),
        }),
      );
    lizenz = lizenzVerweis(n);
  } else lizenz = KEINE_LIZENZ;
  if (art !== 'frei')
    hinweis(
      l,
      t('meldungen.paketerstellung.laesst-sich-das-paket', {
        wert: art === 'eigen' ? t('meldungen.paketerstellung.mit-einer-eigenen-lizenz') : t('meldungen.paketerstellung.ohne-lizenz'),
        LIZENZEN: LIZENZEN.join(', '),
      }),
    );
  return { art, lizenz };
}

/** Version (#651): ausgewählt, immer höher als die zuletzt bekannte. */
function pruefeVersion(l: BauLauf) {
  const { e, d, probleme } = l;
  const version = e.version.trim();
  const bekannt = bekannteVersion(e, d.entwurf);
  if (!VERSION.test(version)) probleme.push(t('meldungen.paketerstellung.version-drei-zahlen-z'));
  else if (bekannt && vergleicheVersion(version, bekannt) <= 0)
    probleme.push(
      t('meldungen.paketerstellung.version-damit-der-empfaenger', {
        bekannt,
        wert:
          d.entwurf && d.entwurf.version === bekannt
            ? t('meldungen.paketerstellung.hast-du-schon-erstellt')
            : t('meldungen.paketerstellung.gibt-es-schon'),
        naechsteVersion: naechsteVersion(bekannt),
      }),
    );
  else if (!e.vonHand && bekannt && !Object.values(naechsteVersionen(bekannt)).includes(version))
    probleme.push(
      t('meldungen.paketerstellung.version-bitte-eine-der', {
        values: Object.values(naechsteVersionen(bekannt)).join(', '),
      }),
    );
  else if (!e.vonHand && !bekannt && version !== '1.0.0' && version !== '0.1.0')
    probleme.push(t('meldungen.paketerstellung.version-ein-neues-paket'));
  return { version, bekannt };
}

/** Nötige Ablago-Version (#651): Angabe aus der Auswahl, mindestens die aus den benutzten Funktionen. */
function pruefeDms(l: BauLauf, dms: string, mindest: { version: string; gruende: string[] }, optionen: string[]) {
  const { e, probleme } = l;
  const unten = untergrenze(dms);
  if (!dms) probleme.push(t('meldungen.paketerstellung.ablago-version-bitte-auswaehlen'));
  else if (!BEREICH.test(dms) || !unten) probleme.push(t('meldungen.paketerstellung.ablago-version-z-b'));
  else if (vergleicheVersion(unten, mindest.version) < 0)
    probleme.push(
      t('meldungen.paketerstellung.ablago-version-das-paket', {
        wert: mindest.gruende.join(', ') || t('meldungen.paketerstellung.funktionen'),
        version: mindest.version,
      }),
    );
  else if (!e.vonHand && !DMS_ANGABE.test(dms)) probleme.push(t('meldungen.paketerstellung.ablago-version-bitte-eine'));
  else if (!e.vonHand && !optionen.includes(dms))
    probleme.push(
      t('meldungen.paketerstellung.ablago-version-gibt-es', {
        dms,
        version: mindest.version,
      }),
    );
}

/**
 * Baut das Paket: prüft die Auswahl und die Angaben, löst Verweise auf und erzeugt die Dateien.
 * Gibt immer ein Ergebnis zurück; `probleme` bzw. nötige `fehlend` verhindern den Export.
 */
export function baue(e: PaketErstellenEingabe, d: ErstellenDaten): Bau {
  const l = neuerLauf(e, d);
  const { probleme, hinweise, fehlend, abh, schluessel, id } = l;
  // 1. Angaben
  const { name, beschreibung, autor } = pruefeAngaben(l);
  const { art, lizenz } = pruefeLizenz(l);
  const { version, bekannt } = pruefeVersion(l);
  const dms = e.dms.trim();
  // 2. Auswahl und 3. Mappentypen
  const eigene = eigeneTypen(l);
  vergibTypSchluessel(l, eigene);
  const paketTypen = eigene.map((mappentyp) => typInsPaket(l, mappentyp));
  // 4. Ansichten
  const { paketSichten, sortiert, fremdeTypen } = sichtenInsPaket(l);
  // 5. Beispiele, 6. Wortlisten, 7.–9. Rundgänge, Tipps und Automatisierungen
  const { beispiele, beispielVerweise, dokDateien } = beispieleInsPaket(l, eigene);
  const wortlisten = wortlistenInsPaket(l);
  const { rundgaenge, tipps, automatisierungen } = entdeckenInsPaket(l);

  if (!paketTypen.length && !paketSichten.length && !wortlisten.length && !rundgaenge.length && !tipps.length && !automatisierungen.length)
    probleme.push(t('meldungen.paketerstellung.waehle-mindestens-einen-eigenen'));
  // Nötige Ablago-Version (#651): Mindestversion aus den benutzten Funktionen, Angabe aus der Auswahl.
  const mindest = mindestversion(
    genutzteFunktionen({
      dmsVerweise: l.dmsVerweise,
      beispielVerweise,
      dokumente: dokDateien.length,
      fremdeTypen,
      wortlisten: wortlisten.length,
      automatisierungen: automatisierungen.length,
      paketTypen,
    }),
  );
  const optionen = dmsOptionen(mindest.version, d.dmsVersion);
  pruefeDms(l, dms, mindest, optionen);
  const felderJetzt: Record<string, string[]> = Object.fromEntries(
    eigene.map((t) => [t.id, t.felder.filter((f) => !f.system).map((f) => f.key)]),
  );
  const namen = new Map<string, string>([...d.typen.map((t) => [t.id, t.name] as const), ...d.sichten.map((s) => [s.id, s.name] as const)]);
  const ea = erkenneArt(e, d.entwurf, felderJetzt, namen);
  const versionLage: VersionsLage = {
    bekannt,
    art: ea.art,
    artGrund: ea.grund,
    mindest: mindest.version,
    gruende: mindest.gruende,
    dmsOptionen: optionen,
  };
  const fehlt = fehlend.filter((f) => f.noetig);
  if (fehlt.length)
    probleme.push(
      t('meldungen.paketerstellung.es-wird-auf-mappentypen', {
        map: fehlt.map((f) => `„${f.name}“`).join(', '),
      }),
    );

  const teile = { paketTypen, sortiert, beispiele, dokDateien, wortlisten, rundgaenge, tipps, automatisierungen };
  const inhalt = inhaltVon(teile);
  const ergebnis = {
    probleme,
    fehlend,
    hinweise,
    abhaengigkeiten: abh,
    inhalt,
    schluessel,
  };
  const rest = { version: versionLage, felder: felderJetzt, lizenz };
  if (probleme.length) return { ...ergebnis, dateien: [], ...rest };

  // 6. Dateien
  const dateien = dateienVon({ e, d, id, name, version, beschreibung, autor, art, lizenz, dms, abh, inhalt, ...teile });
  return { ...ergebnis, dateien, ...rest };
}
