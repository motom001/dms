import { t, tn } from '../../sprache';
import { Hilfe } from '../../Hilfe';
import type { WerkbankUebersicht } from '../../api/betrieb';
import { ENGPASS_VARIABLE } from '../../../../shared/src/systemlast';
import { AufrufeUebersicht } from '../AutomatisierungAufruf';
import { datum, platzText, type Hinweis } from './hilfen';
import { eingangsordner, sicherungUndAnbindung, paketeUndEinrichtung, mailUndTexterkennung, aufgabenUndMappen } from './hinweise-betrieb';

export type { Hinweis } from './hilfen';

/** Alle Meldungen der Übersicht, ungeordnet; `ordneMeldungen` sortiert sie und trennt die akzeptierten ab (#816). */
export function hinweiseAus(u: WerkbankUebersicht, mitNotfallblatt = false): Hinweis[] {
  const h: Hinweis[] = [];
  notfallUndSpeicher(u, h);
  heimnetzGateway(u, h);
  proxyNetz(u, h);
  kennung(u, h);
  automatisierungen(u, h);
  lastUndWartung(u, h);
  tresorUndPostfaecher(u, h);
  eingangsordner(u, h);
  sicherungUndAnbindung(u, h, mitNotfallblatt);
  paketeUndEinrichtung(u, h);
  mailUndTexterkennung(u, h);
  aufgabenUndMappen(u, h);
  return h;
}

/** Notfallzugang und Notfallcode (#108, #815), Speicherplatz (#116). */
function notfallUndSpeicher(u: WerkbankUebersicht, h: Hinweis[]) {
  // Notfallzugang (#108): bis er umbenannt oder deaktiviert ist.
  for (const n of u.notfallzugaenge ?? [])
    h.push({
      schluessel: `notfallzugang:${n.id}`,
      datum: n.erstellt,
      art: 'schlecht',
      text: (
        <>
          {tn('werkbank.uebersicht.er-entstand-ueber-eine', {
            b: <strong>{t('werkbank.uebersicht.notfallzugang-ist-aktiv', { name: n.name })}</strong>,
            datum: datum(n.erstellt),
          })}
        </>
      ),
      ziel: `/werkbank/benutzer/${n.id}`,
      knopf: t('werkbank.uebersicht.zum-benutzer'),
    });
  // Notfallcode vom Notfallblatt benutzt (#815): bis jemand den Hinweis als gelesen markiert.
  for (const n of u.notfallcodeBenutzt ?? [])
    h.push({
      schluessel: `notfallzugang.benutzt:${n.id}`,
      datum: n.am,
      art: 'schlecht',
      text: (
        <>
          <strong>{t('werkbank.uebersicht.notfallcode', { datum: datum(n.am), name: n.name })}</strong>{' '}
          {t('werkbank.uebersicht.notfallcode.text')}
        </>
      ),
      ziel: `/werkbank/benutzer/${n.benutzerId}`,
      knopf: t('werkbank.uebersicht.notfallcode.knopf'),
      erledigen: t('werkbank.uebersicht.notfallcode.gelesen'),
    });
  // Speicherplatz (#116): Grenze, Warnschwelle, wieder genug Platz bei laufender Wartung.
  const sp = u.speicherplatz;
  if (sp?.zustand === 'grenze')
    h.push({
      schluessel: 'speicherplatz.grenze',
      art: 'schlecht',
      text: (
        <>
          {tn('werkbank.uebersicht.hochladen-ist-gesperrt-schaffe', {
            b: <strong>{t('werkbank.uebersicht.speicherplatzlimit-erreicht')}</strong>,
            wert:
              u.wartung?.ausloeser === 'speicherplatz'
                ? u.wartung.stufe === 'aktiv'
                  ? t('werkbank.uebersicht.der-wartungsmodus-laeuft')
                  : t('werkbank.uebersicht.der-wartungsmodus-beginnt-gleich')
                : '',
          })}
        </>
      ),
      ziel: '/werkbank/systemzustand',
      knopf: t('werkbank.uebersicht.zum-systemzustand'),
    });
  else if (sp?.zustand === 'warnung')
    h.push({
      schluessel: 'speicherplatz.knapp',
      art: 'warn',
      text: (
        <>
          {tn('werkbank.uebersicht.noch-frei-unter-der', {
            b: <strong>{t('werkbank.uebersicht.der-speicherplatz-wird-knapp')}</strong>,
            platzText: platzText(sp.ordner),
          })}
        </>
      ),
      ziel: '/werkbank/systemzustand',
      knopf: t('werkbank.uebersicht.zum-systemzustand'),
    });
}

