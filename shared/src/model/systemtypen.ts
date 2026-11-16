/**
 * Benutzer, Rollen (#26, #27) und Post (#192) – #1278, vorher `shared/src/model.ts`: Systemrollen, Auswahlwerte der
 * Post, Systemfelder und was an ihnen geschützt ist.
 */
import { ROLLEN } from './konto';
import type { Mappe, Werte } from './mappe';
import type { Beschriftungen, FeldTeile } from '../beschriftung';
import { registrierteSprachen, textNur } from '../sprache';
import type { Systemtyp, Mappentyp } from './mappentyp';
import type { Feld } from './felder';
import { t } from '../texte';
import { BELIEBIGER_TYP } from '../verweisziele';
import { kreisVon } from '../nummernkreis';

/** Kennung der Mappe einer Systemrolle, z. B. rolle:mitglied. */
export const systemrolleKennung = (r: keyof typeof ROLLEN) => `rolle:${r}`;
/** Frühere Systemrolle „Administrator“ (bis #818): wird beim Start zu einer gewöhnlichen Rolle ohne Mitglieder. */
export const FRUEHERE_ADMINROLLE = 'rolle:admin';
export const istSystemrolle = (m: Pick<Mappe, 'systemKennung'> | undefined) => !!m?.systemKennung?.startsWith('rolle:');

/* ---------- Post (#192): alles, was hinein- oder hinausgeht ---------- */

/**
 * Feste Werte der Auswahlfelder von Post (#728): So stehen sie in jeder Mappe und bleiben unverändert – sie sind keine
 * Anzeigetexte. Die Beschriftung je Sprache kommt aus den Beschriftungen des Felds (siehe beschriftung.ts).
 */
export const POST_KANAL = {
  hochgeladen: 'Hochgeladen',
  email: 'E-Mail',
  scan: 'Scan',
  ordner: 'Ordner',
  import: 'Import',
  api: 'API',
  webdav: 'WebDAV',
} as const;
export const POST_RICHTUNG = { eingehend: 'Eingehend', ausgehend: 'Ausgehend' } as const;
export const POST_STAND = { neu: 'Neu', zugeordnet: 'Zugeordnet', erledigt: 'Erledigt' } as const;
/** Ein Wert eines Auswahlfelds als Text (einfach oder erster einer Liste). */
export const auswahlText = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? '') : v == null ? '' : String(v));
/** Eine versendete E-Mail: festgehalten wie verschickt, ihre Felder ändert niemand. */
export const istVersendet = (w: Werte | undefined) =>
  !!w && auswahlText(w.kanal) === POST_KANAL.email && auswahlText(w.richtung) === POST_RICHTUNG.ausgehend;

/**
 * Beschriftungen der Systemmappentypen in den eingebauten und installierten Sprachen (#729): aus den Sprachdateien,
 * nur wo die Sprache den Text selbst hat (kein Rückfall). Leer → undefined.
 */
export function systemBeschriftung<T extends object>(
  teile: Record<string, string | Record<string, string>>,
): Beschriftungen<T> | undefined {
  const aus: Record<string, Record<string, unknown>> = {};
  for (const spr of registrierteSprachen()) {
    const e: Record<string, unknown> = {};
    for (const [teil, k] of Object.entries(teile)) {
      if (typeof k === 'string') {
        const v = textNur(spr, k);
        if (v) e[teil] = v;
        continue;
      }
      const o = Object.fromEntries(
        Object.entries(k)
          .map(([wert, kk]) => [wert, textNur(spr, kk)])
          .filter(([, v]) => v),
      );
      if (Object.keys(o).length) e[teil] = o;
    }
    if (Object.keys(e).length) aus[spr] = e;
  }
  return Object.keys(aus).length ? (aus as Beschriftungen<T>) : undefined;
}
/** Feste Werte der Auswahlfelder von Post mit ihrem Schlüssel in der Sprachdatei. */
const POST_OPTIONEN: Record<string, Record<string, string>> = { stand: POST_STAND, kanal: POST_KANAL, richtung: POST_RICHTUNG };

