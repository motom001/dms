import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, type WerkbankUebersicht } from '../api';
import { Link } from '../ort';
import { t, tn } from '../sprache';
import { useHandbuch } from '../Hilfe';
import { Listenkopf } from '../Listenkopf';
import { sicherungsHinweise } from './Sicherung';
import { exportHinweise } from './Vollexport';
import { bereichPasst, GRUPPEN, type Gruppe } from '../../../shared/src/werkbankansicht';
import { variablenHinweis } from '../../../shared/src/umgebungsvariablen';
import { ENGPASS_VARIABLE } from '../../../shared/src/systemlast';
import { TEXTERKENNUNG_PAKET } from '../../../shared/src/volltext';
import { akzeptierbar, GRUND_MAX, ordneMeldungen, type Akzeptiert, type Schwere } from '../../../shared/src/meldungen';
import { gebietsschema } from '../../../shared/src/sprache';

/**
 * Werkbank → Übersicht (#68): was zu tun ist, auf einen Blick; Gruppen der Leiste.
 * Seit #816: oben die Kacheln, darunter die Meldungen nach Schwere (rot → gelb → Hinweis); gelbe Warnungen und
 * Hinweise lassen sich bewusst akzeptieren und stehen dann eingeklappt ganz unten.
 */



const zahl = (n: number) => n.toLocaleString(gebietsschema());
const datum = (iso: string) => new Date(iso).toLocaleDateString(gebietsschema(), { dateStyle: 'medium' });
const bytes = (b: number) => (b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(0)} MB` : `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB`);

const platzText = (o: Array<{ frei: number | null }>) => {
  const f = Math.min(...o.map((x) => x.frei ?? Infinity));
  return Number.isFinite(f) ? bytes(f) : t('werkbank.uebersicht.genug-platz');
};

/** Eine Meldung der Übersicht; `schluessel` bleibt je Meldungsart gleich (#816: Akzeptieren), `datum` sortiert innerhalb der Stufe. */
export interface Hinweis {
  schluessel: string; art: Schwere; text: ReactNode; ziel: string; knopf: string; datum?: string | null;
  /** Statt „Zur Kenntnis nehmen“: ein Knopf, der den Hinweis endgültig abschließt (#821 „Nein, danke“, #815 „Gelesen“). */
  erledigen?: string;
}

/** Alle Meldungen der Übersicht, ungeordnet; `ordneMeldungen` sortiert sie und trennt die akzeptierten ab (#816). */
export function hinweiseAus(u: WerkbankUebersicht): Hinweis[] {
  const h: Hinweis[] = [];
  const tr = u.tresor;
  // Notfallzugang (#108): bis er umbenannt oder deaktiviert ist.
  for (const n of u.notfallzugaenge ?? []) h.push({ schluessel: `notfallzugang:${n.id}`, datum: n.erstellt, art: 'schlecht', text: <>{tn('werkbank.uebersicht.er-entstand-ueber-eine', { b: <strong>{t('werkbank.uebersicht.notfallzugang-ist-aktiv', { name: n.name })}</strong>, datum: datum(n.erstellt) })}</>, ziel: `/werkbank/benutzer/${n.id}`, knopf: t('werkbank.uebersicht.zum-benutzer') });
  // Notfallcode vom Notfallblatt benutzt (#815): bis jemand den Hinweis als gelesen markiert.
  for (const n of u.notfallcodeBenutzt ?? []) h.push({ schluessel: `notfallzugang.benutzt:${n.id}`, datum: n.am, art: 'schlecht', text: <><strong>{t('werkbank.uebersicht.notfallcode', { datum: datum(n.am), name: n.name })}</strong> {t('werkbank.uebersicht.notfallcode.text')}</>, ziel: `/werkbank/benutzer/${n.benutzerId}`, knopf: t('werkbank.uebersicht.notfallcode.knopf'), erledigen: t('werkbank.uebersicht.notfallcode.gelesen') });
  // Speicherplatz (#116): Grenze, Warnschwelle, wieder genug Platz bei laufender Wartung.
  const sp = u.speicherplatz;
  if (sp?.zustand === 'grenze') h.push({ schluessel: 'speicherplatz.grenze', art: 'schlecht', text: <>{tn('werkbank.uebersicht.hochladen-ist-gesperrt-schaffe', { b: <strong>{t('werkbank.uebersicht.speicherplatzlimit-erreicht')}</strong>, wert: u.wartung?.ausloeser === 'speicherplatz' ? (u.wartung.stufe === 'aktiv' ? t('werkbank.uebersicht.der-wartungsmodus-laeuft') : t('werkbank.uebersicht.der-wartungsmodus-beginnt-gleich')) : '' })}</>, ziel: '/werkbank/systemzustand', knopf: t('werkbank.uebersicht.zum-systemzustand') });
  else if (sp?.zustand === 'warnung') h.push({ schluessel: 'speicherplatz.knapp', art: 'warn', text: <>{tn('werkbank.uebersicht.noch-frei-unter-der', { b: <strong>{t('werkbank.uebersicht.der-speicherplatz-wird-knapp')}</strong>, platzText: platzText(sp.ordner) })}</>, ziel: '/werkbank/systemzustand', knopf: t('werkbank.uebersicht.zum-systemzustand') });
  // Auslastung (#409): CPU oder Arbeitsspeicher seit 5 Minuten über 90 %.
  // Automatisierungen (#675): angehaltene zuerst, dann fehlgeschlagene Läufe.
  const au = u.automatisierungen;
  if (au?.angehalten.length) h.push({ schluessel: 'automatisierung.angehalten', art: 'schlecht', text: <><strong>{t('automatisierung.ui.uebersicht.angehalten', { anzahl: au.angehalten.length })}</strong> {au.angehalten.map((x) => `„${x.name}“`).join(', ')}</>, ziel: au.angehalten.length === 1 ? `/werkbank/automatisierungen/${au.angehalten[0].id}` : '/werkbank/automatisierungen', knopf: t('automatisierung.ui.uebersicht.knopf') });
  if (au?.umgezogen) h.push({ schluessel: 'automatisierung.umgezogen', datum: au.umgezogen.am, art: 'info', text: <><strong>{t('automatisierung.ui.umgezogen', { anzahl: au.umgezogen.anzahl })}</strong> {t('automatisierung.ui.umgezogen.text')}</>, ziel: '/werkbank/automatisierungen', knopf: t('automatisierung.ui.uebersicht.knopf') });
  // #678: Ohne Paket „Benachrichtigungen“ schickt niemand die Tägliche Zusammenfassung.
  if (au?.ohneBenachrichtigungen) h.push({ schluessel: 'automatisierung.ohne-benachrichtigungen', art: 'info', text: <><strong>{t('automatisierung.ui.ohne-benachrichtigungen')}</strong> {t('automatisierung.ui.ohne-benachrichtigungen.text')}</>, ziel: '/werkbank/pakete', knopf: t('automatisierung.ui.ohne-benachrichtigungen.knopf') });
  if (au?.fehlgeschlagen) h.push({ schluessel: 'automatisierung.fehlgeschlagen', art: 'warn', text: <><strong>{t('automatisierung.ui.uebersicht.fehlgeschlagen', { anzahl: au.fehlgeschlagen })}</strong> {t('automatisierung.ui.uebersicht.fehlgeschlagen.text')}</>, ziel: '/werkbank/automatisierungen', knopf: t('automatisierung.ui.uebersicht.knopf') });
  if (u.auslastung?.length) h.push({ schluessel: 'auslastung', art: 'warn', text: <><strong>{t('systemzustand.warnung.uebersicht')}</strong> {u.auslastung.map((w) => t.frei(`systemzustand.warnung.${w}`)).join(' ')}</>, ziel: '/werkbank/systemzustand#auslastung', knopf: t('systemzustand.warnung.knopf') });
  // Engpässe (#544): je mit der Umgebungsvariable, die man ändern müsste.
  if (u.engpaesse?.length) h.push({ schluessel: 'engpass', art: 'warn', text: <><strong>{t('systemzustand.engpass.uebersicht')}</strong> {[...new Set(u.engpaesse.map((e) => ENGPASS_VARIABLE[e]))].join(', ')}</>, ziel: '/werkbank/systemzustand#engpass', knopf: t('systemzustand.warnung.knopf') });
  // Erweiterungen der Suche (#562): fehlen oder lägen im Schema, das eine Wiederherstellung löscht.
  if (u.erweiterungen?.length) h.push({ schluessel: 'erweiterungen', art: 'warn', text: <><strong>{t('systemzustand.erweiterung.uebersicht')}</strong> {u.erweiterungen.map((e) => e.name).join(', ')}</>, ziel: '/werkbank/systemzustand#erweiterungen', knopf: t('systemzustand.warnung.knopf') });
  if (sp?.wartungBeenden) h.push({ schluessel: 'speicherplatz.wartung-beenden', art: 'warn', text: <>{tn('werkbank.uebersicht.der-wartungsmodus-wegen-des', { b: <strong>{t('werkbank.uebersicht.wieder-frei', { platzText: platzText(sp.ordner) })}</strong> })}</>, ziel: '/werkbank/systemzustand', knopf: t('werkbank.uebersicht.wartung-beenden') });
  if (u.wartung && u.wartung.stufe !== 'aus' && !sp?.wartungBeenden) h.push({ schluessel: 'wartung', art: 'warn', text: <><strong>{t('werkbank.uebersicht.der-wartungsmodus-ist', { wert: u.wartung.stufe === 'aktiv' ? t('werkbank.uebersicht.aktiv') : t('werkbank.uebersicht.angekuendigt') })}</strong> {u.wartung.stufe === 'aktiv' ? t('werkbank.uebersicht.nur-administratoren-koennen-arbeiten') : t('werkbank.uebersicht.bald-werden-alle-anderen')}</>, ziel: '/werkbank/wartung#wartungsmodus', knopf: t('werkbank.uebersicht.zum-wartungsmodus') });
  if (tr && tr.zustand === 'fehlt') h.push({ schluessel: 'tresor.fehlt', art: 'warn', text: <>{tn('werkbank.uebersicht.bis-dahin-lassen-sich', { b: <strong>{t('werkbank.uebersicht.es-gibt-noch-keinen')}</strong> })}</>, ziel: '/werkbank/verschluesselung', knopf: t('werkbank.uebersicht.zur-verschluesselung') });
  else if (tr && tr.zustand === 'verloren') h.push({ schluessel: 'tresor.verloren', art: 'schlecht', text: <>{tn('werkbank.uebersicht.gespeicherte-passwoerter-sind-nicht', { b: <strong>{t('werkbank.uebersicht.der-schluessel-fuer-passwoerter')}</strong> })}</>, ziel: '/werkbank/verschluesselung', knopf: t('werkbank.uebersicht.zur-verschluesselung') });
  else if (tr && tr.zustand === 'falsch') h.push({ schluessel: 'tresor.falsch', art: 'schlecht', text: <><strong>{t('werkbank.uebersicht.die-schluesseldatei-passt-nicht')}</strong></>, ziel: '/werkbank/verschluesselung', knopf: t('werkbank.uebersicht.zur-verschluesselung') });
  else if (tr && tr.eingebunden === false) h.push({ schluessel: 'tresor.volume', art: 'warn', text: <>{tn('werkbank.uebersicht.wird-der-container-neu', { b: <strong>{t('werkbank.uebersicht.die-schluesseldatei-liegt-nicht')}</strong> })}</>, ziel: '/werkbank/verschluesselung', knopf: t('werkbank.uebersicht.zur-verschluesselung') });
  else if (tr && tr.betroffen) h.push({ schluessel: 'tresor.betroffen', art: 'warn', text: <><strong>{t('werkbank.uebersicht.passwoerter-sind-nicht-lesbar', { anzahl: tr.betroffen })}</strong></>, ziel: '/werkbank/verschluesselung', knopf: t('werkbank.uebersicht.zur-verschluesselung') });
  // Postfächer mit OAuth (#358): Anmeldung abgelaufen/entzogen oder noch nicht erfolgt – bis dahin kein Abruf.
  for (const p of u.postfachAnmeldung ?? []) h.push(p.zustand === 'abgelaufen'
    ? { schluessel: `postfach.abgelaufen:${p.id}`, art: 'schlecht', text: <>{tn('werkbank.uebersicht.bis-zur-neuen-anmeldung', { b: <strong>{t('werkbank.uebersicht.postfach-die-anmeldung-ist', { name: p.name })}</strong> })}</>, ziel: `/werkbank/postfaecher/${p.id}`, knopf: t('werkbank.uebersicht.neu-anmelden') }
    : { schluessel: `postfach.anmelden:${p.id}`, art: 'warn', text: <>{tn('werkbank.uebersicht.mit-oauth-2-0', { b: <strong>{t('werkbank.uebersicht.postfach-ist-noch-nicht', { name: p.name })}</strong> })}</>, ziel: `/werkbank/postfaecher/${p.id}`, knopf: t('werkbank.uebersicht.anmelden') });
  // Eingangsordner (#915): gelbe Warnungen (zu alt, zu groß, fehler/, zu viele); der Knopf zeigt den Baum je Ordner.
  const eo = u.eingangsordner;
  if (eo) {
    const werte = { tage: eo.grenzen.tage, datum: eo.aeltester ? datum(eo.aeltester) : '–', groesse: bytes(eo.bytes), gb: eo.grenzen.gb.toLocaleString(gebietsschema()), grenze: zahl(eo.grenzen.dateien) };
    for (const w of eo.warnungen) {
      const anzahl = w === 'fehler' ? eo.fehler : eo.dateien;
      h.push({ schluessel: `eingangsordner.${w}`, art: 'warn', text: <><strong>{t.frei(`werkbank.uebersicht.eingangsordner.${w}`, { ...werte, anzahl, zahl: zahl(anzahl) })}</strong> {t.frei(`werkbank.uebersicht.eingangsordner.${w}.text`, werte)}</>, ziel: '/werkbank/eingangsordner#ueberwachung', knopf: t('werkbank.uebersicht.eingangsordner.knopf') });
    }
    // Post ohne „Für“ aus einem Ordner, der zu keinem Benutzer gehört (bisher galten auch Vornamen).
    for (const o of eo.ohnePerson) h.push({ schluessel: `eingangsordner.ohne-person:${o}`, art: 'warn', text: <><strong>{t('werkbank.eingangsordner.ohne-person', { ordner: o })}</strong> {t('werkbank.eingangsordner.ohne-person.text')}</>, ziel: '/werkbank/eingangsordner#personen', knopf: t('werkbank.uebersicht.eingangsordner.zum-ordner') });
    for (const x of eo.umbenennen) h.push({ schluessel: `eingangsordner.umbenennen:${x.neu}`, art: 'warn', text: <><strong>{t('werkbank.eingangsordner.umbenennen', { alt: x.alt, neu: x.neu })}</strong> {t('werkbank.eingangsordner.umbenennen.text')}</>, ziel: '/werkbank/eingangsordner#personen', knopf: t('werkbank.uebersicht.eingangsordner.zum-ordner') });
  }
  // Sicherung (#105): fehlgeschlagen, zu alt, Notfallblatt, Speicherort. Das Notfallblatt führt zur Verschlüsselung (#993).
  if (u.sicherung) for (const x of sicherungsHinweise(u.sicherung)) h.push({ ...x, ziel: x.ziel ?? '/werkbank/sicherung', knopf: x.knopf ?? t('werkbank.uebersicht.zur-sicherung') });
  // Export-Ordner (#797): im Sicherungsordner, oder Exporte beim Update von dort verschoben.
  if (u.exporte) for (const x of exportHinweise(u.exporte)) h.push({ ...x, ziel: '/werkbank/vollexport', knopf: t('werkbank.export.knopf') });
  // #128: API-Schlüssel gehören zu normalen Benutzern.
  // dms-komplett ohne Volume für /data/postgres (#943): rot, lässt sich nicht akzeptieren. Die Anleitung zum Retten
  // verlinkt die Seite Datenbank-Anbindung (hier stünde ein Link im Link).
  if (u.anbindung?.ohneVolume) h.push({ schluessel: 'datenbank.ohne-volume', art: 'schlecht', text: <><strong>{t('werkbank.uebersicht.datenbank-ohne-volume')}</strong> {t('werkbank.uebersicht.datenbank-ohne-volume.text')}</>, ziel: '/werkbank/anbindung', knopf: t('werkbank.uebersicht.zur-anbindung') });
  // Datenbank-Anbindung (#119)
  if (u.anbindung?.umgebung === 'abweichend') h.push({ schluessel: 'anbindung.abweichend', art: 'warn', text: <>{tn('werkbank.uebersicht.fuehrend-ist-die-anbindung', { b: <strong>{t('werkbank.uebersicht.database-url-weicht-von')}</strong> })}</>, ziel: '/werkbank/anbindung', knopf: t('werkbank.uebersicht.zur-anbindung') });
  if (u.anbindung?.neustartNoetig) h.push({ schluessel: 'anbindung.neustart', art: 'warn', text: <>{tn('werkbank.uebersicht.und-gilt-erst-nach', { b: <strong>{t('werkbank.uebersicht.die-datenbank-anbindung-ist')}</strong> })}</>, ziel: '/werkbank/anbindung', knopf: t('werkbank.uebersicht.zur-anbindung') });
  // DMS_LASTTEST in einer echten Installation (#612): Der Lasttest ist nicht gestartet, das DMS läuft normal.
  if (u.lasttestAbbruch) h.push({ schluessel: 'lasttest', art: 'warn', text: <><strong>{t('lasttest.uebersicht')}</strong> {u.lasttestAbbruch} {t('lasttest.uebersicht.text')}</>, ziel: '/werkbank/systemzustand#version', knopf: t('lasttest.uebersicht.knopf') });
  // Pflicht-Einstellungen eines Pakets fehlen (#405, z. B. im Ablauf „später ausfüllen“): bis sie da sind, läuft das Paket nicht.
  for (const p of u.paketeEinstellungen ?? []) h.push({ schluessel: `paket-einstellungen:${p.id}`, art: 'warn', text: <><strong>{t('pakete.ablauf.aufgabe', { name: p.name })}</strong> {t('pakete.ablauf.aufgabe.text')}</>, ziel: `/werkbank/pakete/${p.id}?reiter=einstellungen`, knopf: t('pakete.ablauf.aufgabe.knopf') });
  // KI-Dienste (#796): Nach dem Update einmal – bestehende Mappentypen gehen weiter an KI-Pakete, lassen sich aber ausschließen.
  if (u.kiTypen?.pakete.length) h.push({ schluessel: 'ki.typen', art: 'info', text: <><strong>{t('pakete.ki.hinweis')}</strong> {t('pakete.ki.hinweis.text', { namen: u.kiTypen.pakete.map((p) => p.name).join(', ') })}</>, ziel: `/werkbank/pakete/${u.kiTypen.pakete[0].id}`, knopf: t('pakete.ki.hinweis.knopf'), erledigen: t('pakete.ki.hinweis.verstanden') });
  // Im Einrichtungsassistenten übersprungen (#119): hier nachholen.
  const nachholen: Record<string, { text: string; ziel: string; knopf: string }> = {
    optional: { text: t('werkbank.uebersicht.adresse-e-mail-versand'), ziel: '/werkbank/betrieb', knopf: t('werkbank.uebersicht.zu-e-mail-und') },
    pakete: { text: t('werkbank.uebersicht.pakete-dazuholen-z-b'), ziel: '/werkbank/pakete', knopf: t('werkbank.uebersicht.zu-den-paketen') },
  };
  for (const x of u.einrichtung?.uebersprungen ?? []) if (nachholen[x] && !(x === 'optional' && u.mail)) h.push({ schluessel: `einrichtung:${x}`, art: 'info', text: <><strong>{t('werkbank.uebersicht.aus-der-einrichtung-uebersprungen')}</strong> {nachholen[x].text}.</>, ziel: nachholen[x].ziel, knopf: nachholen[x].knopf });
  // Konzept Verwaltungsmodus, Punkt 7 (#821): Nach der Einrichtung eine zweite Person mit Verwaltungsrecht empfehlen –
  // ein Hinweis, kein Balken; „Nein, danke“ gilt dauerhaft.
  if (u.zweitePerson) h.push({ schluessel: 'verwaltung.zweite-person', art: 'info', text: <><strong>{t('werkbank.uebersicht.zweite')}</strong> {t('werkbank.uebersicht.zweite.text')}</>, ziel: '/werkbank/benutzer/neu', knopf: t('werkbank.uebersicht.zweite.knopf'), erledigen: t('werkbank.uebersicht.zweite.nein') });
  // Überflüssige Umgebungsvariablen (#115, #119), je mit Grund (#478).
  const vh = variablenHinweis(u.variablen ?? []);
  if (vh) h.push({ schluessel: 'variablen', art: 'info', text: vh.zeilen.length === 1
    ? <><strong>{vh.titel}</strong> <span className="mono">{vh.zeilen[0].name}</span> – {vh.zeilen[0].grund}. {vh.schluss}</>
    : <><strong>{vh.titel}</strong>{vh.zeilen.map((z) => <span key={z.name} style={{ display: 'block' }}>· <span className="mono">{z.name}</span> – {z.grund}</span>)}{vh.schluss}</>, ziel: vh.ziel, knopf: vh.knopf });
  if (!u.mail) h.push({ schluessel: 'mail', art: 'warn', text: <>{tn('werkbank.uebersicht.einladungen-die-taegliche', { b: <strong>{t('werkbank.uebersicht.der-e-mail-versand')}</strong> })}</>, ziel: '/werkbank/betrieb', knopf: t('werkbank.uebersicht.e-mail-einrichten') });
  if (u.fehlermeldungen) h.push({ schluessel: 'fehlermeldungen', art: 'warn', text: <>{tn('werkbank.uebersicht.von-benutzern', { b: <strong>{t('werkbank.uebersicht.gemeldete-fehler', { anzahl: u.fehlermeldungen, zahl: zahl(u.fehlermeldungen) })}</strong> })}</>, ziel: '/werkbank/fehlermeldungen', knopf: t('werkbank.uebersicht.ansehen') });
  // Texterkennung ist seit #459 ein Paket: ohne Paket deutlich, sobald Scans darauf warten, sonst als Hinweis.
  if (u.texterkennungPaket === false) h.push({ schluessel: 'texterkennung.paket', art: u.texterkennung?.paket ? 'warn' : 'info', text: <><strong>{t('volltext.uebersicht.fehlt')}</strong> {t('volltext.uebersicht.fehlt.text')}{u.texterkennung?.paket ? ` ${t('volltext.werkbank.paket.ohne', { anzahl: u.texterkennung.paket })}` : ''}</>, ziel: `/werkbank/pakete/${TEXTERKENNUNG_PAKET}`, knopf: t('volltext.uebersicht.fehlt.knopf') });
  if (u.texterkennung?.fehler) h.push({ schluessel: 'texterkennung.fehler', art: 'warn', text: <>{tn('werkbank.uebersicht.mit-fehler-in-der', { b: <strong>{t('werkbank.uebersicht.dokumente', { anzahl: u.texterkennung.fehler, zahl: zahl(u.texterkennung.fehler) })}</strong> })}</>, ziel: '/werkbank/texterkennung', knopf: t('werkbank.uebersicht.zur-texterkennung') });
  // #719: Niemand im Alltag bekommt die Aufgaben ohne Empfänger, obwohl es Benutzer ohne Admin-Rechte gibt.
  if (u.aufgabenEmpfaenger && !u.aufgabenEmpfaenger.benutzerId && u.aufgabenEmpfaenger.moeglich > 0) h.push({ schluessel: 'aufgabenempfaenger', art: 'info', text: <>{t('werkbank.aufgabenempfaenger.uebersicht')}</>, ziel: '/werkbank/benutzer', knopf: t('werkbank.aufgabenempfaenger.uebersicht.knopf') });
  // #877: Dateien fehlen im Ablageordner (Volume vergessen, von Hand gelöscht, Platte defekt) – Einzelheiten im Protokoll.
  if (u.dateienFehlen) h.push({ schluessel: 'dateien.fehlen', art: 'schlecht', text: <><strong>{t('werkbank.uebersicht.dateien-fehlen', { anzahl: u.dateienFehlen, zahl: zahl(u.dateienFehlen) })}</strong> {t('werkbank.uebersicht.dateien-fehlen.text')}</>, ziel: '/werkbank/texterkennung#dateien', knopf: t('werkbank.uebersicht.dateien-fehlen.knopf') });
  // #798: Aufgaben bei Personen ohne Leserecht – Rechte richten oder Leserecht auf Zeit geben.
  if (u.ohneLeserecht) h.push({ schluessel: 'aufgaben.ohne-leserecht', art: 'warn', text: <><strong>{t('werkbank.ohne-leserecht.offen', { anzahl: u.ohneLeserecht })}.</strong> {t('werkbank.ohne-leserecht.hinweis')}</>, ziel: '/werkbank/aufgaben/ohne-leserecht', knopf: t('werkbank.ohne-leserecht.knopf') });
  if (u.aufgaben.ohneEmpfaenger) h.push({ schluessel: 'aufgaben.ohne-empfaenger', art: 'info', text: <>{tn('werkbank.uebersicht.fuer-die-administratoren-ohne', { b: <strong>{t('werkbank.uebersicht.aufgaben', { anzahl: u.aufgaben.ohneEmpfaenger, zahl: zahl(u.aufgaben.ohneEmpfaenger) })}</strong> })}</>, ziel: '/ablage/eingang', knopf: t('werkbank.uebersicht.zu-erledigen-oeffnen') });
  if (u.unpassend) h.push({ schluessel: 'mappen.unpassend', art: 'info', text: <>{tn('werkbank.uebersicht.nicht-zur-aktuellen-definition', { b: <strong>{t('werkbank.uebersicht.mappen-passen', { anzahl: u.unpassend, zahl: zahl(u.unpassend) })}</strong> })}</>, ziel: '/werkbank/typen', knopf: t('werkbank.uebersicht.zu-den-mappentypen') });
  return h;
}

export function useUebersicht() {
  const [stand, setStand] = useState<WerkbankUebersicht | null>(null);
  const [fehler, setFehler] = useState<string>();
  const [akzeptiert, setAkzeptiert] = useState<Akzeptiert>({});
  const laden = useCallback(async () => {
    try { const s = await api.uebersicht(); setStand(s); setAkzeptiert(s.akzeptiert ?? {}); setFehler(undefined); } catch (e) { setFehler((e as Error).message); }
  }, []);
  useEffect(() => { void laden(); }, [laden]);
  const geordnet = useMemo(() => (stand ? ordneMeldungen(hinweiseAus(stand), akzeptiert) : null), [stand, akzeptiert]);
  // Behoben oder schwerer geworden (#816): Die Akzeptanz gilt nicht mehr – einmal je Stand an den Server melden.
  const gemeldet = useRef<WerkbankUebersicht | null>(null);
  useEffect(() => {
    if (!stand || !geordnet?.aufheben.length || gemeldet.current === stand) return;
    gemeldet.current = stand;
    for (const anlass of ['erledigt', 'schwerer'] as const) {
      const liste = geordnet.aufheben.filter((x) => x.anlass === anlass).map((x) => x.schluessel);
      if (liste.length) api.akzeptanzAufheben(liste, anlass).then(setAkzeptiert).catch(() => {});
    }
  }, [stand, geordnet]);
  const akzeptieren = useCallback(async (h: Hinweis, grund: string) => setAkzeptiert(await api.meldungAkzeptieren(h.schluessel, h.art, grund.trim() || undefined)), []);
  const einblenden = useCallback(async (schluessel: string) => setAkzeptiert(await api.akzeptanzAufheben([schluessel], 'eingeblendet')), []);
  // „Nein, danke“ bzw. „Gelesen“ (#821, #815): Der Hinweis kommt danach nicht wieder.
  const erledigen = useCallback(async (schluessel: string) => { await api.meldungErledigt(schluessel); await laden(); }, [laden]);
  // Zahl in der Leiste: offene Warnungen und rote Meldungen, ohne Hinweise und ohne bewusst akzeptierte.
  const hinweise = geordnet ? geordnet.offen.filter((h) => h.art !== 'info').length : 0;
  return { stand, fehler, laden, hinweise, geordnet, akzeptieren, einblenden, erledigen };
}
export type UebersichtZustand = ReturnType<typeof useUebersicht>;

const kurzDatum = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'medium', timeStyle: 'short' });

/** „Zur Kenntnis nehmen“ (#816): nur für gelbe Warnungen und Hinweise; die Begründung ist freiwillig. */
function Akzeptieren({ h, u }: { h: Hinweis; u: UebersichtZustand }) {
  const [offen, setOffen] = useState(false);
  const [grund, setGrund] = useState('');
  const [fehler, setFehler] = useState<string>();
  const [sendet, setSendet] = useState(false);
  if (h.erledigen) return (
    <>
      <button type="button" className="textknopf klein" disabled={sendet} onClick={() => { setSendet(true); setFehler(undefined); u.erledigen(h.schluessel).catch((x) => setFehler((x as Error).message)).finally(() => setSendet(false)); }}>{h.erledigen}</button>
      {fehler && <p className="fehlertext klein">{fehler}</p>}
    </>
  );
  if (!akzeptierbar(h.art)) return null;
  if (!offen) return <button type="button" className="textknopf klein" onClick={() => setOffen(true)}>{t('werkbank.uebersicht.akzeptieren')}</button>;
  return (
    <form className="akzeptieren" onSubmit={(e) => {
      e.preventDefault(); setSendet(true); setFehler(undefined);
      u.akzeptieren(h, grund).catch((x) => setFehler((x as Error).message)).finally(() => setSendet(false));
    }}>
      <p className="leise klein">{t('werkbank.uebersicht.akzeptieren.text')}</p>
      <label className="eigenschaft"><span>{t('werkbank.uebersicht.akzeptieren.grund')}</span>
        <input value={grund} maxLength={GRUND_MAX} onChange={(e) => setGrund(e.target.value)} placeholder={t('werkbank.uebersicht.akzeptieren.grund.platzhalter')} autoFocus /></label>
      {fehler && <p className="fehlertext klein">{fehler}</p>}
      <div className="knoepfe">
        <button type="submit" className="knopf klein primaer" disabled={sendet}>{t('werkbank.uebersicht.akzeptieren.ja')}</button>
        <button type="button" className="knopf klein" onClick={() => { setOffen(false); setGrund(''); }}>{t('werkbank.uebersicht.akzeptieren.nein')}</button>
      </div>
    </form>
  );
}

/** Eingeklappter Abschnitt ganz unten: „Bewusst akzeptiert (3)“, je Meldung wer, wann, warum – und „Wieder einblenden“. */
function BewusstAkzeptiert({ u }: { u: UebersichtZustand }) {
  const [auf, setAuf] = useState(false);
  const liste = u.geordnet?.akzeptiert ?? [];
  if (!liste.length) return null;
  return (
    <section className="aufklappbereich akzeptiert">
      <button type="button" className="aufklappkopf" aria-expanded={auf} aria-controls="uebersicht-akzeptiert" onClick={() => setAuf(!auf)}>
        <span className="zeichen" aria-hidden="true">{auf ? '▾' : '▸'}</span>
        <span>{t('werkbank.uebersicht.akzeptiert.titel', { anzahl: liste.length })}</span>
        <span className="leise klein">{t('werkbank.uebersicht.akzeptiert.unter')}</span>
      </button>
      {auf && (
        <ul id="uebersicht-akzeptiert" className="aufklappinhalt akzeptiertliste">
          {liste.map((x) => (
            <li key={x.schluessel} className={`hinweis ${x.art === 'info' ? 'info' : x.art} stapel`}>
              <p>{x.text}</p>
              <p className="leise klein">{t('werkbank.uebersicht.akzeptiert.von', { von: x.akzeptanz.von, am: kurzDatum(x.akzeptanz.am) })}{x.akzeptanz.grund ? ` · ${t('werkbank.uebersicht.akzeptiert.grund', { grund: x.akzeptanz.grund })}` : ''}</p>
              <div className="knoepfe">
                <button type="button" className="knopf klein" onClick={() => void u.einblenden(x.schluessel).catch(() => {})}>{t('werkbank.uebersicht.akzeptiert.einblenden')}</button>
                <Link to={x.ziel} className="knopf klein">{x.knopf}</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function UebersichtListe({ u }: { u: UebersichtZustand }) {
  const h = u.geordnet?.offen ?? [];
  return (
    <>
      <Listenkopf titel={t('werkbank.uebersicht.uebersicht')} hilfe="werkbank.uebersicht" beschreibung={t('werkbank.uebersicht.was-in-dieser-installation')}>
        <button type="button" className="knopf klein" onClick={() => void u.laden()}>{t('werkbank.uebersicht.neu-laden')}</button>
      </Listenkopf>
      {u.fehler && <div className="hinweis schlecht"><p>{u.fehler}</p></div>}
      {/* Am Handy steht die Übersicht in der Liste: zuerst die Kacheln (#816), darunter die Meldungen. */}
      {u.stand && <div className="nur-schmal-block"><Kacheln s={u.stand} /></div>}
      {!u.stand ? <p className="leise">{t('werkbank.uebersicht.lade')}</p> : !h.length ? <p className="leise leerliste">{t('werkbank.uebersicht.alles-eingerichtet-nichts-zu')}</p> : (
        <ul className="mappenliste meldungsliste">
          {h.map((x) => (
            <li key={x.schluessel} className={`meldung ${x.art}`}>
              <Link to={x.ziel} className="eintrag werk"><span className="titel"><span className={`chip ${x.art === 'info' ? '' : x.art}`}>{t.frei(`werkbank.uebersicht.schwere.${x.art}`)}</span> {x.knopf}</span><span className="unter">{x.text}</span></Link>
              <div className="meldung-akzeptieren nur-schmal-block"><Akzeptieren h={x} u={u} /></div>
            </li>
          ))}
        </ul>
      )}
      {u.stand && <div className="nur-schmal-block"><BewusstAkzeptiert u={u} /></div>}
    </>
  );
}

export function UebersichtPanel({ u }: { u: UebersichtZustand }) {
  const handbuch = useHandbuch();
  const s = u.stand;
  const h = u.geordnet?.offen ?? [];
  return (
    <div className="einspaltig uebersicht">
      <div className="mappenkopf">
        <p className="ueber">{t('werkbank.uebersicht.werkbank')}</p>
        <h1>{t('werkbank.uebersicht.uebersicht')}</h1>
        <p className="leise">{tn('werkbank.uebersicht.hinweise-stand-und-bestand', { link: <a href={handbuch('admin')} target="_blank" rel="noreferrer" className="verweis">{t('werkbank.uebersicht.administratorhandbuch')}</a>, link2: <Link to="/werkbank/ansicht" className="verweis">{t('werkbank.uebersicht.werkbank-anpassen')}</Link> })}</p>
      </div>
      {!s ? <p className="leise">{t('werkbank.uebersicht.lade')}</p> : (
        <>
          {/* Erst, was alles zu tun ist (Kacheln), darunter die konkreten Meldungen – rot, gelb, Hinweise (#816). */}
          <Kacheln s={s} />
          {h.length
            ? h.map((x) => (
              <div key={x.schluessel} className={`hinweis ${x.art === 'info' ? '' : x.art} hinweiszeile`}>
                <p>{x.text}</p>
                <div className="knoepfe"><Link to={x.ziel} className="knopf klein">{x.knopf}</Link></div>
                <Akzeptieren h={x} u={u} />
              </div>
            ))
            : <div className="hinweis gut"><p>{tn('werkbank.uebersicht.es-gibt-gerade-nichts', { b: <strong>{t('werkbank.uebersicht.alles-eingerichtet')}</strong> })}</p></div>}
          <BewusstAkzeptiert u={u} />
        </>
      )}
    </div>
  );
}

function Kacheln({ s }: { s: WerkbankUebersicht }) {
  return (
          <div className="kacheln">
            <Kachel titel={t('werkbank.uebersicht.aufgaben-2')} ziel="/werkbank/aufgaben" wert={zahl(s.aufgaben.offen)} unter={t('werkbank.uebersicht.offen')} />
            <Kachel titel={t('werkbank.uebersicht.texterkennung')} ziel="/werkbank/texterkennung" wert={s.texterkennung ? zahl(s.texterkennung.wartet + s.texterkennung.laeuft) : '–'} unter={s.texterkennung ? t('werkbank.uebersicht.in-der-warteschlange-mit', { zahl: zahl(s.texterkennung.fehler) }) : t('werkbank.uebersicht.nicht-eingerichtet')} />
            <Kachel titel={t('werkbank.uebersicht.papierkorb')} ziel="/werkbank/papierkorb" wert={zahl(s.papierkorb.anzahl)} unter={s.papierkorb.tage ? (s.papierkorb.aeltester ? t('werkbank.uebersicht.aelteste-vom-tage', { datum: datum(s.papierkorb.aeltester), tage: s.papierkorb.tage }) : t('werkbank.uebersicht.tage-aufbewahrung', { tage: s.papierkorb.tage })) : t('werkbank.uebersicht.ausgeschaltet')} />
            <Kachel titel={t('werkbank.uebersicht.gemeldete-fehler-2')} ziel="/werkbank/fehlermeldungen" wert={s.fehlermeldungen === null ? '–' : zahl(s.fehlermeldungen)} unter={t('werkbank.uebersicht.offen')} />
            {s.bestand && <Kachel titel={t('werkbank.uebersicht.bestand')} ziel="/werkbank/anbindung" wert={zahl(s.bestand.mappen)} unter={t('werkbank.uebersicht.mappen-dokumente-benutzer', { zahl: zahl(s.bestand.dokumente), bytes: bytes(s.bestand.dokumenteBytes), zahl2: zahl(s.bestand.benutzer) })} />}
            <Kachel titel={t('werkbank.uebersicht.version')} ziel="/werkbank/systemzustand#version" wert={s.version.version} unter={s.version.commit ? t('werkbank.uebersicht.build-unter-systemzustand-auf', { commit: s.version.commit.slice(0, 7) }) : t('werkbank.uebersicht.unter-systemzustand-auf-updates')} />
          </div>
  );
}

function Kachel({ titel, wert, unter, ziel }: { titel: string; wert: string; unter: string; ziel: string }) {
  return (
    <Link to={ziel} className="kachel">
      <span className="ueber">{titel}</span>
      <span className="wert">{wert}</span>
      <span className="leise klein">{unter}</span>
    </Link>
  );
}

/* ---------- Leiste mit Gruppen (#68) ---------- */

export { GRUPPEN, type Gruppe };
export interface WerkbankEintrag { pfad: string; name: string; gruppe: Gruppe | null; zahl?: number; warn?: string | number; warnTitel?: string }

/**
 * Leiste der Werkbank. Ausgeblendete Bereiche (#281) fehlen – außer dem offenen und solchen mit Hinweis.
 * Unten: wie viele ausgeblendet sind, zum Aufklappen, und der Weg zu „Werkbank anpassen“.
 */
export function WerkbankNavigation({ bereich, eintraege, zeigen = () => true, benutzt: eingerichtet = [] }: { bereich: string; eintraege: WerkbankEintrag[]; zeigen?: (pfad: string) => boolean; benutzt?: string[] }) {
  const [alleZeigen, setAlleZeigen] = useState(false);
  // Werkbank-Suche (#725): findet Bereiche unter neuem und altem Namen, auch ausgeblendete.
  const [suche, setSuche] = useState('');
  const treffer = suche.trim() ? eintraege.filter((e) => bereichPasst(e.pfad, suche)) : null;
  const ausgeblendet = eintraege.filter((e) => e.pfad !== 'uebersicht' && !zeigen(e.pfad));
  const sichtbar = (e: WerkbankEintrag) => alleZeigen || zeigen(e.pfad) || e.pfad === bereich || !!e.warn;
  const liste = eintraege.filter(sichtbar);
  const gruppen = (Object.keys(GRUPPEN) as Gruppe[]).filter((g) => liste.some((e) => e.gruppe === g));
  const aktiv = liste.find((e) => e.pfad === bereich)?.gruppe ?? null;
  // Am Handy: erst die Gruppe, dann ihre Einträge; vorausgewählt ist die Gruppe des offenen Bereichs.
  const [gewaehlt, setGewaehlt] = useState<Gruppe | null>(aktiv);
  useEffect(() => { setGewaehlt(aktiv); }, [aktiv]);
  const eintrag = (e: WerkbankEintrag) => {
    const aus = !zeigen(e.pfad);
    return (
      <Link key={e.pfad} anker={`werkbank.bereich:${e.pfad}`} to={e.pfad === 'uebersicht' ? '/werkbank' : `/werkbank/${e.pfad}`} className={`sicht ${bereich === e.pfad ? 'an' : ''} ${aus ? 'ausgeblendet' : ''}`}
        title={aus ? (e.warn ? t('werkbank.uebersicht.ausgeblendet-steht-hier-wegen') : t('werkbank.uebersicht.ausgeblendet')) : undefined}>
        <span className="nm">{e.name}</span>
        {e.warn ? <span className="zaehler" title={e.warnTitel} aria-label={e.warnTitel ? `${e.warn} – ${e.warnTitel}` : undefined}>{e.warn}</span> : e.zahl ? <span className="zahl">{e.zahl}</span> : null}
      </Link>
    );
  };
  const warnIn = (g: Gruppe) => liste.some((e) => e.gruppe === g && e.warn);
  const benutzt = ausgeblendet.filter((e) => eingerichtet.includes(e.pfad)).length;
  return (
    <>
      <div className="gruppenwahl" role="tablist" aria-label={t('werkbank.uebersicht.bereiche-der-werkbank')}>
        {liste.filter((e) => !e.gruppe).map(eintrag)}
        {gruppen.map((g) => (
          <button key={g} type="button" role="tab" aria-selected={gewaehlt === g} className={`sicht ${gewaehlt === g ? 'an' : ''}`} onClick={() => setGewaehlt(g)}>
            <span className="nm">{GRUPPEN[g]}</span>{warnIn(g) && <span className="zaehler" aria-label={t('werkbank.uebersicht.mit-hinweis')}>!</span>}
          </button>
        ))}
      </div>
      <nav className="sichtliste werkbankleiste">
        <input type="search" className="werkbanksuche" value={suche} onChange={(x) => setSuche(x.target.value)}
          placeholder={t('werkbank.suche.platzhalter')} aria-label={t('werkbank.suche.label')} />
        {treffer && (treffer.length
          ? <div className="wbgruppe gewaehlt">{treffer.map((e) => <span key={e.pfad} className="wbtreffer">{eintrag(e)}{e.gruppe && <span className="leise klein">{GRUPPEN[e.gruppe]}</span>}</span>)}</div>
          : <p className="leise klein">{t('werkbank.suche.nichts')}</p>)}
        {!treffer && liste.filter((e) => !e.gruppe).map((e) => <div key={e.pfad} className="wbgruppe ohne">{eintrag(e)}</div>)}
        {!treffer && gruppen.map((g) => (
          <div key={g} className={`wbgruppe ${gewaehlt === g ? 'gewaehlt' : ''}`}>
            <h3 className="gruppentitel">{GRUPPEN[g]}</h3>
            {liste.filter((e) => e.gruppe === g).map(eintrag)}
          </div>
        ))}
        <p className="ausgeblendet-fuss leise klein">
          {ausgeblendet.length > 0 && <>
            <button type="button" className="verweis" aria-expanded={alleZeigen} onClick={() => setAlleZeigen(!alleZeigen)}>
              {alleZeigen ? t('werkbank.uebersicht.ausgeblendete-verbergen') : t('werkbank.uebersicht.bereiche-ausgeblendet', { anzahl: ausgeblendet.length, wert: benutzt ? t('werkbank.uebersicht.davon-eingerichtet', { benutzt }) : '' })}
            </button>{' · '}</>}
          <Link to="/werkbank/ansicht" className="verweis">{t('werkbank.uebersicht.werkbank-anpassen')}</Link>
        </p>
      </nav>
    </>
  );
}