/** Heimnetz nicht bestimmbar (#1355): Anfragen kommen mit der Gateway-Adresse des Docker-Netzes an. */
function heimnetzGateway(u: WerkbankUebersicht, h: Hinweis[]) {
  const g = u.heimnetzGateway;
  if (!g) return;
  h.push({
    schluessel: 'heimnetz.gateway',
    art: 'warn',
    text: (
      <>
        <strong>{t('werkbank.uebersicht.heimnetz-gateway')}</strong>{' '}
        {t('werkbank.uebersicht.heimnetz-gateway.text', { adresse: g.adresse, datum: datum(g.zuletzt) })}
      </>
    ),
    ziel: '/werkbank/anmeldeschutz#notfallzugang',
    knopf: t('werkbank.uebersicht.heimnetz-gateway.knopf'),
  });
}

/** Ganzes Netz in TRUST_PROXY statt der Adresse des Proxys (#1465): das Netz deckt das Gateway ab. */
function proxyNetz(u: WerkbankUebersicht, h: Hinweis[]) {
  const p = u.trustProxyNetz;
  if (!p) return;
  h.push({
    schluessel: 'proxy.netz',
    art: 'warn',
    text: (
      <>
        <strong>{t('werkbank.uebersicht.proxy-netz', { netz: p.netz })}</strong>{' '}
        {t('werkbank.uebersicht.proxy-netz.text', { adresse: p.adresse, datum: datum(p.zuletzt) })}
      </>
    ),
    ziel: '/werkbank/anmeldeschutz#notfallzugang',
    knopf: t('werkbank.uebersicht.heimnetz-gateway.knopf'),
  });
}

/** PUID/PGID fehlen und Datenordner liegen auf einem Bind-Mount (#1449): Zugriff über die Dateifreigabe des NAS. */
function kennung(u: WerkbankUebersicht, h: Hinweis[]) {
  const k = u.kennungHinweis;
  if (!k) return;
  h.push({
    schluessel: 'kennung.puid',
    art: 'warn',
    text: (
      <>
        <strong>{t('systemzustand.kennung.hinweis', { benutzer: k.benutzer, gruppe: k.gruppe })}</strong>{' '}
        {tn('systemzustand.kennung.hinweis.text', { ordner: k.ordner.join(', '), hilfe: <Hilfe ort="werkbank.ohne-root" /> })}
      </>
    ),
    ziel: '/werkbank/systemzustand#version',
    knopf: t('werkbank.uebersicht.zum-systemzustand'),
  });
}

