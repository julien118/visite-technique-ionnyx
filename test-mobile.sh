#!/usr/bin/env bash
# =============================================================
# Tester l'app sur téléphone SANS déployer — via Cloudflare Tunnel
# =============================================================
# Pourquoi Cloudflare et pas ngrok ?
#   ngrok (plan gratuit) insère une page d'avertissement "ERR_NGROK_6024"
#   AUSSI sur les fichiers .js → Safari iOS reçoit du HTML à la place du
#   JavaScript → React ne démarre pas → les boutons ne réagissent pas.
#   Cloudflare Tunnel n'a pas cet interstitiel : le JS se sert normalement.
#
# Usage :  ./test-mobile.sh
#   → démarre le serveur de dev si besoin, ouvre un tunnel HTTPS,
#     et affiche l'URL à ouvrir sur le téléphone.
#   Ctrl+C pour tout arrêter.
# Prérequis (déjà installés) :  cloudflared  (brew install cloudflared)
# NB : l'URL trycloudflare.com change à chaque lancement (normal, plan gratuit).
# =============================================================
set -euo pipefail
cd "$(dirname "$0")"

PORT=3000

# 1) Serveur de dev : on le lance seulement s'il ne tourne pas déjà.
if lsof -i ":$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "✓ Serveur de dev déjà actif sur le port $PORT"
else
  echo "▸ Démarrage de 'npm run dev'…"
  npm run dev >/tmp/mtc-dev.log 2>&1 &
  # on attend qu'il écoute
  for _ in $(seq 1 40); do
    lsof -i ":$PORT" -sTCP:LISTEN >/dev/null 2>&1 && break
    sleep 1
  done
  echo "✓ Serveur de dev prêt"
fi

# 2) Tunnel Cloudflare (HTTPS de confiance, pas d'interstitiel).
echo "▸ Ouverture du tunnel Cloudflare…"
CFLOG="$(mktemp)"
cloudflared tunnel --url "http://localhost:$PORT" >"$CFLOG" 2>&1 &
CF_PID=$!
trap 'echo; echo "Arrêt du tunnel."; kill "$CF_PID" 2>/dev/null || true' INT TERM

# 3) On récupère et on affiche l'URL publique.
URL=""
for _ in $(seq 1 30); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$CFLOG" | head -1 || true)"
  [ -n "$URL" ] && break
  sleep 1
done

if [ -z "$URL" ]; then
  echo "✗ Impossible de récupérer l'URL. Log :"; cat "$CFLOG"; exit 1
fi

echo
echo "==================================================================="
echo "  📱 Ouvre cette URL sur ton téléphone :"
echo
echo "      $URL"
echo
echo "  (HTTPS de confiance • micro OK • marche en 4G)"
echo "  Ctrl+C pour arrêter le tunnel."
echo "==================================================================="
wait "$CF_PID"
