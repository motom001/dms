import { useState, type MutableRefObject } from 'react';
import { PLAN_VERBINDUNGEN } from '../../../shared/src/einrichtungsplan';
import type { BetriebAnsicht } from '../api/betrieb';
import type { Verbindung } from '../api/einrichtung';
import { useKonto } from '../konto-kontext';
import { t } from '../sprache';
import type { BetriebZustand } from './betriebZustand';
import { MailFormular } from './mail/MailFormular';
import type { MailAngaben, MailGriff } from './mail/hilfen';

/**
 * E-Mail-Versand einrichten (#813) – derselbe Aufbau im Einrichtungsassistenten und in Werkbank → E-Mail und Adresse:
 *
 * 1. Einfacher Weg: eigene Adresse und Passwort. Benutzer, Absender, Testmail-Empfänger und Server schlägt Ablago
 *    daraus vor und kennzeichnet sie als Vorschlag; übernommen wird nur, was sichtbar dasteht.
 * 2. Server finden: eingebaute Liste (ohne Netz), beim Verlassen des Adressfelds DNS und Autoconfig der eigenen Domain,
 *    die Thunderbird-Datenbank nur auf Knopfdruck. Wen Ablago gefragt hat, steht darunter.
 * 3. Anbieter-Hinweise mit Link, „Verbindung prüfen“ gleich nach dem Passwort, verständliche Fehler.
 * 4. Erweitert (eingeklappt): alle Felder. OAuth für Microsoft 365 und Google mit der Anmeldung der Postfächer.
 *
 * Im Einrichtungsassistenten (`MailSammeln`, #803/#804) gibt es keine Speichern-Knöpfe und nichts wird gespeichert:
 * „Weiter“ holt mit `griff.current.sammle()` die sichtbaren Angaben in den Sammelstand, angewendet werden sie erst mit
 * „Jetzt einrichten“. „Verbindung prüfen“ und die Testmail brauchen eine Anmeldung und fehlen dort; die Server-Suche
 * läuft über /api/einrichtung/mail/finden (mit Einrichtungscode).
 *
 * Das Formular steht in Teilen unter mail/ (#1279): Zustand und Aktionen, Abschnitte, MailFormular.
 */

export type { MailAngaben, MailGriff } from './mail/hilfen';

/** Werkbank → E-Mail und Adresse: speichert über die Leiste unten. */
export function MailVersand({ b }: { b: BetriebZustand }) {
  const { ich, aktualisieren } = useKonto();
  return <MailFormular s={b.stand!} email={ich.email} b={b} aktualisieren={aktualisieren} />;
}

/**
 * Einrichtungsassistent (#803, #804, #813): dasselbe Formular, aber nur zum Sammeln. Es gibt noch keine Anmeldung –
 * darum weder `useKonto` noch Betriebsstand; vorbelegt mit dem Gesammelten (oder der Datei, #806) und der Adresse aus
 * „Dein Konto“ (#821). Der Schlüssel für das Passwort entsteht bei „Jetzt einrichten“ vor dem E-Mail-Versand.
 */
export function MailSammeln({
  wert,
  passwort,
  email,
  ablage,
  griff,
}: {
  wert: Omit<MailAngaben, 'passwort'> | null;
  passwort: string;
  email: string;
  ablage: string;
  griff: MutableRefObject<MailGriff | null>;
}) {
  const [s] = useState((): BetriebAnsicht => ({
    mail: {
      aktiv: wert?.aktiv ?? true,
      host: wert?.host ?? '',
      port: wert?.port ?? 587,
      verbindung: wert?.verbindung ?? 'starttls',
      benutzer: wert?.benutzer ?? '',
      absender: wert?.absender ?? '',
      selbstsigniert: wert?.selbstsigniert ?? false,
      anmeldung: 'passwort',
      passwortGesetzt: false,
      passwortLesbar: true,
      passwortUnverschluesselt: false,
    },
    adresse: '',
    vorschlag: null,
    passwoerterMoeglich: true,
    ablage: ablage.trim() || null,
    verbindungen: Object.fromEntries(PLAN_VERBINDUNGEN.map((v) => [v, t(`einrichtung.optional.mail.verbindung.${v}`)])) as Record<
      Verbindung,
      string
    >,
  }));
  return <MailFormular s={s} email={email} sammeln={{ griff, passwort }} />;
}