/** Automatisierungen (#675) und Mappen-Abläufe (#1044). */
function automatisierungen(u: WerkbankUebersicht, h: Hinweis[]) {
  // Auslastung (#409): CPU oder Arbeitsspeicher seit 5 Minuten über 90 %.
  // Automatisierungen (#675): angehaltene zuerst, dann fehlgeschlagene Läufe.
  const au = u.automatisierungen;
  if (au?.angehalten.length)
    h.push({
      schluessel: 'automatisierung.angehalten',
      art: 'schlecht',
      text: (
        <>
          <strong>{t('automatisierung.ui.uebersicht.angehalten', { anzahl: au.angehalten.length })}</strong>{' '}
          {au.angehalten.map((x) => `„${x.name}“`).join(', ')}
        </>
      ),
      ziel: au.angehalten.length === 1 ? `/werkbank/automatisierungen/${au.angehalten[0].id}` : '/werkbank/automatisierungen',
      knopf: t('automatisierung.ui.uebersicht.knopf'),
    });
  // Mappen-Abläufe (#1044, Sicherheit): angehalten, weil die Person sie nicht mehr ausführen darf.
  const ab = u.ablaeufe?.angehalten ?? [];
  if (ab.length)
    h.push({
      schluessel: 'ablaeufe.angehalten',
      art: 'warn',
      text: (
        <>
          <strong>{t('automatisierung.vorlage.ui.uebersicht', { anzahl: ab.length })}</strong>{' '}
          {t('automatisierung.vorlage.ui.uebersicht.text')}
        </>
      ),
      ziel: `/werkbank/ablaufvorlagen/${encodeURIComponent(ab[0].vorlage)}`,
      knopf: t('automatisierung.vorlage.ui.uebersicht.knopf'),
    });
  if (au?.umgezogen)
    h.push({
      schluessel: 'automatisierung.umgezogen',
      datum: au.umgezogen.am,
      art: 'info',
      text: (
        <>
          <strong>{t('automatisierung.ui.umgezogen', { anzahl: au.umgezogen.anzahl })}</strong> {t('automatisierung.ui.umgezogen.text')}
        </>
      ),
      ziel: '/werkbank/automatisierungen',
      knopf: t('automatisierung.ui.uebersicht.knopf'),
    });
  // #678: Ohne Paket „Benachrichtigungen“ schickt niemand die Tägliche Zusammenfassung. Fehlt das Paket, steht es seit
  // #1511 unter „Empfohlene Pakete“ – dann weder dieser Hinweis noch „Post für dich“.
  const ohnePaket = !!u.empfohlenFehlt?.includes('benachrichtigungen');
  if (ohnePaket) return automatisierungenRest(au, h);
  if (au?.ohneBenachrichtigungen)
    h.push({
      schluessel: 'automatisierung.ohne-benachrichtigungen',
      art: 'info',
      text: (
        <>
          <strong>{t('automatisierung.ui.ohne-benachrichtigungen')}</strong> {t('automatisierung.ui.ohne-benachrichtigungen.text')}
        </>
      ),
      ziel: '/werkbank/pakete',
      knopf: t('automatisierung.ui.ohne-benachrichtigungen.knopf'),
    });
  // #1001: „Post für dich“ legt nur noch eine Automatisierung an – das Paket fehlt, ist älter als 1.3.0 oder sie ist aus.
  else if (au?.ohnePostFuerDich)
    h.push({
      schluessel: 'automatisierung.ohne-post-fuer-dich',
      art: 'info',
      text: (
        <>
          <strong>{t('automatisierung.ui.ohne-post-fuer-dich')}</strong> {t('automatisierung.ui.ohne-post-fuer-dich.text')}
        </>
      ),
      ziel: '/werkbank/automatisierungen',
      knopf: t('automatisierung.ui.uebersicht.knopf'),
    });
  automatisierungenRest(au, h);
}

