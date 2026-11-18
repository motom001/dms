#!/usr/bin/env bash
# apt-spiegel.sh – vor `playwright install-deps` auf den Rechnern von GitHub aufrufen.
#
# Die Rechner holen Pakete über eine Spiegelliste (/etc/apt/apt-mirrors.txt, Methode mirror+file). Steht dort ein
# langsamer Spiegel vorn (18.11.2026: us-east-2.ec2.archive.ubuntu.com, unter 3 Pakete je Minute), hängt die
# Installation, bis der Zeitgrenze des Schritts greift. Dieses Skript stellt verlässliche Spiegel nach vorn, lässt die
# bisherigen als Rückfall dahinter und setzt kurze Zeitgrenzen, damit apt bei einem hängenden Spiegel weiterspringt.
# Ohne Spiegelliste (anderer Rechner) tut es nichts.
set -u
liste=/etc/apt/apt-mirrors.txt
[ -f "$liste" ] || exit 0
{
  printf '%s\n' http://azure.archive.ubuntu.com/ubuntu/ http://archive.ubuntu.com/ubuntu/
  grep -vE '^(http://azure\.archive\.ubuntu\.com/ubuntu/|http://archive\.ubuntu\.com/ubuntu/)' "$liste" || true
} > /tmp/apt-mirrors.txt
sudo cp /tmp/apt-mirrors.txt "$liste"
printf '%s\n' 'Acquire::http::Timeout "20";' 'Acquire::Retries "3";' | sudo tee /etc/apt/apt.conf.d/99ablago-spiegel > /dev/null
echo "apt-Spiegel: $(head -n 2 "$liste" | tr '\n' ' ')"
