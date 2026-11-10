/**
 * Datenschutz (#960: aus routen.ts): Baum über Verweise, Auskunft, Löschkonzept und Löschprotokoll, Auskunft zustellen
 * und die öffentliche Abrufseite.
 */
import { Fachfehler } from '../fehler';
import { oeffneStrom } from '../dateispeicher';
import { mkdir } from 'node:fs/promises';
import { AUSKUNFT_PHASEN, auskuenfteIn, auskunftDatei, erzeugeAuskunft, haltenBis, loescheAuskunft } from '../auskunft';
import { AUSKUNFT_TAGE, linkStatus, oeffentlichErreichbar } from '../../../shared/src/auskunft';
import { loeschkonzept, luecken } from '../../../shared/src/loeschkonzept';
import { DOCX_MIME, schriftstueckDocx, schriftstueckPdf } from '../schriftstueck';
import { ipBereich, kuerzeIp } from '../abruf';
import { eigeneVersion } from '../system';
import { L, ok, leer, b, ich } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../routen';

export function datenschutzRouten(k: RoutenKontext): Route[] {
  const { dienst, x, zg, auskunftZiel, loeschkonzeptQuelle, adresse } = k;
  return [
    /* ---------- Baum über Verweise (#396, #424): mit den Rechten des Aufrufers ---------- */
    { methode: 'GET', pfad: '/api/mappen/:id/baum', zugang: 'angemeldet', lesend: true, handler: async (a) => ok(await dienst.baum(a.params.id, a.query, await zg(a))) },
    /* ---------- Datenschutz: Auskunft nach Art. 15 DSGVO (#396), nur Administratoren ---------- */
    { methode: 'GET', pfad: '/api/werkbank/datenschutz', zugang: 'admin', handler: async () => {
      const bereit = await auskuenfteIn(auskunftZiel());
      const auftrag = await dienst.auftraege.stand();
      const laufend = auftrag?.art === 'auskunft' && auftrag.status === 'laeuft' ? { id: auftrag.id, titel: auftrag.titel, gestartet: auftrag.gestartet } : null;
      return ok({
      einstellung: await dienst.datenschutz(), auskuenfte: bereit, tage: AUSKUNFT_TAGE,
      // Liste der Auskünfte (#668): auch Gelöschte als Nachweis, Anfragen mit Frist, der laufende Auftrag.
      verzeichnis: await dienst.auskunftVerzeichnis(bereit, laufend),
      // Zustellen (#455): Abruf-Links (Nachweis, auch nach dem Löschen der ZIP), Erreichbarkeit, E-Mail-Versand.
      links: await dienst.auskunftLinks({ max: 200 }), adresse: adresse(), oeffentlich: oeffentlichErreichbar(adresse()), mail: !!x.betrieb?.mailer(),
      // Löschkonzept (#469): was im erzeugten Dokument noch fehlen würde.
      loeschkonzept: { luecken: luecken(await loeschkonzeptQuelle()) },
    }); } },
    { methode: 'GET', pfad: '/api/werkbank/datenschutz/loeschkonzept', zugang: 'admin', handler: async (a) => {
      const format = a.query.format === 'docx' ? 'docx' : 'pdf';
      const q = await loeschkonzeptQuelle();
      const k = loeschkonzept(q);
      const s = { titel: k.titel, untertitel: k.untertitel, stand: k.stand, vorbemerkung: k.vorbemerkung, abschnitte: k.abschnitte };
      const inhalt = format === 'docx' ? schriftstueckDocx(s) : await schriftstueckPdf(s);
      L.datenschutz.info('Löschkonzept erzeugt', { format, datenarten: k.datenarten.length, luecken: k.luecken.length, von: ich(a).email });
      return { datei: { inhalt, name: `Löschkonzept ${q.stand}.${format}`, mime: format === 'docx' ? DOCX_MIME : 'application/pdf', anzeigen: false, groesse: inhalt.length } };
    } },
    /* Löschprotokoll (#470): nur lesen und ausgeben; ändern lässt sich nur die Aufbewahrung. */
    { methode: 'GET', pfad: '/api/werkbank/loeschprotokoll', zugang: 'admin', lesend: true, handler: async (a) => ok(await dienst.loeschprotokoll(a.query)) },
    { methode: 'GET', pfad: '/api/werkbank/loeschprotokoll/datei', zugang: 'admin', lesend: true, handler: async (a) => {
      const format = a.query.format === 'csv' ? 'csv' : 'pdf';
      const r = await dienst.loeschprotokollAusgabe(a.query, format, { von: ich(a).name || ich(a).email, mandant: (await x.mandantName?.()) ?? '', version: eigeneVersion() });
      L.datenschutz.info('Löschprotokoll ausgegeben', { format, von: ich(a).email });
      return { datei: { inhalt: r.inhalt, name: r.name, mime: r.mime, anzeigen: false, groesse: r.inhalt.length } };
    } },
    { methode: 'PUT', pfad: '/api/werkbank/loeschprotokoll/einstellungen', zugang: 'admin', handler: async (a) => ok({ jahre: await dienst.setzeLoeschprotokollJahre(b(a).jahre, ich(a).email) }) },
    { methode: 'PUT', pfad: '/api/werkbank/datenschutz', zugang: 'admin', handler: async (a) => ok(await dienst.setzeDatenschutz(a.body, ich(a).email)) },
    { methode: 'POST', pfad: '/api/werkbank/auskunft/vorschau', zugang: 'admin', lesend: true, handler: async (a) => ok(await dienst.auskunftVorschau(a.body, await zg(a))) },
    { methode: 'POST', pfad: '/api/werkbank/auskunft/frist', zugang: 'admin', handler: async (a) => ok(await dienst.auskunftFrist(a.body, await zg(a), ich(a).id), 201) },
    { methode: 'POST', pfad: '/api/werkbank/auskunft', zugang: 'admin', handler: async (a) => {
      const mandant = (await x.mandantName?.()) ?? '';
      const daten = await dienst.auskunftDaten(a.body, await zg(a), { mandant, version: eigeneVersion() });
      const ziel = auskunftZiel();
      await mkdir(ziel, { recursive: true });
      await auskuenfteIn(ziel);
      const von = { id: ich(a).id, name: ich(a).name, email: ich(a).email };
      L.datenschutz.info('Auskunft gestartet', { mappeId: daten.start.id, mappen: daten.anzahl.mappen, dokumente: daten.anzahl.dokumente, von: von.email });
      return ok(await dienst.auftraege.angemeldet(dienst.auftraege.starte('auskunft', `Auskunft für ${daten.start.titel || 'Ohne Titel'}`, async (f) => {
        const r = await erzeugeAuskunft(daten, ziel, { von, mandant }, f);
        await dienst.auskunftNachweis(daten, von, r);
        return r;
      }, AUSKUNFT_PHASEN)), 202);
    } },
    { methode: 'GET', pfad: '/api/werkbank/auskunft/:id/zip', zugang: 'admin', handler: async (a) => {
      const ziel = auskunftZiel();
      const { stand, pfad, groesse } = await auskunftDatei(ziel, a.params.id);
      // Nach dem Herunterladen gelöscht (#396): erst, wenn die Datei ganz gelesen ist – außer, ein Abruf-Link
      // gilt noch (#455): Dann bleibt sie, bis die Person sie abgerufen hat oder der Link abläuft.
      const halten = await dienst.auskunftLinkAktiv(stand.id);
      const strom = await oeffneStrom(pfad);
      strom.on('end', () => void dienst.auskunftNotiz(stand, ich(a).id, 'download').catch(() => {}));
      strom.on('end', () => (halten ? L.datenschutz.info('Auskunft heruntergeladen (bleibt für den Abruf-Link)', { mappeId: stand.mappeId, von: ich(a).email })
        : void loescheAuskunft(ziel, stand.id).then(() => L.datenschutz.info('Auskunft heruntergeladen und gelöscht', { mappeId: stand.mappeId, von: ich(a).email }))));
      // Personenbezogene Daten: nicht im Cache des Browsers ablegen (fremder oder gemeinsam genutzter Rechner).
      return { datei: { inhalt: strom, name: `${stand.name}.zip`, mime: 'application/zip', anzeigen: false, groesse, koepfe: { 'cache-control': 'no-store' } } };
    } },
    { methode: 'DELETE', pfad: '/api/werkbank/auskunft/:id', zugang: 'admin', handler: async (a) => {
      // Nachweis (#668): vorher merken, zu wem sie gehört – die Zeile bleibt in der Liste der Auskünfte.
      const vorher = (await auskuenfteIn(auskunftZiel())).find((s) => s.id === a.params.id);
      await loescheAuskunft(auskunftZiel(), a.params.id);
      if (vorher) await dienst.auskunftNotiz(vorher, ich(a).id, 'geloescht');
      // Ohne ZIP kein Abruf (#455): gültige Links gleich mit zurückziehen.
      for (const l of await dienst.auskunftLinks({ auskunftId: a.params.id })) if (linkStatus(l) === 'aktiv') await dienst.auskunftLinkWiderrufen(l.id, ich(a));
      L.datenschutz.info('Auskunft gelöscht', { id: a.params.id, von: ich(a).email });
      return leer;
    } },
    /* ---------- Auskunft zustellen (#455) ---------- */
    { methode: 'POST', pfad: '/api/werkbank/auskunft/:id/email', zugang: 'admin', handler: async (a) => {
      const { stand, pfad } = await auskunftDatei(auskunftZiel(), a.params.id);
      const i = ich(a);
      return ok(await dienst.auskunftPerEmail(stand, () => oeffneStrom(pfad), a.body, { id: i.id, name: i.name, email: i.email }, x.betrieb?.mailer() ?? null));
    } },
    { methode: 'POST', pfad: '/api/werkbank/auskunft/:id/link', zugang: 'admin', handler: async (a) => {
      const ziel = auskunftZiel();
      const { stand } = await auskunftDatei(ziel, a.params.id);
      const i = ich(a);
      const r = await dienst.auskunftLinkAnlegen(stand, a.body, { id: i.id, name: i.name, email: i.email }, { adresse: adresse(), mailer: x.betrieb?.mailer() ?? null });
      // Die ZIP bleibt, solange der Link gilt.
      await haltenBis(ziel, stand.id, r.link.ablauf);
      return ok(r, 201);
    } },
    { methode: 'POST', pfad: '/api/werkbank/auskunft/link/:id/widerrufen', zugang: 'admin', handler: async (a) => {
      const l = await dienst.auskunftLinkWiderrufen(a.params.id, ich(a));
      // Ohne gültigen Link gilt für die ZIP wieder das ursprüngliche Ende.
      if (!(await dienst.auskunftLinkAktiv(l.auskunftId))) await haltenBis(auskunftZiel(), l.auskunftId, null);
      return ok(l);
    } },
    /*
     * Öffentliche Abrufseite (#455) – der einzige Weg ohne Anmeldung zu einer Auskunft. Schlüssel und Code
     * kommen per POST (mit X-DMS, also nicht von fremden Seiten); Fehlversuche zählen im Anmeldeschutz je IP
     * und am Link (Sperre nach LINK_FEHLVERSUCHE_MAX). Antworten verraten nicht, ob es einen Link gibt.
     * Im Protokoll stehen weder Schlüssel noch Code, die IP nur gekürzt.
     */
  ];
}