/** Aufrufe von außen (#679) und fehlgeschlagene Läufe (#675). */
function automatisierungenRest(au: WerkbankUebersicht['automatisierungen'], h: Hinweis[]) {
  // Aufruf von außen (#679): Adressen ohne Anmeldung – sichtbar, mit „Alle abschalten“ (ein Klick); nicht wegzuklicken.
  if (au?.aufrufe?.length)
    h.push({
      schluessel: `automatisierung.aufrufe:${au.aufrufe
        .map((x) => x.id)
        .sort()
        .join(',')}`,
      art: 'info',
      text: <AufrufeUebersicht liste={au.aufrufe} />,
      ziel: '/werkbank/automatisierungen',
      knopf: t('automatisierung.ui.uebersicht.knopf'),
      erledigen: t('automatisierung.ui.uebersicht.aufrufe.abschalten'),
    });
  if (au?.fehlgeschlagen)
    h.push({
      schluessel: 'automatisierung.fehlgeschlagen',
      art: 'warn',
      text: (
        <>
          <strong>{t('automatisierung.ui.uebersicht.fehlgeschlagen', { anzahl: au.fehlgeschlagen })}</strong>{' '}
          {t('automatisierung.ui.uebersicht.fehlgeschlagen.text')}
        </>
      ),
      ziel: '/werkbank/automatisierungen',
      knopf: t('automatisierung.ui.uebersicht.knopf'),
    });
}

/** Auslastung (#409), Engpässe (#544), Erweiterungen (#562), Wartung. */
function lastUndWartung(u: WerkbankUebersicht, h: Hinweis[]) {
  const sp = u.speicherplatz;
  if (u.auslastung?.length)
    h.push({
      schluessel: 'auslastung',
      art: 'warn',
      text: (
        <>
          <strong>{t('systemzustand.warnung.uebersicht')}</strong> {u.auslastung.map((w) => t.frei(`systemzustand.warnung.${w}`)).join(' ')}
        </>
      ),
      ziel: '/werkbank/systemzustand#auslastung',
      knopf: t('systemzustand.warnung.knopf'),
    });
  // Engpässe (#544): je mit der Umgebungsvariable, die man ändern müsste.
  if (u.engpaesse?.length)
    h.push({
      schluessel: 'engpass',
      art: 'warn',
      text: (
        <>
          <strong>{t('systemzustand.engpass.uebersicht')}</strong> {[...new Set(u.engpaesse.map((e) => ENGPASS_VARIABLE[e]))].join(', ')}
        </>
      ),
      ziel: '/werkbank/systemzustand#engpass',
      knopf: t('systemzustand.warnung.knopf'),
    });
  // Erweiterungen der Suche (#562): fehlen oder lägen im Schema, das eine Wiederherstellung löscht.
  if (u.erweiterungen?.length)
    h.push({
      schluessel: 'erweiterungen',
      art: 'warn',
      text: (
        <>
          <strong>{t('systemzustand.erweiterung.uebersicht')}</strong> {u.erweiterungen.map((e) => e.name).join(', ')}
        </>
      ),
      ziel: '/werkbank/systemzustand#erweiterungen',
      knopf: t('systemzustand.warnung.knopf'),
    });
  if (sp?.wartungBeenden)
    h.push({
      schluessel: 'speicherplatz.wartung-beenden',
      art: 'warn',
      text: (
        <>
          {tn('werkbank.uebersicht.der-wartungsmodus-wegen-des', {
            b: <strong>{t('werkbank.uebersicht.wieder-frei', { platzText: platzText(sp.ordner) })}</strong>,
          })}
        </>
      ),
      ziel: '/werkbank/systemzustand',
      knopf: t('werkbank.uebersicht.wartung-beenden'),
    });
  if (u.wartung && u.wartung.stufe !== 'aus' && !sp?.wartungBeenden)
    h.push({
      schluessel: 'wartung',
      art: 'warn',
      text: (
        <>
          <strong>
            {t('werkbank.uebersicht.der-wartungsmodus-ist', {
              wert: u.wartung.stufe === 'aktiv' ? t('werkbank.uebersicht.aktiv') : t('werkbank.uebersicht.angekuendigt'),
            })}
          </strong>{' '}
          {u.wartung.stufe === 'aktiv'
            ? t('werkbank.uebersicht.nur-administratoren-koennen-arbeiten')
            : t('werkbank.uebersicht.bald-werden-alle-anderen')}
        </>
      ),
      ziel: '/werkbank/wartung#wartungsmodus',
      knopf: t('werkbank.uebersicht.zum-wartungsmodus'),
    });
}

