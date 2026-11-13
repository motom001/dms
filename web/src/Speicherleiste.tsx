/**
 * Die Speicherleiste ist seit #1210 ein Baustein (`web/src/bausteine/speicherleiste/`). Diese Datei leitet nur weiter,
 * damit die Formulare der Werkbank ihren Import behalten; neuer Code importiert aus `./bausteine`.
 */
export { Speicherleiste, useEntwurf, useGespeichertNachziehen, type Entwurf, type SpeicherleisteLoeschen, type SpeicherleisteProps } from './bausteine';
