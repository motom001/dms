#!/usr/bin/env bash
# Formatier-Commits nachprüfen (#1280, Bedingung Sicherheit): Ein Commit, der nur die Ausgabe von Prettier enthalten
# soll, muss genau das sein, was Prettier in der festen Version auf dem Stand davor erzeugt – keine Zeile mehr.
#
#   formatierung-nachpruefen.sh <commit> …     die genannten Commits prüfen
#   formatierung-nachpruefen.sh --neu <basis>  alle Commits, die gegenüber <basis> im Abschnitt „Formatierer“ von
#                                              .git-blame-ignore-revs neu stehen (so prüft die CI im Pull Request)
#
# Je Commit: Stand des Elternteils in einem eigenen Arbeitsbaum auschecken, dort `prettier --write .` (bis nichts mehr
# zu tun ist, wie `npm run format`) mit dessen
# .prettierrc.json und .prettierignore laufen lassen, Ergebnis mit dem Commit vergleichen. Der Unterschied muss leer
# sein. Prettier kommt aus node_modules (npm ci) und muss die Version haben, die der Elternteil in package.json festlegt.
# Exit 0 = alle Commits sind reine Formatierer-Ausgabe; Exit 1 = nein (Unterschied auf stdout).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
PRETTIER="$PWD/node_modules/.bin/prettier"
[ -x "$PRETTIER" ] || { echo "Prettier fehlt – erst npm ci im Wurzelordner"; exit 1; }

# Hashes im Abschnitt „Formatierer“ (ab der Kommentarzeile „# Formatierer“ bis zur nächsten Leerzeile).
abschnitt() { awk '/^# Formatierer/{a=1; next} a && /^[[:space:]]*$/{a=0} a && /^[0-9a-f]{40}$/{print}'; }

if [ "${1:-}" = --neu ]; then
  basis="${2:?Basis fehlt}"
  mapfile -t commits < <(comm -13 <(git show "$basis:.git-blame-ignore-revs" 2>/dev/null | abschnitt | sort) \
    <(abschnitt < .git-blame-ignore-revs | sort))
  [ "${#commits[@]}" -gt 0 ] || { echo "Keine neuen Formatier-Commits in .git-blame-ignore-revs."; exit 0; }
else
  commits=("$@")
  [ "${#commits[@]}" -gt 0 ] || { echo "Aufruf: $0 <commit> … | --neu <basis>"; exit 1; }
fi

fehler=0
for c in "${commits[@]}"; do
  # In der CI ist nur ein flacher Stand da: Commit und Elternteil gezielt holen.
  git cat-file -e "$c^{commit}" 2>/dev/null && git cat-file -e "$c^^{commit}" 2>/dev/null || git fetch -q --depth=2 origin "$c"
  c=$(git rev-parse "$c^{commit}") # als Hash: „HEAD“ hieße im Arbeitsbaum unten etwas anderes
  soll=$(git show "$c^:package.json" | node -e 'let s="";process.stdin.on("data",(d)=>s+=d).on("end",()=>console.log(JSON.parse(s).devDependencies?.prettier ?? ""))')
  ist=$("$PRETTIER" --version)
  if [ "$soll" != "$ist" ]; then
    echo "::error::$c: Prettier $ist installiert, der Stand davor legt ${soll:-keine Version} fest"; fehler=1; continue
  fi
  baum=$(mktemp -d)
  git worktree add -q --detach "$baum" "$c^"
  # Prettier ist nicht in jedem Fall in einem Lauf fertig (lange Methodenketten): bis nichts mehr zu tun ist, höchstens dreimal.
  (cd "$baum" && for _ in 1 2 3; do "$PRETTIER" --check . --log-level silent && break; "$PRETTIER" --write . --log-level warn; done)
  if git -C "$baum" diff --quiet "$c"; then
    echo "$c: reine Ausgabe von Prettier $ist ($(git diff --shortstat "$c^" "$c"))"
  else
    echo "::error::$c ist nicht genau die Ausgabe von Prettier $ist auf dem Stand davor:"
    git -C "$baum" diff --stat "$c" | tail -20
    fehler=1
  fi
  git worktree remove --force "$baum"
done
exit "$fehler"
