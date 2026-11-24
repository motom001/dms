import { t, tn } from '../../sprache';
import type { WerkbankUebersicht } from '../../api/betrieb';
import { variablenHinweis } from '../../../../shared/src/umgebungsvariablen';
import { TEXTERKENNUNG_PAKET } from '../../../../shared/src/volltext';
import { gebietsschema } from '../../../../shared/src/sprache';
import { sicherungsHinweise } from '../Sicherung';
import { exportHinweise } from '../Vollexport';
import { bytes, datum, zahl } from './hilfen';
import { empfohlenePakete, umstiegTexterkennung } from './empfohlen';
import type { Hinweis } from './hilfen';

/* Meldungen der Übersicht (#68, #816), zweiter Teil: Post, Sicherung, Anbindung, Pakete, Einrichtung, Texterkennung, Aufgaben. */

/** Eingangsordner (#915). */
export function eingangsordner(u: WerkbankUebersicht, h: Hinweis[]) {
  // Eingangsordner (#915): gelbe Warnungen (zu alt, zu groß, fehler/, zu viele); der Knopf zeigt den Baum je Ordner.
  const eo = u.eingangsordner;
  if (eo) {
    const werte = {
      tage: eo.grenzen.tage,
      datum: eo.aeltester ? datum(eo.aeltester) : '–',
      groesse: bytes(eo.bytes),
      gb: eo.grenzen.gb.toLocaleString(gebietsschema()),
      grenze: zahl(eo.grenzen.dateien),
    };
    for (const w of eo.warnungen) {
      const anzahl = w === 'fehler' ? eo.fehler : eo.dateien;
      h.push({
        schluessel: `eingangsordner.${w}`,
        art: 'warn',
        text: (
          <>
            <strong>{t.frei(`werkbank.uebersicht.eingangsordner.${w}`, { ...werte, anzahl, zahl: zahl(anzahl) })}</strong>{' '}
            {t.frei(`werkbank.uebersicht.eingangsordner.${w}.text`, werte)}
          </>
        ),
        ziel: '/werkbank/eingangsordner#ueberwachung',
        knopf: t('werkbank.uebersicht.eingangsordner.knopf'),
      });
    }
    // Post ohne „Für“ aus einem Ordner, der zu keinem Benutzer gehört (bisher galten auch Vornamen).
    for (const o of eo.ohnePerson)
      h.push({
        schluessel: `eingangsordner.ohne-person:${o}`,
        art: 'warn',
        text: (
          <>
            <strong>{t('werkbank.eingangsordner.ohne-person', { ordner: o })}</strong> {t('werkbank.eingangsordner.ohne-person.text')}
          </>
        ),
        ziel: '/werkbank/eingangsordner#personen',
        knopf: t('werkbank.uebersicht.eingangsordner.zum-ordner'),
      });
    for (const x of eo.umbenennen)
      h.push({
        schluessel: `eingangsordner.umbenennen:${x.neu}`,
        art: 'warn',
        text: (
          <>
            <strong>{t('werkbank.eingangsordner.umbenennen', { alt: x.alt, neu: x.neu })}</strong>{' '}
            {t('werkbank.eingangsordner.umbenennen.text')}
          </>
        ),
        ziel: '/werkbank/eingangsordner#personen',
        knopf: t('werkbank.uebersicht.eingangsordner.zum-ordner'),
      });
  }
}

