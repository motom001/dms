/**
 * Hilfen der Routen, die Dienste brauchen (#960): einmal je Aufruf von routen() gebaut und jeder Routendatei
 * als Parameter übergeben. Aus routen() hierher verschoben, unverändert; seit #1278 (Schritt 6b-1) in benannten
 * Gruppen in `routen-kontext-*.ts`, hier zusammengesetzt.
 */
import type { Dienst } from '../dienst/dienst';
import type { Konten } from '../konten';
import { AbrufBremse, AbrufTickets } from '../datenschutz/abruf';
import { L } from './routen-hilfen';
import type { RoutenExtras } from './routen-extras';
import { kontextTeile } from './routen-kontext-teile';
import { betriebsBausteine, sicherungsBausteine } from './routen-kontext-bausteine';
import { rechteHilfen, zugangHilfen } from './routen-kontext-rechte';
import { abrufHilfen, ausgabeDatei, fuerAnzeige, passwoerterAnzeigen } from './routen-kontext-dateien';
import { adressHilfen, einstellungsHilfen, exportHilfen, notfallHilfen } from './routen-kontext-betrieb';

export function routenKontext(dienst: Dienst, konten: Konten, x: RoutenExtras = {}) {
  const { messung, system } = x;
  const log = x.log ?? ((m: string) => L.mail.warn(m));
  // Gebaut in der bisherigen Reihenfolge: Fotostapel, Pakete, Entdecken, Rundgänge, Umwandlung.
  const teile = kontextTeile(dienst, konten, x);
  const betrieb = betriebsBausteine(x);
  const sicherung = sicherungsBausteine(x, konten);
  const rechte = rechteHilfen(dienst, konten);
  const zugang = zugangHilfen(dienst, konten, x, rechte.zg);
  const abruf = abrufHilfen(dienst, rechte.zg, zugang.modusSpur);
  /** Auskunft zustellen (#455): Einmal-Tickets der öffentlichen Abrufseite. */
  const abrufTickets = new AbrufTickets(Date.now, dienst.kurzzustand);
  /** Fehlversuche je IP-Bereich über alle Abruf-Links und gleichzeitige Code-Prüfungen – getrennt vom Anmeldeschutz. */
  const abrufBremse = new AbrufBremse({ zustand: dienst.kurzzustand });
  return {
    dienst,
    konten,
    x,
    messung,
    system,
    log,
    ...teile,
    ...betrieb,
    ...sicherung,
    ...rechte,
    ...zugang,
    ...abruf,
    fuerAnzeige,
    ausgabeDatei,
    passwoerterAnzeigen,
    ...einstellungsHilfen(dienst, konten, x),
    ...exportHilfen(dienst, x),
    ...notfallHilfen(dienst, konten, x, betrieb.tresor),
    ...adressHilfen(x, sicherung.postfaecher),
    abrufTickets,
    abrufBremse,
  };
}

export type RoutenKontext = ReturnType<typeof routenKontext>;
