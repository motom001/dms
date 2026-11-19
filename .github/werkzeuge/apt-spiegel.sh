#!/usr/bin/env bash
# apt-spiegel.sh – vor `playwright install-deps` auf den Rechnern von GitHub aufrufen; apt-pakete.sh ruft es ab dem
# zweiten Versuch selbst auf.
#
# Die Rechner holen Pakete über eine Spiegelliste (/etc/apt/apt-mirrors.txt, Methode mirror+file). Steht dort ein
# langsamer Spiegel vorn (18.11.2026: us-east-2.ec2.archive.ubuntu.com, unter 3 Pakete je Minute), hängt die
# Installation, bis der Zeitgrenze des Schritts greift. Dieses Skript stellt verlässliche Spiegel nach vorn, lässt die
# bisherigen als Rückfall dahinter und setzt kurze Zeitgrenzen, damit apt bei einem hängenden Spiegel weiterspringt.
# Ohne Spiegelliste (anderer Rechner) tut es nichts.
set -u
liste=/etc/apt/apt-mirrors.txt
[ -f "$liste" ] || exit 0
# apt wählt nach „priority:“, nicht nach der Reihenfolge: die neuen Spiegel bekommen 1 und 2, die bisherigen
# rücken mit ihrer Priorität + 10 dahinter.
{
  printf 'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1\nhttp://archive.ubuntu.com/ubuntu/\tpriority:2\n'
  grep -vE '^(http://azure\.archive\.ubuntu\.com/ubuntu/|http://archive\.ubuntu\.com/ubuntu/)' "$liste" \
    | awk -F'\t' '{ p = 10; for (i = 2; i <= NF; i++) if ($i ~ /^priority:/) { p = substr($i, 10) + 10; $i = "" }
        out = $1; for (i = 2; i <= NF; i++) if ($i != "") out = out "\t" $i; print out "\tpriority:" p }' || true
} > /tmp/apt-mirrors.txt
sudo cp /tmp/apt-mirrors.txt "$liste"
# security.ubuntu.com steht nicht in der Spiegelliste, sondern direkt in den Quellen – am 19.11.2026 kamen poppler und
# qpdf von dort und scheiterten („Could not wait for server fd“). Dieselben Spiegel führen auch die Suite „-security“:
# auf die Spiegelliste umstellen, die Paketlisten holt das nächste „apt-get update“.
for q in /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources; do
  [ -f "$q" ] && grep -q 'security\.ubuntu\.com' "$q" \
    && sudo sed -i -E "s#https?://security\.ubuntu\.com/ubuntu/?#mirror+file:$liste#g" "$q"
done
printf '%s\n' 'Acquire::http::Timeout "20";' 'Acquire::Retries "3";' | sudo tee /etc/apt/apt.conf.d/99ablago-spiegel > /dev/null
echo "apt-Spiegel: $(head -n 2 "$liste" | tr '\n' ' ')"