/** Sicherung (#105), Export-Ordner (#797), Datenbank-Anbindung (#119, #943), Lasttest (#612), Beispiel-Ablage (#988). */
export function sicherungUndAnbindung(u: WerkbankUebersicht, h: Hinweis[], mitNotfallblatt: boolean) {
  // Sicherung (#105): fehlgeschlagen, zu alt, Notfallblatt, Speicherort. Das Notfallblatt führt zur Verschlüsselung (#993).
  if (u.sicherung)
    for (const x of sicherungsHinweise(u.sicherung, mitNotfallblatt))
      h.push({ ...x, ziel: x.ziel ?? '/werkbank/sicherung', knopf: x.knopf ?? t('werkbank.uebersicht.zur-sicherung') });
  // Export-Ordner (#797): im Sicherungsordner, oder Exporte beim Update von dort verschoben.
  if (u.exporte)
    for (const x of exportHinweise(u.exporte)) h.push({ ...x, ziel: '/werkbank/vollexport', knopf: t('werkbank.export.knopf') });
  // #128: API-Schlüssel gehören zu normalen Benutzern.
  // dms-komplett ohne Volume für /data/postgres (#943): rot, lässt sich nicht akzeptieren. Die Anleitung zum Retten
  // verlinkt die Seite Datenbank-Anbindung (hier stünde ein Link im Link).
  if (u.anbindung?.ohneVolume)
    h.push({
      schluessel: 'datenbank.ohne-volume',
      art: 'schlecht',
      text: (
        <>
          <strong>{t('werkbank.uebersicht.datenbank-ohne-volume')}</strong> {t('werkbank.uebersicht.datenbank-ohne-volume.text')}
        </>
      ),
      ziel: '/werkbank/anbindung',
      knopf: t('werkbank.uebersicht.zur-anbindung'),
    });
  // Datenbank-Anbindung (#119)
  if (u.anbindung?.umgebung === 'abweichend')
    h.push({
      schluessel: 'anbindung.abweichend',
      art: 'warn',
      text: (
        <>
          {tn('werkbank.uebersicht.fuehrend-ist-die-anbindung', { b: <strong>{t('werkbank.uebersicht.database-url-weicht-von')}</strong> })}
        </>
      ),
      ziel: '/werkbank/anbindung',
      knopf: t('werkbank.uebersicht.zur-anbindung'),
    });
  if (u.anbindung?.neustartNoetig)
    h.push({
      schluessel: 'anbindung.neustart',
      art: 'warn',
      text: (
        <>{tn('werkbank.uebersicht.und-gilt-erst-nach', { b: <strong>{t('werkbank.uebersicht.die-datenbank-anbindung-ist')}</strong> })}</>
      ),
      ziel: '/werkbank/anbindung',
      knopf: t('werkbank.uebersicht.zur-anbindung'),
    });
  // DMS_LASTTEST in einer echten Installation (#612): Der Lasttest ist nicht gestartet, das DMS läuft normal.
  if (u.lasttestAbbruch)
    h.push({
      schluessel: 'lasttest',
      art: 'warn',
      text: (
        <>
          <strong>{t('lasttest.uebersicht')}</strong> {u.lasttestAbbruch} {t('lasttest.uebersicht.text')}
        </>
      ),
      ziel: '/werkbank/systemzustand#version',
      knopf: t('lasttest.uebersicht.knopf'),
    });
  // Beispiel-Ablage (#988): deutlich als Beispiel gekennzeichnet, bis sie wieder entfernt ist.
  if (u.beispielablage)
    h.push({
      schluessel: 'beispielablage',
      art: 'info',
      text: (
        <>
          <strong>{t('werkbank.beispielablage.uebersicht', { anzahl: u.beispielablage })}</strong>{' '}
          {t('werkbank.beispielablage.uebersicht.text')}
        </>
      ),
      ziel: '/werkbank/beispielablage',
      knopf: t('werkbank.beispielablage.uebersicht.knopf'),
    });
}