/** Systemfelder je Systemtyp. Bezeichnung und Hilfetext darf der Administrator ändern, alles andere ist fest. */
export function systemfelder(s: Systemtyp, rolleTypId: string, benutzerTypId = ''): Feld[] {
  return systemfelderRoh(s, rolleTypId, benutzerTypId).map((f) => {
    // Beschriftungen je Sprache (#729): Bezeichnung, Hilfetext und Optionen der Post auf Englisch und in Sprachpaketen.
    const k = `gemeinsam.model.%s.${s}.${f.key.replace(/_/g, '-')}`;
    const optionen =
      s === 'post' && POST_OPTIONEN[f.key]
        ? Object.fromEntries(
            Object.entries(POST_OPTIONEN[f.key]).map(([slug, wert]) => [wert, `gemeinsam.model.systemoption.post.${f.key}.${slug}`]),
          )
        : null;
    const b = systemBeschriftung<FeldTeile>({
      label: k.replace('%s', 'systemfeld'),
      ...(f.hilfe ? { hilfe: k.replace('%s', 'systemhilfe') } : {}),
      ...(optionen ? { optionen } : {}),
    });
    return b ? { ...f, beschriftungen: b } : f;
  });
}
function systemfelderRoh(s: Systemtyp, rolleTypId: string, benutzerTypId = ''): Feld[] {
  // Bezeichnungen und Hilfetexte aus der Sprachdatei (#728); die festen Werte der Optionen bleiben, wie sie sind.
  const l = (k: string) => t.frei(`gemeinsam.model.systemfeld.${s}.${k.replace(/_/g, '-')}`);
  const h = (k: string) => t.frei(`gemeinsam.model.systemhilfe.${s}.${k.replace(/_/g, '-')}`);
  if (s === 'post')
    return [
      { key: 'betreff', label: l('betreff'), typ: 'text', pflicht: true, maxLen: 250, system: true },
      {
        key: 'stand',
        label: l('stand'),
        typ: 'auswahl',
        pflicht: true,
        optionen: Object.values(POST_STAND),
        system: true,
        hilfe: h('stand'),
      },
      {
        key: 'kanal',
        label: l('kanal'),
        typ: 'auswahl',
        pflicht: true,
        optionen: Object.values(POST_KANAL),
        system: true,
        hilfe: h('kanal'),
      },
      { key: 'richtung', label: l('richtung'), typ: 'auswahl', pflicht: true, optionen: Object.values(POST_RICHTUNG), system: true },
      { key: 'datum', label: l('datum'), typ: 'datum', system: true },
      // „von“ und „an“ (#1042): dieselben Kennungen wie an Vertrag und Rechnung; bis 0.240 absender, fuer und an (Adresse).
      { key: 'von', label: l('von'), typ: 'text', system: true },
      { key: 'an', label: l('an'), typ: 'referenz', zielTypen: [benutzerTypId], verweisart: 'bezug', system: true, hilfe: h('an') },
      { key: 'an_adresse', label: l('an_adresse'), typ: 'text', system: true, hilfe: h('an_adresse') },
      {
        key: 'bezug',
        label: l('bezug'),
        typ: 'referenz',
        mehrfach: true,
        zielTypen: [BELIEBIGER_TYP],
        verweisart: 'bezug',
        system: true,
        hilfe: h('bezug'),
      },
      { key: 'nachricht', label: l('nachricht'), typ: 'langtext', system: true },
    ];
  if (s === 'rolle') return [{ key: 'name', label: l('name'), typ: 'text', pflicht: true, eindeutig: true, maxLen: 80, system: true }];
  return [
    { key: 'name', label: l('name'), typ: 'text', pflicht: true, system: true },
    { key: 'email', label: l('email'), typ: 'text', pflicht: true, eindeutig: true, system: true },
    {
      key: 'rollen',
      label: l('rollen'),
      typ: 'referenz',
      mehrfach: true,
      zielTypen: [rolleTypId],
      verweisart: 'bezug',
      system: true,
      hilfe: h('rollen'),
    },
    { key: 'aktiv', label: l('aktiv'), typ: 'janein', system: true },
    // Abwesenheit (#78): gespiegelt aus Profil bzw. Benutzerverwaltung; „Abwesend“ = wirkt gerade.
    { key: 'abwesend', label: l('abwesend'), typ: 'janein', system: true, hilfe: h('abwesend') },
    { key: 'abwesend_von', label: l('abwesend_von'), typ: 'datum', system: true },
    { key: 'abwesend_bis', label: l('abwesend_bis'), typ: 'datum', system: true },
    {
      key: 'vertreter',
      label: l('vertreter'),
      typ: 'referenz',
      zielTypen: [benutzerTypId],
      verweisart: 'bezug',
      system: true,
      hilfe: h('vertreter'),
    },
  ];
}

