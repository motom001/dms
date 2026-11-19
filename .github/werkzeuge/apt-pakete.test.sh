#!/usr/bin/env bash
# Test für apt-pakete.sh: höchstens drei Versuche, Spiegelwechsel einmal ab dem zweiten, update erst ab dem zweiten.
# sudo, apt-get und das Spiegel-Skript sind Attrappen; nichts am Rechner wird verändert.
set -u
cd "$(dirname "$0")" || exit 1; f=0; d=$(mktemp -d); trap 'rm -rf "$d"' EXIT
printf '#!/usr/bin/env bash\n"$@"\n' > "$d/sudo"
# apt-get: schreibt jeden Aufruf mit; „install“ scheitert, solange in $FEHL mehr als 0 steht.
cat > "$d/apt-get" <<'ATTRAPPE'
#!/usr/bin/env bash
echo "$1" >> "$PROTOKOLL"
if [ "$1" = install ]; then n=$(cat "$FEHL"); [ "$n" -gt 0 ] && { echo $((n - 1)) > "$FEHL"; exit 100; }; fi
exit 0
ATTRAPPE
# shellcheck disable=SC2016 # $PROTOKOLL soll erst in der Attrappe aufgelöst werden.
printf '#!/usr/bin/env bash\necho spiegel >> "$PROTOKOLL"\n' > "$d/spiegel.sh"
chmod +x "$d/sudo" "$d/apt-get" "$d/spiegel.sh"
lauf() { local fehl=$1 soll_rc=$2 soll=$3 rc ist
  : > "$d/protokoll"; echo "$fehl" > "$d/fehl"
  PATH="$d:$PATH" PROTOKOLL="$d/protokoll" FEHL="$d/fehl" APT_SPIEGEL="$d/spiegel.sh" APT_PAUSE=0 \
    ./apt-pakete.sh poppler-utils qpdf >/dev/null 2>&1; rc=$?
  ist=$(tr '\n' ' ' < "$d/protokoll" | sed 's/ $//')
  if [ "$rc" != "$soll_rc" ] || [ "$ist" != "$soll" ]; then
    echo "FEHLER: $fehl Fehlschläge → rc $rc, '$ist'; erwartet rc $soll_rc, '$soll'"; f=1
  fi; }
lauf 0 0 "install"
lauf 1 0 "install spiegel update install"
lauf 2 0 "install spiegel update install update install"
lauf 5 1 "install spiegel update install update install"
./apt-pakete.sh >/dev/null 2>&1; [ $? = 2 ] || { echo "FEHLER: ohne Pakete kein Abbruch mit 2"; f=1; }
[ "$f" = 0 ] && echo "apt-pakete: alle Fälle in Ordnung"
exit "$f"