/** Pakete (#405), KI-Dienste (#796), Einrichtung nachholen (#119), zweite Person (#821), Umgebungsvariablen (#115). */
export function paketeUndEinrichtung(u: WerkbankUebersicht, h: Hinweis[]) {
  // Pflicht-Einstellungen eines Pakets fehlen (#405, z. B. im Ablauf „später ausfüllen“): bis sie da sind, läuft das Paket nicht.
  for (const p of u.paketeEinstellungen ?? [])
    h.push({
      schluessel: `paket-einstellungen:${p.id}`,
      art: 'warn',
      text: (
        <>
          <strong>{t('pakete.ablauf.aufgabe', { name: p.name })}</strong> {t('pakete.ablauf.aufgabe.text')}
        </>
      ),
      ziel: `/werkbank/pakete/${p.id}?reiter=einstellungen`,
      knopf: t('pakete.ablauf.aufgabe.knopf'),
    });
  // KI-Dienste (#796): Nach dem Update einmal – bestehende Mappentypen gehen weiter an KI-Pakete, lassen sich aber ausschließen.
  if (u.kiTypen?.pakete.length)
    h.push({
      schluessel: 'ki.typen',
      art: 'info',
      text: (
        <>
          <strong>{t('pakete.ki.hinweis')}</strong> {t('pakete.ki.hinweis.text', { namen: u.kiTypen.pakete.map((p) => p.name).join(', ') })}
        </>
      ),
      ziel: `/werkbank/pakete/${u.kiTypen.pakete[0].id}`,
      knopf: t('pakete.ki.hinweis.knopf'),
      // Einheitlich (#1511): kommt nur einmal – „Zur Kenntnis nehmen“ schließt ihn ab.
      erledigen: t('werkbank.uebersicht.akzeptieren'),
    });
  // Im Einrichtungsassistenten übersprungen (#119): hier nachholen.
  const nachholen: Record<string, { text: string; ziel: string; knopf: string }> = {
    optional: {
      text: t('werkbank.uebersicht.adresse-e-mail-versand'),
      ziel: '/werkbank/betrieb',
      knopf: t('werkbank.uebersicht.zu-e-mail-und'),
    },
    // Pakete übersprungen: seit #1511 im Hinweis „Empfohlene Pakete“ (ältere Server ohne `empfohlenFehlt`: wie bisher).
    ...(u.empfohlenFehlt
      ? {}
      : {
          pakete: {
            text: t('werkbank.uebersicht.pakete-dazuholen-z-b'),
            ziel: '/werkbank/pakete',
            knopf: t('werkbank.uebersicht.zu-den-paketen'),
          },
        }),
  };
  for (const x of u.einrichtung?.uebersprungen ?? [])
    if (nachholen[x] && !(x === 'optional' && u.mail))
      h.push({
        schluessel: `einrichtung:${x}`,
        art: 'info',
        text: (
          <>
            <strong>{t('werkbank.uebersicht.aus-der-einrichtung-uebersprungen')}</strong> {nachholen[x].text}.
          </>
        ),
        ziel: nachholen[x].ziel,
        knopf: nachholen[x].knopf,
      });
  // Konzept Verwaltungsmodus, Punkt 7 (#821): Nach der Einrichtung eine zweite Person mit Verwaltungsrecht empfehlen –
  // ein Hinweis, kein Balken; „Nein, danke“ gilt dauerhaft.
  if (u.zweitePerson)
    h.push({
      schluessel: 'verwaltung.zweite-person',
      art: 'info',
      text: (
        <>
          <strong>{t('werkbank.uebersicht.zweite')}</strong> {t('werkbank.uebersicht.zweite.text')}
        </>
      ),
      ziel: '/werkbank/benutzer/neu',
      knopf: t('werkbank.uebersicht.zweite.knopf'),
      erledigen: t('werkbank.uebersicht.zweite.nein'),
    });
  // Überflüssige Umgebungsvariablen (#115, #119), je mit Grund (#478).
  const vh = variablenHinweis(u.variablen ?? []);
  if (vh)
    h.push({
      schluessel: 'variablen',
      art: 'info',
      text:
        vh.zeilen.length === 1 ? (
          <>
            <strong>{vh.titel}</strong> <span className="mono">{vh.zeilen[0].name}</span> – {vh.zeilen[0].grund}. {vh.schluss}
          </>
        ) : (
          <>
            <strong>{vh.titel}</strong>
            {vh.zeilen.map((z) => (
              <span key={z.name} style={{ display: 'block' }}>
                · <span className="mono">{z.name}</span> – {z.grund}
              </span>
            ))}
            {vh.schluss}
          </>
        ),
      ziel: vh.ziel,
      knopf: vh.knopf,
    });
}

/** Beschädigte (#1551) und angehaltene Pakete (#1563), Was Ablago darf nach dem Update (#1562). */
export function paketeUndDarf(u: WerkbankUebersicht, h: Hinweis[]) {
  // Beschädigte Pakete (#1551): am Paket stehen die Lösungen.
  const bs = u.beschaedigt ?? [];
  if (bs.length)
    h.push({
      schluessel: 'pakete.beschaedigt',
      art: 'warn',
      text: (
        <>
          <strong>{t('werkbank.pakete.beschaedigt.hinweis', { anzahl: bs.length })}</strong> {bs.map((x) => `„${x.name}“`).join(', ')}.{' '}
          {t('werkbank.pakete.beschaedigt.hinweis.text')}
        </>
      ),
      ziel: bs.length === 1 ? `/werkbank/pakete/${encodeURIComponent(bs[0].id)}` : '/werkbank/pakete',
      knopf: t('werkbank.pakete.beschaedigt.knopf'),
    });
  // Angehaltene Pakete (#1563): mit Grund in Worten; zum Paket (eines) bzw. zur Liste (mehrere).
  const ah = u.angehalten ?? [];
  if (ah.length)
    h.push({
      schluessel: 'pakete.angehalten',
      art: 'warn',
      text: (
        <>
          <strong>{t('werkbank.darf.angehalten.hinweis', { anzahl: ah.length })}</strong> {ah.map((x) => x.grund).join(' ')}{' '}
          {t('werkbank.darf.angehalten.text')}
        </>
      ),
      ziel: ah.length === 1 ? `/werkbank/pakete/${encodeURIComponent(ah[0].id)}` : '/werkbank/pakete',
      knopf: t('werkbank.darf.angehalten.knopf'),
    });
  // Was Ablago darf (#1562): einmal nach dem Update, bis jemand mit „Gesamte Verwaltung“ es zur Kenntnis nimmt.
  if (u.darfNeu)
    h.push({
      schluessel: 'darf.neu',
      art: 'info',
      text: (
        <>
          <strong>{t('werkbank.darf.hinweis.neu')}</strong> {t('werkbank.darf.hinweis.neu.text')}
        </>
      ),
      ziel: '/werkbank#was-ablago-darf',
      knopf: t('werkbank.darf.hinweis.neu.knopf'),
      erledigen: t('werkbank.uebersicht.akzeptieren'),
    });
}

