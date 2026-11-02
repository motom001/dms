/*
 * Selbstcheck „Wo hakt es?“ (#163): macht aus der Frageliste ein kleines Quiz.
 * Ohne JavaScript bleibt die Liste lesbar. Es wird nichts gespeichert oder gesendet.
 */
(function () {
  function start() {
    var box = document.querySelector('.selbstcheck');
    if (!box || box.dataset.fertig) return;
    box.dataset.fertig = '1';
    var fragen = Array.prototype.slice.call(box.querySelectorAll('ol > li'));
    var stufen = [['ja', 'Ja, sofort'], ['suchen', 'Mit Suchen'], ['nein', 'Nein / weiß nicht']];
    fragen.forEach(function (li, i) {
      var tipp = li.querySelector('em');
      if (tipp) { tipp.classList.add('tipp'); tipp.hidden = true; }
      var wahl = document.createElement('div');
      wahl.className = 'wahl';
      wahl.setAttribute('role', 'radiogroup');
      stufen.forEach(function (s) {
        var l = document.createElement('label');
        var r = document.createElement('input');
        r.type = 'radio'; r.name = 'frage' + i; r.value = s[0];
        r.addEventListener('change', auswerten);
        l.appendChild(r); l.appendChild(document.createTextNode(' ' + s[1]));
        wahl.appendChild(l);
      });
      // Antworten direkt unter der Frage, der Hinweis darunter.
      if (tipp) li.insertBefore(wahl, tipp); else li.appendChild(wahl);
    });
    var ergebnis = document.createElement('div');
    ergebnis.className = 'ergebnis';
    ergebnis.setAttribute('aria-live', 'polite');
    box.appendChild(ergebnis);
    var neu = document.createElement('button');
    neu.type = 'button'; neu.className = 'md-button'; neu.textContent = 'Von vorn';
    neu.addEventListener('click', function () {
      box.querySelectorAll('input').forEach(function (r) { r.checked = false; });
      auswerten();
    });
    box.appendChild(neu);

    function auswerten() {
      var beantwortet = 0, luecken = 0, halb = 0;
      fragen.forEach(function (li, i) {
        var r = box.querySelector('input[name="frage' + i + '"]:checked');
        var tipp = li.querySelector('.tipp');
        li.classList.remove('ja', 'suchen', 'nein');
        if (r) { beantwortet++; li.classList.add(r.value); if (r.value === 'nein') luecken++; if (r.value === 'suchen') halb++; }
        if (tipp) tipp.hidden = !r || r.value === 'ja';
      });
      if (!beantwortet) { ergebnis.textContent = ''; return; }
      var text;
      if (beantwortet < fragen.length) text = beantwortet + ' von ' + fragen.length + ' Fragen beantwortet.';
      else if (!luecken && !halb) text = 'Alles sofort gewusst – du hast deine Unterlagen gut im Griff. Ein DMS lohnt sich für dich vor allem, wenn andere mit darauf zugreifen sollen.';
      else if (luecken + halb <= 3) text = 'Fast alles da. Unter den Fragen mit „Mit Suchen“ oder „Nein“ steht, was ein DMS dort leichter macht.';
      else text = 'Bei ' + (luecken + halb) + ' von ' + fragen.length + ' Fragen musstest du suchen oder passen. Das ist völlig normal – genau dort nimmt dir ein DMS Arbeit ab. Die Hinweise unter den Fragen zeigen, wie.';
      ergebnis.textContent = text;
    }
  }
  // Material for MkDocs: auch nach Seitenwechsel ohne Neuladen.
  if (window.document$ && window.document$.subscribe) window.document$.subscribe(start);
  else document.addEventListener('DOMContentLoaded', start);
})();
