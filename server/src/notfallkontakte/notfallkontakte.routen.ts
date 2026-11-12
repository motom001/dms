/**
 * Notfallkontakte (#812): Werkbank → Verschlüsselung → Notfallkontakte. Nur im Verwaltungsmodus mit dem Bereich
 * „verschluesselung“ (verwaltungsbereiche.ts) – wer Kontakte pflegt, verschickt Mails im Namen der Ablage und ändert
 * das Notfallblatt. Im Einrichtungsassistenten ruft das erste Konto (Gesamte Verwaltung) dieselben Routen. Nie in einer
 * Vertretung (#43).
 */
import { Fachfehler } from '../fehler';
import { ok, ich } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Anfrage, Route } from '../routen';
import { t } from '../sprache';

/** Nicht in einer Vertretung – auch wenn der Verwaltungsmodus dort ohnehin nicht geht. */
function handelnder(a: Anfrage) {
  if (a.sitzungsDaten?.vertretungId) throw new Fachfehler(403, t('meldungen.notfallkontakte.vertretung'));
  const i = ich(a);
  return { id: i.id, name: i.name, email: i.email, sprache: i.sprache ?? null };
}

export function notfallkontakteRouten(k: RoutenKontext): Route[] {
  const { dienst, x } = k;
  const blattAm = async () => (x.sicherung ? (await x.sicherung.notfallblatt()).am : null);
  return [
    { methode: 'GET', pfad: '/api/werkbank/notfallkontakte', zugang: 'admin', handler: async (a) => { handelnder(a); return ok(await dienst.notfallkontakte.stand(await blattAm())); } },
    { methode: 'POST', pfad: '/api/werkbank/notfallkontakte', zugang: 'admin', handler: async (a) => ok(await dienst.notfallkontakte.anlegen(a.body, handelnder(a)), 201) },
    { methode: 'PUT', pfad: '/api/werkbank/notfallkontakte/:id', zugang: 'admin', handler: async (a) => ok(await dienst.notfallkontakte.aendern(a.params.id, a.body, handelnder(a))) },
    { methode: 'DELETE', pfad: '/api/werkbank/notfallkontakte/:id', zugang: 'admin', handler: async (a) => ok(await dienst.notfallkontakte.loeschen(a.params.id, handelnder(a))) },
    { methode: 'POST', pfad: '/api/werkbank/notfallkontakte/:id/erneut', zugang: 'admin', handler: async (a) => ok(await dienst.notfallkontakte.erneutSenden(a.params.id, handelnder(a))) },
  ];
}