/** E-Mail-Versand, Fehlermeldungen, Texterkennung (#459), Ersatzschriften (#1329). */
export function mailUndTexterkennung(u: WerkbankUebersicht, h: Hinweis[]) {
  if (!u.mail)
    h.push({
      schluessel: 'mail',
      art: 'warn',
      text: (
        <>{tn('werkbank.uebersicht.einladungen-die-taegliche', { b: <strong>{t('werkbank.uebersicht.der-e-mail-versand')}</strong> })}</>
      ),
      ziel: '/werkbank/betrieb',
      knopf: t('werkbank.uebersicht.e-mail-einrichten'),
    });
  // Empfohlene Pakete (#1511): nach dem E-Mail-Versand, ein Hinweis für alle fehlenden.
  empfohlenePakete(u, h);
  if (u.fehlermeldungen)
    h.push({
      schluessel: 'fehlermeldungen',
      art: 'warn',
      text: (
        <>
          {tn('werkbank.uebersicht.von-benutzern', {
            b: <strong>{t('werkbank.uebersicht.gemeldete-fehler', { anzahl: u.fehlermeldungen, zahl: zahl(u.fehlermeldungen) })}</strong>,
          })}
        </>
      ),
      ziel: '/werkbank/fehlermeldungen',
      knopf: t('werkbank.uebersicht.ansehen'),
    });
  // Texterkennung ist seit #459 ein Paket: ohne Paket deutlich, sobald Scans darauf warten, sonst als Hinweis. Ein
  // Umstiegs-Hinweis – nur für Installationen, die von einer älteren Version kommen (#1511); sonst „Empfohlene Pakete“.
  if (umstiegTexterkennung(u))
    h.push({
      schluessel: 'texterkennung.paket',
      art: u.texterkennung?.paket ? 'warn' : 'info',
      text: (
        <>
          <strong>{t('volltext.uebersicht.fehlt')}</strong> {t('volltext.uebersicht.fehlt.text')}
          {u.texterkennung?.paket ? ` ${t('volltext.werkbank.paket.ohne', { anzahl: u.texterkennung.paket })}` : ''}
        </>
      ),
      ziel: `/werkbank/pakete/${TEXTERKENNUNG_PAKET}`,
      knopf: t('volltext.uebersicht.fehlt.knopf'),
    });
  werkzeugeFehlen(u, h);
  if (u.texterkennung?.fehler)
    h.push({
      schluessel: 'texterkennung.fehler',
      art: 'warn',
      text: (
        <>
          {tn('werkbank.uebersicht.mit-fehler-in-der', {
            b: (
              <strong>{t('werkbank.uebersicht.dokumente', { anzahl: u.texterkennung.fehler, zahl: zahl(u.texterkennung.fehler) })}</strong>
            ),
          })}
        </>
      ),
      ziel: '/werkbank/texterkennung',
      knopf: t('werkbank.uebersicht.zur-texterkennung'),
    });
}

/**
 * Eingebaute Werkzeuge (#1189, #1312): je fehlendem Werkzeug eine Meldung mit Folge und Abhilfe – ohne Poppler kein Text
 * und keine Seitenbilder (rot), sonst gelb. Der Knopf führt zum Hinweis im Systemzustand mit „Erneut prüfen“. Die
 * Ersatzschriften (#1329) behalten ihren Schlüssel, damit eine Akzeptanz gilt; ältere Server melden nur `schriftenFehlen`.
 */
function werkzeugeFehlen(u: WerkbankUebersicht, h: Hinweis[]) {
  const fehlt = u.werkzeugeFehlen ?? (u.schriftenFehlen ? (['schriften'] as const) : []);
  for (const art of fehlt)
    h.push({
      schluessel: art === 'schriften' ? 'schriften.fehlen' : `werkzeug.fehlt:${art}`,
      art: art === 'poppler' ? 'schlecht' : 'warn',
      text: (
        <>
          <strong>{t.frei(`werkbank.werkzeuge.${art}.fehlt`)}</strong> {t.frei(`werkbank.werkzeuge.${art}.folge`)}{' '}
          {t('werkbank.werkzeuge.abhilfe', { anzahl: 1 })}
        </>
      ),
      ziel: '/werkbank/systemzustand#werkzeuge',
      knopf: t('werkbank.werkzeuge.zur-pruefung'),
    });
}