export function abrufRouten(k: RoutenKontext): Route[] {
  const { dienst, auskunftZiel, abrufTickets, abrufBremse, abrufText } = k;
  return [
    { methode: 'GET', pfad: '/api/abruf/anrede', zugang: 'offen', handler: async () => ok({ anrede: (await dienst.datenschutz()).anrede }) },
    { methode: 'POST', pfad: '/api/abruf', zugang: 'offen', handler: async (a) => {
      const o = (a.body ?? {}) as Record<string, unknown>;
      const bereich = ipBereich(a.ip);
      // Versuch vorab zählen (#956), über alle Prozesse; Code-Prüfungen (scrypt) nur mit freiem Platz der Bremse.
      // Parallele Anfragen kommen so weder an den Zählern vorbei noch lasten sie den Server aus.
      const v = await abrufBremse.versuch(bereich);
      if (!v) throw new Fachfehler(429, await abrufText('abruf.fehler.zuviele'));
      const r = await dienst.auskunftAbrufPruefen(o.schluessel, o.code, () => abrufBremse.belege());
      // Nur ein falscher Code bleibt als Fehlversuch stehen.
      if (r.art !== 'falsch') await v.zurueck();
      if (r.art === 'beschaeftigt') throw new Fachfehler(429, await abrufText('abruf.fehler.zuviele'));
      if (r.art === 'falsch') {
        L.datenschutz.warn('Abruf einer Auskunft fehlgeschlagen', { ip: kuerzeIp(a.ip), ...(r.link ? { link: r.link.id } : {}) });
        throw new Fachfehler(403, await abrufText('abruf.fehler.falsch'));
      }
      if (r.art === 'ungueltig') throw new Fachfehler(410, await abrufText('abruf.fehler.ungueltig'));
      const link = r.link!;
      const datei = await auskunftDatei(auskunftZiel(), link.auskunftId).catch(() => null);
      if (!datei) throw new Fachfehler(410, await abrufText('abruf.fehler.ungueltig'));
      L.datenschutz.info('Abrufcode einer Auskunft bestätigt', { link: link.id, ip: kuerzeIp(a.ip) });
      return ok({ ticket: await abrufTickets.stelleAus(link.id), groesse: datei.groesse, verschluesselt: datei.stand.verschluesselt, bis: link.ablauf, abrufe: link.abrufe, maxAbrufe: link.maxAbrufe });
    } },
    { methode: 'GET', pfad: '/api/abruf/datei', zugang: 'offen', ohneHead: true, handler: async (a) => {
      const id = await abrufTickets.loese(a.query.ticket);
      const link = id ? await dienst.auskunftLinkMitId(id) : undefined;
      if (!link) throw new Fachfehler(410, await abrufText('abruf.fehler.ticket'));
      const ziel = auskunftZiel();
      const datei = await auskunftDatei(ziel, link.auskunftId).catch(() => null);
      if (!datei) throw new Fachfehler(410, await abrufText('abruf.fehler.ungueltig'));
      const nr = await dienst.auskunftAbrufZaehlen(link.id);
      if (nr === null) throw new Fachfehler(410, await abrufText('abruf.fehler.ungueltig'));
      const { stand, pfad, groesse } = datei;
      const strom = await oeffneStrom(pfad);
      let fertig = false;
      strom.on('end', () => {
        fertig = true;
        void (async () => {
          await dienst.auskunftAbgerufen(link, nr, true, stand.vonId);
          L.datenschutz.info('Auskunft abgerufen', { mappeId: link.mappeId, link: link.id, nr, ip: kuerzeIp(a.ip) });
          // Alle Abrufe verbraucht: Die ZIP wird nicht mehr gebraucht.
          if (nr >= link.maxAbrufe) await loescheAuskunft(ziel, stand.id);
        })().catch((e) => L.datenschutz.error('Abruf nicht vermerkt', { fehler: (e as Error).message }));
      });
      strom.on('close', () => { if (!fertig) void dienst.auskunftAbgerufen(link, nr, false).catch(() => {}); });
      // Personenbezogene Daten: nicht im Cache des Browsers ablegen (fremder oder gemeinsam genutzter Rechner).
      return { datei: { inhalt: strom, name: `${stand.name}.zip`, mime: 'application/zip', anzeigen: false, groesse, koepfe: { 'cache-control': 'no-store' } } };
    } },
  ];
}
