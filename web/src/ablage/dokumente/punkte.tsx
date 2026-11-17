/**
 * „⋯“ einer Dokumentzeile (#1211, Vorgabe Dokumentliste; #1279 in Gruppen geteilt): Ansehen · Herunterladen ·
 * Bearbeiten · Ordnen, abgesetzt „Entfernen“ (neutral, Leitsatz 5). Nur, was bei diesem Dokument geht.
 */
import type { Dokument } from '../../../../shared/src/model';
import { kannSchwaerzen } from '../../../../shared/src/schwaerzen';
import { kannStempeln } from '../../../../shared/src/stempel';
import { archivfassungUrl, dokumenteApi, dokumentUrl } from '../../api/dokumente';
import type { MenuePunkt } from '../../bausteine';
import { t } from '../../sprache';
import { nurEins, postTeilenAb, teilenAb, zeigeText } from './aktionen';
import { VERKLEINERN_AB, type Sicht } from './hilfen';
import type { Kern } from './kern';

/** Was die Zeile über das Dokument weiß. */
export interface Zeilenlage {
  anlagen: Dokument[];
  ziele: Dokument[];
  sicht: Sicht;
  klickbar: boolean;
  auf: boolean;
}
type Punkt = MenuePunkt | false | undefined | null;

const gruppen = () => ({
  ansehen: t('ablage.dokumente.gruppe.ansehen'),
  laden: t('ablage.dokumente.gruppe.herunterladen'),
  bearbeiten: t('ablage.dokumente.gruppe.bearbeiten'),
  ordnen: t('ablage.dokumente.gruppe.ordnen'),
});
type Gruppen = ReturnType<typeof gruppen>;

function ansehen(k: Kern, x: Dokument, z: Zeilenlage, g: Gruppen): Punkt[] {
  const s = k.ocr.standVon(x);
  return [
    z.klickbar && {
      key: 'tab',
      gruppe: g.ansehen,
      symbol: 'extern',
      inhalt: t('ablage.dokumente.in-neuem-tab-oeffnen'),
      tu: () => {
        window.open(z.sicht!.url, '_blank', 'noopener');
      },
    },
    !z.auf && {
      key: 'ueber',
      gruppe: g.ansehen,
      symbol: 'info',
      inhalt: t('ablage.dokumente.ueber.titel'),
      tu: () => k.o.setUeberOffen(k.o.ueberOffen === x.id ? undefined : x.id),
    },
    s?.stand === 'fertig' && {
      key: 'text',
      gruppe: g.ansehen,
      symbol: 'dokument',
      inhalt: k.ocr.text?.id === x.id ? t('ablage.dokumente.text-ausblenden') : t('ablage.dokumente.text-anzeigen'),
      tu: () => zeigeText(k, x.id),
    },
  ];
}

/** Herunterladen ohne Exportrecht (gesperrt mit Grund), mit Archivfassung als Wahl, sonst das Original. */
function laden(k: Kern, x: Dokument, g: Gruppen): Punkt[] {
  const a = x.archivfassung?.stand === 'fertig' ? x.archivfassung.fassung : undefined;
  const geh = (url: string) => () => {
    location.assign(url);
  };
  const punkt = (key: string, inhalt: string, url: string, titel?: string): MenuePunkt => ({
    key,
    gruppe: g.laden,
    symbol: 'herunterladen' as const,
    inhalt,
    ...(titel !== undefined ? { titel } : {}),
    tu: geh(url),
  });
  if (k.p.mitnehmen === false)
    return [
      {
        key: 'laden',
        gruppe: g.laden,
        symbol: 'herunterladen' as const,
        inhalt: t('ablage.dokumente.herunterladen'),
        gesperrt: t('mappen.mitnehmen.grund'),
        tu: () => {},
      },
    ];
  if (k.stempelPflicht) return [];
  if (a && !a.imOriginal)
    return [
      punkt('pdfa', t('ablage.dokumente.laden.pdfa'), archivfassungUrl(x.id, true), t('volltext.archiv.laden.archiv.titel')),
      punkt('original', t('ablage.dokumente.laden.original'), dokumentUrl(x.id, true), t('volltext.archiv.laden.original.titel')),
    ];
  return [punkt('original', t('ablage.dokumente.herunterladen'), dokumentUrl(x.id, true))];
}

function mitnehmen(k: Kern, x: Dokument, z: Zeilenlage, g: Gruppen): Punkt[] {
  const mit = k.p.mitnehmen !== false;
  const archiv = z.sicht?.art === 'archiv';
  const { stempelOffen, setStempelOffen } = k.o;
  return [
    mit &&
      !k.stempelPflicht &&
      z.anlagen.length > 0 && {
        key: 'anlagen',
        gruppe: g.laden,
        symbol: 'bezug',
        inhalt: t('ablage.dokumente.laden.mit-anlagen'),
        titel: t('ablage.anlagen.mit-anlagen', { anzahl: z.anlagen.length }),
        tu: () =>
          dokumenteApi.herunterladenMitAnlagen(
            x.id,
            t('ablage.anlagen.zip-name', { name: x.name.replace(/\.[^.]{1,5}$/, '') }),
            archiv ? 'archiv' : undefined,
          ),
      },
    mit &&
      kannStempeln(x.mime) &&
      k.p.typ && {
        key: 'stempel',
        gruppe: g.laden,
        symbol: 'pdf',
        inhalt: k.stempelPflicht ? t('ablage.dokumente.herunterladen-mit-stempel') : t('ablage.dokumente.laden.mit-stempel'),
        titel: t('ablage.dokumente.eine-kopie-mit-stempel'),
        tu: () => setStempelOffen(stempelOffen?.id === x.id && !stempelOffen.version ? undefined : { id: x.id }),
      },
  ];
}

