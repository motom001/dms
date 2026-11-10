/**
 * Pakete (#960: aus routen.ts): Paketverwaltung, Paket erstellen, Läufer, Paket-Einstellungen und Umwandlungen.
 */
import { ARCHIV_MAX, SAMMEL_MAX, type InstallierenEingabe } from '../pakete';
import type { AblaufEingabe, AblaufInstallation } from '../../../shared/src/pakete';
import { eigeneVersion } from '../system';
import { KOERPER_SPIELRAUM } from '../grenzen';
import { ok } from '../http/routen-hilfen';
import type { RoutenKontext } from '../http/routen-kontext';
import type { Route } from '../routen';

export function paketeRouten(k: RoutenKontext): Route[] {
  const { x, pakete, paketerstellung, wer } = k;
  return [
    /* ---------- Nummernkreise (#171) ---------- */
    // Paketverwaltung (#188, #189): Kataloge nur auf Knopfdruck; weitere Quellen und Hochladen in der erweiterten Ansicht.
    { methode: 'GET', pfad: '/api/werkbank/pakete', zugang: 'admin', handler: async () => ok({ installiert: await pakete.installierte(), katalogUrl: pakete.katalogUrl, quellen: await pakete.quellen(), dms: eigeneVersion() }) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/katalog', zugang: 'admin', handler: async (a) => ok(await pakete.abrufen((a.body as { alle?: unknown } | null)?.alle === true)) },
    // Eigener Katalog mit Schlüssel (#594): ohne passenden Fingerabdruck 409 mit dem Fingerabdruck zum Bestätigen.
    { methode: 'POST', pfad: '/api/werkbank/pakete/quellen', zugang: 'admin', handler: async (a) => ok(await pakete.quelleHinzufuegen((a.body ?? {}) as { url?: unknown; fingerabdruck?: unknown }, wer(a))) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/quellen/schluessel', zugang: 'admin', handler: async (a) => ok(await pakete.quelleSchluessel((a.body ?? {}) as { url?: unknown; fingerabdruck?: unknown }, wer(a))) },
    { methode: 'PUT', pfad: '/api/werkbank/pakete/quellen', zugang: 'admin', handler: async (a) => ok(await pakete.quelleSchalten((a.body ?? {}) as { url?: unknown; aktiv?: unknown }, wer(a))) },
    { methode: 'DELETE', pfad: '/api/werkbank/pakete/quellen', zugang: 'admin', handler: async (a) => ok(await pakete.quelleEntfernen(String(a.query.url ?? ''), wer(a))) },
    // Paket selbst erstellen (#374): Auswahl, Prüfung, Export als .zip im Format der Registry.
    { methode: 'GET', pfad: '/api/werkbank/pakete/erstellen', zugang: 'admin', handler: async () => ok(await paketerstellung.stand()) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/erstellen/pruefen', zugang: 'admin', handler: async (a) => ok(await paketerstellung.pruefe(a.body)) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/erstellen/letzte', zugang: 'admin', lesend: true, roh: ARCHIV_MAX + KOERPER_SPIELRAUM, handler: async (a) => ok(paketerstellung.liesLetzteVersion(a.body)) },
    // „Paket erstellen“ (#652): erstellt, ohne herunterzuladen; selbst erstellte Pakete in der Paketverwaltung.
    { methode: 'POST', pfad: '/api/werkbank/pakete/erstellen/anlegen', zugang: 'admin', handler: async (a) => ok(await paketerstellung.erstelle(a.body, wer(a))) },
    { methode: 'GET', pfad: '/api/werkbank/pakete/selbst', zugang: 'admin', handler: async () => ok(await paketerstellung.selbstErstellt()) },
    { methode: 'GET', pfad: '/api/werkbank/pakete/selbst/:id', zugang: 'admin', handler: async (a) => ok(await paketerstellung.selbstErstelltDetail(a.params.id)) },
    { methode: 'GET', pfad: '/api/werkbank/pakete/selbst/:id/zip', zugang: 'admin', handler: async (a) => {
      const r = await paketerstellung.archiv(a.params.id, String(a.query.version ?? ''));
      return { datei: { inhalt: r.daten, name: r.name, mime: 'application/zip', anzeigen: false, groesse: r.daten.length } };
    } },
    { methode: 'DELETE', pfad: '/api/werkbank/pakete/selbst/:id', zugang: 'admin', handler: async (a) => ok(await paketerstellung.ausListeNehmen(a.params.id, wer(a))) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/erstellen/export', zugang: 'admin', handler: async (a) => {
      const r = await paketerstellung.exportiere(a.body, wer(a));
      return { datei: { inhalt: r.daten, name: r.name, mime: 'application/zip', anzeigen: false, groesse: r.daten.length } };
    } },
    // Ein Paket (höchstens PAKET_MAX, #644) oder eine Sammeldatei mit mehreren Paketen (#461, höchstens SAMMEL_MAX).
    { methode: 'POST', pfad: '/api/werkbank/pakete/hochladen', zugang: 'admin', roh: SAMMEL_MAX + KOERPER_SPIELRAUM, handler: async (a) => ok(await pakete.hochladenDatei(a.body, wer(a))) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/vorschau', zugang: 'admin', lesend: true, handler: async (a) => ok(await pakete.vorschau((a.body ?? {}) as { id?: string; version?: string; quelle?: string; upload?: string })) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/installieren', zugang: 'admin', handler: async (a) => ok(await pakete.mitSperre(() => pakete.installiere((a.body ?? {}) as InstallierenEingabe, wer(a)))) },
    // Mehrere Pakete in einem Ablauf (#405): Plan (nichts wird gespeichert) und Installation mit allen Antworten.
    { methode: 'POST', pfad: '/api/werkbank/pakete/ablauf/plan', zugang: 'admin', lesend: true, handler: async (a) => ok(await pakete.ablaufPlan((a.body ?? {}) as AblaufEingabe)) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/ablauf/installieren', zugang: 'admin', handler: async (a) => ok(await pakete.mitSperre(() => pakete.ablaufInstallieren((a.body ?? {}) as AblaufInstallation, wer(a)))) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/updates', zugang: 'admin', handler: async () => ok(await pakete.updates()) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/:id/aktualisieren', zugang: 'admin', handler: async (a) => ok(await pakete.mitSperre(() => pakete.aktualisiere(a.params.id, (a.body ?? {}) as { version?: string; bestaetigt?: boolean; rechteBestaetigt?: boolean }, wer(a)))) },
    // Paket-Läufer (#338): Stand je Paket mit Code – geladen, Aufrufe, Fehler, Ereignisse.
    { methode: 'GET', pfad: '/api/werkbank/pakete/laeufer', zugang: 'admin', handler: async () => ok(x.paketlaeufer ? await x.paketlaeufer.uebersicht() : null) },
  ];
}

export function paketeEinstellungenRouten(k: RoutenKontext): Route[] {
  const { pakete, umwandlung, wer, zg } = k;
  return [
    { methode: 'DELETE', pfad: '/api/werkbank/pakete/:id', zugang: 'admin', handler: async (a) => ok(await pakete.mitSperre(() => pakete.entferne(a.params.id, wer(a), a.query.einstellungenBehalten === '1', a.query.spracheBestaetigt === '1'))) },
    // Beispiele entfernen (#878): unveränderte Beispiel-Mappen samt Dokumenten; geänderte bleiben und stehen in der Antwort.
    { methode: 'POST', pfad: '/api/werkbank/pakete/:id/beispiele/entfernen', zugang: 'admin', handler: async (a) => ok(await pakete.mitSperre(() => pakete.beispieleEntfernen(a.params.id, wer(a)))) },
    // Paket-Einstellungen (#197): nur Administratoren, nicht über die API v1.
    // Paket-Update: Text in Verweis umwandeln (#534) – Vorschau, Umwandeln, Rückgängig.
    { methode: 'GET', pfad: '/api/werkbank/pakete/:id/umwandlungen', zugang: 'admin', handler: async (a) => ok(await umwandlung.liste(a.params.id)) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/:id/umwandlungen/vorschau', zugang: 'admin', lesend: true, handler: async (a) => ok(await umwandlung.vorschau(a.params.id, (a.body ?? {}) as { typId?: unknown; feldKey?: unknown }, await zg(a))) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/:id/umwandlungen', zugang: 'admin', handler: async (a) => ok(await umwandlung.umwandeln(a.params.id, (a.body ?? {}) as { typId?: unknown; feldKey?: unknown; entscheidungen?: unknown }, wer(a), await zg(a))) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/:id/umwandlungen/:vorgang/rueckgaengig', zugang: 'admin', handler: async (a) => ok(await umwandlung.rueckgaengig(a.params.vorgang, wer(a), await zg(a))) },
    { methode: 'GET', pfad: '/api/werkbank/pakete/:id/einstellungen', zugang: 'admin', handler: async (a) => ok(await pakete.einstellungen(a.params.id)) },
    { methode: 'PUT', pfad: '/api/werkbank/pakete/:id/einstellungen', zugang: 'admin', handler: async (a) => ok(await pakete.speichereEinstellungen(a.params.id, a.body, wer(a))) },
    { methode: 'POST', pfad: '/api/werkbank/pakete/:id/aktionen/:aktion', zugang: 'admin', handler: async (a) => ok(await pakete.aktion(a.params.id, a.params.aktion, wer(a))) },
  ];
}