/** Lassen sich in der Ablage Mappen anlegen? Systemregeln (#146) und – für Nicht-Admins – die Berechtigungen. */
export const darfErstellen = (t: { system?: Systemtyp | null; darfAnlegen?: boolean } | undefined) =>
  !!t && t.system !== 'benutzer' && t.system !== 'post' && t.darfAnlegen !== false;
/** Neue Post (#192) über „+ Post“ bzw. die API – nicht über das allgemeine Formular. */
export const darfPostAnlegen = (t: { system?: Systemtyp | null; darfAnlegen?: boolean } | undefined) =>
  !!t && t.system === 'post' && t.darfAnlegen !== false;
/** Lässt sich die Mappe überhaupt löschen? Benutzer nur in der Benutzerverwaltung, Systemrollen nie (#146). */
export const darfLoeschen = (t: { system?: Systemtyp | null } | undefined, m?: Pick<Mappe, 'systemKennung'>) =>
  !!t && t.system !== 'benutzer' && !m?.systemKennung;

/**
 * Felder, die in der Ablage nur lesbar sind, mit dem Grund.
 * Benutzer: alle Systemfelder (gepflegt in Profil und Benutzerverwaltung) – sonst könnte
 * z. B. ein Mitglied die E-Mail-Adresse eines Administrators ändern und dessen Konto übernehmen.
 * Systemrollen: der Name.
 */
export function geschuetzteFelder(
  eintrag: Pick<Mappentyp, 'system' | 'felder'> | undefined,
  m?: Pick<Mappe, 'systemKennung'> & { werte?: Werte },
): Record<string, string> {
  if (eintrag?.system === 'benutzer') {
    return Object.fromEntries(eintrag.felder.filter((f) => f.system).map((f) => [f.key, t('gemeinsam.model.wird-im-profil-und')]));
  }
  if (eintrag?.system === 'rolle' && istSystemrolle(m)) return { name: t('gemeinsam.model.der-name-einer-systemrolle') };
  if (eintrag?.system === 'post') {
    // Post (#192): Kanal hält das System fest, „Zugeordnet zu“ setzt „Zuordnen“; eine versendete E-Mail bleibt, wie sie verschickt wurde.
    const fest: Record<string, string> = {
      kanal: t('gemeinsam.model.wird-beim-eingang-festgehalten'),
      bezug: t('gemeinsam.model.wird-ueber-zuordnen-gesetzt'),
    };
    if (istVersendet(m?.werte))
      for (const k of ['betreff', 'an_adresse', 'von', 'datum', 'nachricht', 'richtung'])
        fest[k] = t('gemeinsam.model.wird-beim-versand-festgehalten');
    return fest;
  }
  // Nummernkreis (#171): die Nummer vergibt das DMS.
  const nummern = (eintrag?.felder ?? []).filter((f) => kreisVon(f));
  if (nummern.length)
    return Object.fromEntries(
      nummern.map((f) => [
        f.key,
        m ? t('gemeinsam.model.fortlaufende-nummer-laesst-sich') : t('gemeinsam.model.wird-beim-speichern-vergeben'),
      ]),
    );
  return {};
}