function bearbeiten(k: Kern, x: Dokument, g: Gruppen): Punkt[] {
  const { bearbeitbar, o } = k;
  const pdf = x.mime === 'application/pdf';
  return [
    bearbeitbar &&
      pdf && {
        key: 'seiten',
        gruppe: g.bearbeiten,
        symbol: 'dokument',
        inhalt: t('ablage.dokumente.menue.seiten'),
        titel: t('ablage.dokumente.seiten-drehen-loeschen-umsortieren'),
        tu: () => nurEins(k, o.setSeitenOffen, x.id, o.seitenOffen),
      },
    (k.p.mitnehmen !== false || bearbeitbar) &&
      pdf &&
      x.groesse >= VERKLEINERN_AB && {
        key: 'klein',
        gruppe: g.bearbeiten,
        symbol: 'pdf',
        inhalt: t('ablage.dokumente.menue.verkleinern'),
        titel: t('ablage.dokumente.bilder-im-pdf-herunterrechnen'),
        tu: () => nurEins(k, o.setKleinOffen, x.id, o.kleinOffen),
      },
    bearbeitbar &&
      kannSchwaerzen(x.mime) && {
        key: 'schwarz',
        gruppe: g.bearbeiten,
        symbol: 'auge-aus',
        inhalt: t('ablage.dokumente.menue.schwaerzen'),
        titel: t('ablage.dokumente.stellen-endgueltig-schwaerzen-als'),
        tu: () => nurEins(k, o.setSchwarzOffen, x.id, o.schwarzOffen),
      },
  ];
}

function ersetzenUndTeilen(k: Kern, x: Dokument, g: Gruppen): Punkt[] {
  return [
    !k.p.nurLesen &&
      k.versioniert && {
        key: 'ersetzen',
        gruppe: g.bearbeiten,
        symbol: 'neu-laden',
        inhalt: t('ablage.dokumente.menue.neue-version'),
        titel: t('ablage.dokumente.neue-version-hochladen-die'),
        tu: () => {
          k.sofort.setErsetzeId(x.id);
          k.sofort.ersetzFeld.current?.click();
        },
      },
    teilenAb(k, x, false) && {
      key: 'teilen-ab',
      gruppe: g.bearbeiten,
      symbol: 'posteingang',
      inhalt: t('ablage.dokumente.menue.post-teilen'),
      titel: t('ablage.dokumente.post-teilen-ab-titel'),
      tu: () => postTeilenAb(k, x),
    },
  ];
}

function ordnen(k: Kern, x: Dokument, z: Zeilenlage, g: Gruppen): Punkt[] {
  const { o } = k;
  return [
    k.bearbeitbar &&
      !x.anlageZu &&
      z.ziele.length > 0 && {
        key: 'anlage',
        gruppe: g.ordnen,
        symbol: 'bezug',
        inhalt: t('ablage.dokumente.menue.als-anlage'),
        titel: t('ablage.anlagen.als-anlage-knopf-titel'),
        tu: () => o.setAlsAnlage(o.alsAnlage === x.id ? undefined : x.id),
      },
    !k.p.nurLesen &&
      k.p.neuLaden && {
        key: 'asn',
        gruppe: g.ordnen,
        symbol: 'stoppuhr',
        inhalt: t('ablage.dokumente.menue.archivnummer'),
        titel: t('ablage.dokumente.nummer-vom-aufkleber-auf'),
        tu: () => k.sofort.setAsn({ id: x.id, wert: x.archivnummer ?? '' }),
      },
    (k.versioniert || (x.version ?? 1) > 1) && {
      key: 'versionen',
      gruppe: g.ordnen,
      symbol: 'historie',
      inhalt: t('ablage.dokumente.menue.versionen'),
      tu: () => o.setVersionenOffen(o.versionenOffen === x.id ? undefined : x.id),
    },
  ];
}

export function punkte(k: Kern, x: Dokument, z: Zeilenlage): MenuePunkt[] {
  const g = gruppen();
  const p: Punkt[] = [
    ...ansehen(k, x, z, g),
    ...laden(k, x, g),
    ...mitnehmen(k, x, z, g),
    ...bearbeiten(k, x, g),
    ...ersetzenUndTeilen(k, x, g),
    ...ordnen(k, x, z, g),
  ];
  return p.filter((e): e is MenuePunkt => !!e);
}