/** Schlüssel für Passwörter (#39) und Anmeldung der Postfächer (#358). */
function tresorUndPostfaecher(u: WerkbankUebersicht, h: Hinweis[]) {
  const tr = u.tresor;
  if (tr && tr.zustand === 'fehlt')
    h.push({
      schluessel: 'tresor.fehlt',
      art: 'warn',
      text: <>{tn('werkbank.uebersicht.bis-dahin-lassen-sich', { b: <strong>{t('werkbank.uebersicht.es-gibt-noch-keinen')}</strong> })}</>,
      ziel: '/werkbank/verschluesselung',
      knopf: t('werkbank.uebersicht.zur-verschluesselung'),
    });
  else if (tr && tr.zustand === 'verloren')
    h.push({
      schluessel: 'tresor.verloren',
      art: 'schlecht',
      text: (
        <>
          {tn('werkbank.uebersicht.gespeicherte-passwoerter-sind-nicht', {
            b: <strong>{t('werkbank.uebersicht.der-schluessel-fuer-passwoerter')}</strong>,
          })}
        </>
      ),
      ziel: '/werkbank/verschluesselung',
      knopf: t('werkbank.uebersicht.zur-verschluesselung'),
    });
  else if (tr && tr.zustand === 'falsch')
    h.push({
      schluessel: 'tresor.falsch',
      art: 'schlecht',
      text: (
        <>
          <strong>{t('werkbank.uebersicht.die-schluesseldatei-passt-nicht')}</strong>
        </>
      ),
      ziel: '/werkbank/verschluesselung',
      knopf: t('werkbank.uebersicht.zur-verschluesselung'),
    });
  else if (tr && tr.eingebunden === false)
    h.push({
      schluessel: 'tresor.volume',
      art: 'warn',
      text: (
        <>
          {tn('werkbank.uebersicht.wird-der-container-neu', {
            b: <strong>{t('werkbank.uebersicht.die-schluesseldatei-liegt-nicht')}</strong>,
          })}
        </>
      ),
      ziel: '/werkbank/verschluesselung',
      knopf: t('werkbank.uebersicht.zur-verschluesselung'),
    });
  else if (tr && tr.betroffen)
    h.push({
      schluessel: 'tresor.betroffen',
      art: 'warn',
      text: (
        <>
          <strong>{t('werkbank.uebersicht.passwoerter-sind-nicht-lesbar', { anzahl: tr.betroffen })}</strong>
        </>
      ),
      ziel: '/werkbank/verschluesselung',
      knopf: t('werkbank.uebersicht.zur-verschluesselung'),
    });
  // Postfächer mit OAuth (#358): Anmeldung abgelaufen/entzogen oder noch nicht erfolgt – bis dahin kein Abruf.
  for (const p of u.postfachAnmeldung ?? [])
    h.push(
      p.zustand === 'abgelaufen'
        ? {
            schluessel: `postfach.abgelaufen:${p.id}`,
            art: 'schlecht',
            text: (
              <>
                {tn('werkbank.uebersicht.bis-zur-neuen-anmeldung', {
                  b: <strong>{t('werkbank.uebersicht.postfach-die-anmeldung-ist', { name: p.name })}</strong>,
                })}
              </>
            ),
            ziel: `/werkbank/postfaecher/${p.id}`,
            knopf: t('werkbank.uebersicht.neu-anmelden'),
          }
        : {
            schluessel: `postfach.anmelden:${p.id}`,
            art: 'warn',
            text: (
              <>
                {tn('werkbank.uebersicht.mit-oauth-2-0', {
                  b: <strong>{t('werkbank.uebersicht.postfach-ist-noch-nicht', { name: p.name })}</strong>,
                })}
              </>
            ),
            ziel: `/werkbank/postfaecher/${p.id}`,
            knopf: t('werkbank.uebersicht.anmelden'),
          },
    );
}
