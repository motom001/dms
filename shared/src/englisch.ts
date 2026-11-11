/**
 * Englisch (#729): fest eingebaut, vollständig – Oberfläche, Meldungen, E-Mails und Notfallblatt. Die Texte stehen in
 * `sprachen/en/<bereich>.json` mit denselben Schlüsseln und Platzhaltern wie Deutsch (prüft die CI). Der Server trägt
 * sie beim Start ein, die Oberfläche lädt sie erst, wenn jemand Englisch gewählt hat (eigener Teil des Bundles).
 */
import { registriereSprache, type Sprachdatei } from './sprache';
import ablage from './sprachen/en/ablage.json';
import aehnlich from './sprachen/en/aehnlich.json';
import anmeldung from './sprachen/en/anmeldung.json';
import api from './sprachen/en/api.json';
import automatisierung from './sprachen/en/automatisierung.json';
import dritte from './sprachen/en/dritte.json';
import einrichtung from './sprachen/en/einrichtung.json';
import entdecken from './sprachen/en/entdecken.json';
import ereignisse from './sprachen/en/ereignisse.json';
import erkennung from './sprachen/en/erkennung.json';
import felder from './sprachen/en/felder.json';
import fragen from './sprachen/en/fragen.json';
import gemeinsam from './sprachen/en/gemeinsam.json';
import konten from './sprachen/en/konten.json';
import lasttest from './sprachen/en/lasttest.json';
import mail from './sprachen/en/mail.json';
import mappen from './sprachen/en/mappen.json';
import mappentypen from './sprachen/en/mappentypen.json';
import meldungen from './sprachen/en/meldungen.json';
import notfall from './sprachen/en/notfall.json';
import oberflaeche from './sprachen/en/oberflaeche.json';
import pakete from './sprachen/en/pakete.json';
import profil from './sprachen/en/profil.json';
import spalten from './sprachen/en/spalten.json';
import start from './sprachen/en/start.json';
import suche from './sprachen/en/suche.json';
import systemzustand from './sprachen/en/systemzustand.json';
import termine from './sprachen/en/termine.json';
import volltext from './sprachen/en/volltext.json';
import werkbank from './sprachen/en/werkbank.json';

export const ENGLISCH: Readonly<Record<string, Sprachdatei>> = { ablage, aehnlich, anmeldung, api, automatisierung, dritte, einrichtung, entdecken, ereignisse, erkennung, felder, fragen, gemeinsam, konten, lasttest, mail, mappen, mappentypen, meldungen, notfall, oberflaeche, pakete, profil, spalten, start, suche, systemzustand, termine, volltext, werkbank };

/** Englisch eintragen – danach liefert jeder Übersetzer englische Texte, sobald die Sprache „en“ gilt. */
export const registriereEnglisch = () => registriereSprache('en', ENGLISCH);