/** Aufgaben (#719, #798), fehlende Dateien (#877), unpassende Mappen. */
export function aufgabenUndMappen(u: WerkbankUebersicht, h: Hinweis[]) {
  // #719: Niemand im Alltag bekommt die Aufgaben ohne Empfänger, obwohl es Benutzer ohne Admin-Rechte gibt.
  if (u.aufgabenEmpfaenger && !u.aufgabenEmpfaenger.benutzerId && u.aufgabenEmpfaenger.moeglich > 0)
    h.push({
      schluessel: 'aufgabenempfaenger',
      art: 'info',
      text: <>{t('werkbank.aufgabenempfaenger.uebersicht')}</>,
      ziel: '/werkbank/benutzer',
      knopf: t('werkbank.aufgabenempfaenger.uebersicht.knopf'),
    });
  // #877: Dateien fehlen im Ablageordner (Volume vergessen, von Hand gelöscht, Platte defekt) – Einzelheiten im Protokoll.
  if (u.dateienFehlen)
    h.push({
      schluessel: 'dateien.fehlen',
      art: 'schlecht',
      text: (
        <>
          <strong>{t('werkbank.uebersicht.dateien-fehlen', { anzahl: u.dateienFehlen, zahl: zahl(u.dateienFehlen) })}</strong>{' '}
          {t('werkbank.uebersicht.dateien-fehlen.text')}
        </>
      ),
      ziel: '/werkbank/texterkennung#dateien',
      knopf: t('werkbank.uebersicht.dateien-fehlen.knopf'),
    });
  // #1316: „Alle Dateien prüfen“ (von Hand oder nach Zeitplan) hat Abweichungen gefunden.
  if (u.dateienBefund)
    h.push({
      schluessel: `dateien.befund:${u.dateienBefund.am}`,
      datum: u.dateienBefund.am,
      art: 'schlecht',
      text: (
        <>
          <strong>
            {t('werkbank.archiv.pruefplan.uebersicht', { abweichungen: u.dateienBefund.abweichungen, dateien: u.dateienBefund.dateien })}
          </strong>{' '}
          {t('werkbank.archiv.pruefplan.uebersicht.text', { datum: datum(u.dateienBefund.am) })}
        </>
      ),
      ziel: '/werkbank/texterkennung#dateien',
      knopf: t('werkbank.uebersicht.dateien-fehlen.knopf'),
    });
  // #798: Aufgaben bei Personen ohne Leserecht – Rechte richten oder Leserecht auf Zeit geben.
  if (u.ohneLeserecht)
    h.push({
      schluessel: 'aufgaben.ohne-leserecht',
      art: 'warn',
      text: (
        <>
          <strong>{t('werkbank.ohne-leserecht.offen', { anzahl: u.ohneLeserecht })}.</strong> {t('werkbank.ohne-leserecht.hinweis')}
        </>
      ),
      ziel: '/werkbank/aufgaben/ohne-leserecht',
      knopf: t('werkbank.ohne-leserecht.knopf'),
    });
  if (u.aufgaben.ohneEmpfaenger)
    h.push({
      schluessel: 'aufgaben.ohne-empfaenger',
      art: 'info',
      text: (
        <>
          {tn('werkbank.uebersicht.fuer-die-administratoren-ohne', {
            b: (
              <strong>
                {t('werkbank.uebersicht.aufgaben', { anzahl: u.aufgaben.ohneEmpfaenger, zahl: zahl(u.aufgaben.ohneEmpfaenger) })}
              </strong>
            ),
          })}
        </>
      ),
      ziel: '/ablage/eingang',
      knopf: t('werkbank.uebersicht.zu-erledigen-oeffnen'),
    });
  if (u.unpassend)
    h.push({
      schluessel: 'mappen.unpassend',
      art: 'info',
      text: (
        <>
          {tn('werkbank.uebersicht.nicht-zur-aktuellen-definition', {
            b: <strong>{t('werkbank.uebersicht.mappen-passen', { anzahl: u.unpassend, zahl: zahl(u.unpassend) })}</strong>,
          })}
        </>
      ),
      ziel: '/werkbank/typen',
      knopf: t('werkbank.uebersicht.zu-den-mappentypen'),
    });
}
