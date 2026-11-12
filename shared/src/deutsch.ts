/**
 * Deutsch, die Ausgangssprache (#731): alle Bereiche auf einmal – für die Prüfung von Sprachpaketen (welche Schlüssel und
 * Platzhalter es gibt) und ihre Abdeckung („Übersetzung 94 % vollständig“). Nur der Server lädt das; die Oberfläche holt
 * ihre Bereiche einzeln (web/src/sprache.ts).
 */
import type { Sprachdatei } from './sprache';
import ablage from './sprachen/de/ablage.json';
import aehnlich from './sprachen/de/aehnlich.json';
import anmeldung from './sprachen/de/anmeldung.json';
import api from './sprachen/de/api.json';
import automatisierung from './sprachen/de/automatisierung.json';
import dritte from './sprachen/de/dritte.json';
import einrichtung from './sprachen/de/einrichtung.json';
import entdecken from './sprachen/de/entdecken.json';
import ereignisse from './sprachen/de/ereignisse.json';
import erkennung from './sprachen/de/erkennung.json';
import felder from './sprachen/de/felder.json';
import fragen from './sprachen/de/fragen.json';
import gemeinsam from './sprachen/de/gemeinsam.json';
import konten from './sprachen/de/konten.json';
import lasttest from './sprachen/de/lasttest.json';
import mail from './sprachen/de/mail.json';
import mappen from './sprachen/de/mappen.json';
import mappentypen from './sprachen/de/mappentypen.json';
import meldungen from './sprachen/de/meldungen.json';
import notfall from './sprachen/de/notfall.json';
import oberflaeche from './sprachen/de/oberflaeche.json';
import pakete from './sprachen/de/pakete.json';
import profil from './sprachen/de/profil.json';
import spalten from './sprachen/de/spalten.json';
import start from './sprachen/de/start.json';
import suche from './sprachen/de/suche.json';
import systemzustand from './sprachen/de/systemzustand.json';
import termine from './sprachen/de/termine.json';
import volltext from './sprachen/de/volltext.json';
import werkbank from './sprachen/de/werkbank.json';

export const DEUTSCH: Readonly<Record<string, Sprachdatei>> = { ablage, aehnlich, anmeldung, api, automatisierung, dritte, einrichtung, entdecken, ereignisse, erkennung, felder, fragen, gemeinsam, konten, lasttest, mail, mappen, mappentypen, meldungen, notfall, oberflaeche, pakete, profil, spalten, start, suche, systemzustand, termine, volltext, werkbank };
