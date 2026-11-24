/**
 * Was Ablago darf (#1562): lesen alle, die verwalten (Karte in der Übersicht); ändern nur „Gesamte Verwaltung“
 * (verwaltungsbereiche.ts). Erhöhen nur mit frischer Anmeldung, dazu Journal und Mail an alle mit Verwaltungsrecht.
 */
import { t } from '../sprache/sprache';
import { darfStand, setzeDarf } from '../pakete/index';
import type { Darf } from '../../../shared/src/darf';
import { EMPFOHLENE_PAKETE } from '../../../shared/src/pakete';
import type { Dienst } from '../dienst/dienst';
import { ich, ok, verlangeFrisch } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../http/routen-typen';

const antwort = (d: Darf) => `${t(`werkbank.darf.pakete.${d.pakete}`)} · ${t(`werkbank.darf.selbst.${d.selbst}`)}`;

export function darfRouten(k: RoutenKontext): Route[] {
  const { dienst, konten, x } = k;
  const pakete = () => dienst.kern.repo.listePakete();
  return [
    {
      methode: 'GET',
      pfad: '/api/werkbank/darf',
      zugang: 'admin',
      handler: async () => ok(await darfStand(dienst.kern.einstellungen)),
    },
    {
      methode: 'PUT',
      pfad: '/api/werkbank/darf',
      zugang: 'admin',
      handler: async (a) =>
        ok(
          await setzeDarf(dienst.kern.einstellungen, a.body, {
            pakete,
            einrichtungOffen: async () => !!x.einrichtung && (await x.einrichtung.stand()).offen,
            frisch: () => verlangeFrisch(konten, a, 'rechte'),
            von: ich(a).email,
            mail: async (alt, neu) => {
              const von = ich(a).name || ich(a).email;
              await dienst.mailAnVerwaltende(
                'uebersicht',
                () => t('werkbank.darf.mail.betreff'),
                () => t('werkbank.darf.mail.text', { von, vorher: antwort(alt), nachher: antwort(neu) }),
              );
            },
          }),
        ),
    },
  ];
}

const GESEHEN = 'darf_hinweis_gesehen';

/**
 * Für die Übersicht der Werkbank: der Stand (Karte „Was Ablago darf“), ob der einmalige Hinweis nach dem Update noch
 * steht (#1562), ob die Installation von einer älteren Version kommt (#1511: nur dann Umstiegs-Hinweise) und welche
 * empfohlenen Pakete fehlen (#1511: installierte verschwinden aus der Liste; Texterkennung: jedes Paket dafür).
 */
export async function darfUebersicht(dienst: Dienst) {
  const darf = await darfStand(dienst.kern.einstellungen);
  const gesehen = !!(await dienst.kern.einstellungen?.lies(GESEHEN));
  const ids = new Set((await dienst.kern.repo.listePakete()).map((p) => p.id));
  const texterkennung = !!(await dienst.volltexte.texterkennungPaket());
  return {
    darf,
    darfNeu: darf.herkunft === 'update' && !gesehen,
    umstieg: darf.herkunft === 'update',
    empfohlenFehlt: EMPFOHLENE_PAKETE.filter((id) => (id === 'texterkennung' ? !texterkennung : !ids.has(id))),
  };
}

/** „Zur Kenntnis nehmen“ am Hinweis „Neu: Was Ablago darf“ – danach steht er nicht mehr da. */
export async function darfHinweisGesehen(dienst: Dienst, von: string) {
  await dienst.kern.einstellungen?.schreibe(GESEHEN, { von, am: new Date().toISOString() });
}
