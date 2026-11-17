/**
 * Bausteine im Routen-Kontext, die der Start nur unter Umständen einrichtet (#1278, Schritt 6b-1: aus `routenKontext`
 * verschoben, unverändert): Jede Hilfe liefert den Baustein oder antwortet mit 404, wenn er fehlt.
 */
import { Fachfehler } from '../grundlagen/fehler';
import type { Konten } from '../konten';
import { t } from '../sprache/sprache';
import type { RoutenExtras } from './routen-extras';

/** Bausteine des Betriebs: Designs, Einstellungen, Texterkennung, Meldungen, Tresor, Schlüssel, Automatisierungen. */
export function betriebsBausteine(x: RoutenExtras) {
  const designs = () => {
    if (!x.designs) throw new Fachfehler(404, t('meldungen.routen.designs-sind-nicht-eingerichtet'));
    return x.designs;
  };
  const betrieb = () => {
    if (!x.betrieb) throw new Fachfehler(404, t('meldungen.routen.betriebseinstellungen-sind-nicht'));
    return x.betrieb;
  };
  const region = () => {
    if (!x.region) throw new Fachfehler(404, t('meldungen.routen.die-region-ist-nicht'));
    return x.region;
  };
  const sprachen = () => {
    if (!x.sprachen) throw new Fachfehler(404, t('meldungen.sprachen.nicht-eingerichtet'));
    return x.sprachen;
  };
  const ocr = () => {
    if (!x.texterkennung) throw new Fachfehler(404, t('meldungen.routen.die-texterkennung-ist-nicht'));
    return x.texterkennung;
  };
  const meldungen = () => {
    if (!x.fehlermeldungen) throw new Fachfehler(404, t('meldungen.routen.gemeldete-fehler-sind-nicht'));
    return x.fehlermeldungen;
  };
  const tresor = () => {
    if (!x.tresor) throw new Fachfehler(404, t('meldungen.routen.die-verschluesselung-ist-nicht'));
    return x.tresor;
  };
  const schluessel = () => {
    if (!x.apiSchluessel) throw new Fachfehler(404, t('meldungen.routen.api-schluessel-sind-nicht'));
    return x.apiSchluessel;
  };
  const autos = () => {
    if (!x.automatisierungen) throw new Fachfehler(404, t('meldungen.routen.automatisierungen-sind-nicht'));
    return x.automatisierungen;
  };
  return { designs, betrieb, region, sprachen, ocr, meldungen, tresor, schluessel, autos };
}

/** Bausteine für Sicherung, Notfall, Anmeldung, Postfächer, Wiederherstellung, Speicherplatz und Wartung. */
export function sicherungsBausteine(x: RoutenExtras, konten: Konten) {
  const sicherung = () => {
    if (!x.sicherung) throw new Fachfehler(404, t('meldungen.routen.sicherungen-sind-nicht-eingerichtet'));
    return x.sicherung;
  };
  const nf = () => {
    if (!x.notfallcode) throw new Fachfehler(404, t('konten.notfall.fehler.aus'));
    return x.notfallcode;
  };
  const exportZiel = () => {
    if (!x.exporte) throw new Fachfehler(404, t('werkbank.export.ohne-ordner'));
    return x.exporte.pfad;
  };
  const oidc = () => {
    if (!x.oidc) throw new Fachfehler(404, t('meldungen.routen.die-anmeldung-ueber-einen'));
    return x.oidc;
  };
  const zf = () => {
    if (!konten.zweifaktor) throw new Fachfehler(404, t('meldungen.routen.die-zwei-faktor-anmeldung'));
    return konten.zweifaktor;
  };
  const pk = () => {
    if (!konten.passkeys) throw new Fachfehler(404, t('anmeldung.passkey.fehler.aus'));
    return konten.passkeys;
  };
  const postfaecher = () => {
    if (!x.postfaecher) throw new Fachfehler(404, t('meldungen.routen.postfaecher-sind-nicht-eingerichtet'));
    return x.postfaecher;
  };
  const pfOAuth = () => {
    if (!x.postfachOAuth) throw new Fachfehler(404, t('meldungen.routen.die-anmeldung-per-oauth'));
    return x.postfachOAuth;
  };
  const wh = () => {
    if (!x.wiederherstellung) throw new Fachfehler(404, t('meldungen.routen.die-wiederherstellung-ist-nicht'));
    return x.wiederherstellung;
  };
  const anbindung = () => {
    if (!x.anbindung) throw new Fachfehler(404, t('meldungen.routen.die-datenbank-anbindung-ist'));
    return x.anbindung;
  };
  const speicherplatz = () => {
    if (!x.speicherplatz) throw new Fachfehler(404, t('meldungen.routen.die-speicherplatz-ueberwachung-ist'));
    return x.speicherplatz;
  };
  const wartung = () => {
    if (!x.wartung) throw new Fachfehler(404, t('meldungen.routen.der-wartungsmodus-ist-nicht'));
    return x.wartung;
  };
  return { sicherung, nf, exportZiel, oidc, zf, pk, postfaecher, pfOAuth, wh, anbindung, speicherplatz, wartung };
}
