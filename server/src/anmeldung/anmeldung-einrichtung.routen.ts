/**
 * Anmeldung (#1278, aus `anmeldung.routen.ts`): Einrichtungsassistent (#119, #804, #806, #813).
 */
import { Fachfehler } from '../grundlagen/fehler';
import { t } from '../sprache/sprache';
import { eigeneVersion } from '../system/system';
import { ok, b } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../http/routen-typen';
import { DARF_VORGABE, istPaketeGrenze } from '../../../shared/src/darf';

/** Einrichtungsassistent (#119): Code, Sammeln (#804) und Konfigurationsdatei (#806). */
export function einrichtungRouten(k: RoutenKontext): Route[] {
  const { x, einrichtungZugang } = k;
  return [
    {
      methode: 'POST',
      pfad: '/api/einrichtung/code',
      zugang: 'offen',
      handler: async (a) => {
        if (!x.einrichtung) throw new Fachfehler(404, t('meldungen.routen.kein-einrichtungsassistent'));
        await x.einrichtung.pruefeCode(a.einrichtungscode);
        return ok({ ok: true });
      },
    },
    // Sammeln vor „Jetzt einrichten“ (#804) und Konfigurationsdatei (#806): mit Code, solange nicht eingerichtet.
    {
      methode: 'POST',
      pfad: '/api/einrichtung/pruefen',
      zugang: 'offen',
      lesend: true,
      handler: async (a) => {
        await einrichtungZugang(a);
        return ok({ probleme: x.einrichtung!.pruefePlan(b(a).plan, { passwort: b(a).passwort }) });
      },
    },
    {
      methode: 'POST',
      pfad: '/api/einrichtung/datei/lesen',
      zugang: 'offen',
      lesend: true,
      handler: async (a) => {
        await einrichtungZugang(a);
        return ok(x.einrichtung!.dateiLesen(b(a).text));
      },
    },
    {
      methode: 'POST',
      pfad: '/api/einrichtung/datei/schreiben',
      zugang: 'offen',
      lesend: true,
      handler: async (a) => {
        await einrichtungZugang(a);
        return ok(x.einrichtung!.dateiSchreiben(b(a).plan));
      },
    },
  ];
}

/** Einrichtungsassistent: Pakete wählen (#804) und E-Mail-Server finden (#813). */
export function einrichtungPaketeRouten(k: RoutenKontext): Route[] {
  const { pakete, einrichtungZugang, betrieb } = k;
  return [
    // Pakete wählen, bevor es einen Administrator gibt (#804): nur lesend und nur der offizielle Katalog.
    {
      methode: 'GET',
      pfad: '/api/einrichtung/pakete',
      zugang: 'offen',
      handler: async (a) => {
        await einrichtungZugang(a);
        return ok({ installiert: await pakete.installierte(), dms: eigeneVersion() });
      },
    },
    {
      methode: 'POST',
      pfad: '/api/einrichtung/pakete/katalog',
      zugang: 'offen',
      lesend: true,
      handler: async (a) => {
        await einrichtungZugang(a);
        return ok(await pakete.abrufen(false));
      },
    },
    {
      methode: 'POST',
      pfad: '/api/einrichtung/pakete/plan',
      zugang: 'offen',
      lesend: true,
      handler: async (a) => {
        await einrichtungZugang(a);
        const { pakete: liste, darf } = b(a) as { pakete?: unknown; darf?: unknown };
        // Frage 1 aus dem Assistenten (#1591): geplant wird mit der dort gewählten Antwort, gespeichert ist noch nichts.
        return ok(
          await pakete.ablaufPlan(
            { pakete: Array.isArray(liste) ? liste.filter((p): p is string => typeof p === 'string').slice(0, 100) : [] },
            istPaketeGrenze(darf) ? darf : undefined,
          ),
        );
      },
    },
    // Was Ablago darf (#1566): die Pakete des offiziellen Katalogs nach Frage 1 eingeordnet – nur lesend.
    {
      methode: 'POST',
      pfad: '/api/einrichtung/pakete/stufen',
      zugang: 'offen',
      lesend: true,
      handler: async (a) => {
        await einrichtungZugang(a);
        const { darf } = b(a) as { darf?: unknown };
        return ok(await pakete.katalogStufen(istPaketeGrenze(darf) ? darf : DARF_VORGABE.pakete));
      },
    },
    // E-Mail-Versand im Assistenten (#813, #804): nur die Server-Suche, nur lesend; gespeichert wird erst mit „Jetzt einrichten“.
    {
      methode: 'POST',
      pfad: '/api/einrichtung/mail/finden',
      zugang: 'offen',
      lesend: true,
      handler: async (a) => {
        await einrichtungZugang(a);
        return ok(await betrieb().findeServer(b(a)));
      },
    },
  ];
}
