/**
 * Start (#1278, aus `ablago.ts`): Anmeldeschutz (#240) mit Ereignis bei Kontosperre (#670) und Zwei-Faktor (#242).
 */
import { Anmeldesperre } from '../anmeldung/anmeldesperre';
import { pgEinstellungen } from '../einstellungen/einstellungen';
import { kuerzeIp } from '../datenschutz/abruf';
import { Zweifaktor } from '../anmeldung/zweifaktor';
import type { richteBetriebEin } from './betrieb';
import type { baueDienst } from './dienst';
import type { verbindeDatenbank } from './datenbank';
import type { vorbereiten } from './vorbereiten';

/** Was richteAnmeldungEin von früher braucht. */
type Bisher = Pick<Awaited<ReturnType<typeof richteBetriebEin>>, 'spDeps' | 'tresor'> &
  Pick<Awaited<ReturnType<typeof baueDienst>>, 'anVerwaltendeVon' | 'konten' | 'dienst'> &
  Pick<Awaited<ReturnType<typeof verbindeDatenbank>>, 'sql' | 'zustandDb'> &
  Pick<Awaited<ReturnType<typeof vorbereiten>>, 'cfg'>;

/** Anmeldeschutz und Zwei-Faktor. */
export function richteAnmeldungEin(bisher: Bisher) {
  const { spDeps, anVerwaltendeVon, sql, cfg, zustandDb, konten, dienst, tresor } = bisher;
  spDeps.anAdmins = anVerwaltendeVon('systemzustand');
  // Anmeldeschutz (#240): Sperren in der Datenbank, einstellbar in der Werkbank.
  const anmeldesperre = new Anmeldesperre(pgEinstellungen(sql, cfg.haushalt), anVerwaltendeVon('anmeldeschutz'), Date.now, zustandDb);
  konten.verbindeSperre(anmeldesperre);
  // Ereigniskatalog (#670): Kontosperre als Ereignis (Id des Benutzers, Zeitpunkt, Fehlversuche, IP gekürzt).
  anmeldesperre.beiKontosperre = async (x) => {
    const b = await konten.personMitEmail(x.email);
    if (b)
      await dienst.kern.ereignis('benutzer.gesperrt', {
        benutzer: b.id,
        zeitpunkt: new Date().toISOString(),
        fehlversuche: x.versuche,
        bis: x.bis,
        ip: kuerzeIp(x.ip),
      });
  };
  // Zwei-Faktor-Anmeldung (#242): Geheimnis verschlüsselt mit dem Schlüssel des DMS.
  konten.verbindeZweifaktor(
    new Zweifaktor(
      pgEinstellungen(sql, cfg.haushalt),
      (k) => tresor.verschluessele(k),
      (w) => tresor.entschluessele(w),
      Date.now,
      zustandDb,
    ),
  );
  return { anmeldesperre };
}
