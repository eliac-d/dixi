#!/bin/bash
clear
echo "--- PREPARANDO ENTORNO ---"
apt update && apt upgrade -y
apt install nodejs git ffmpeg imagemagick libwebp -y
npm install -g pm2

echo "--- CLONANDO E INSTALANDO BOT ---"
git clone https://github.com/eliac-d/kirito-Bot-MD
cd kirito-Bot-MD
npm install
npm install blessed blessed-contrib

echo "--- CONFIGURANDO PANEL ---"
# Aquí asumimos que tienes el archivo panel.js en tu carpeta actual
# Vamos a moverlo dentro de la carpeta del bot para tener todo junto
cd ..
cp panel.js kirito-Bot-MD/
cd kirito-Bot-MD

echo "--- INICIANDO BOT CON PM2 ---"
pm2 start index.js --name "kirito-bot" --watch

echo "--- INSTALACIÓN COMPLETADA ---"
echo "Para abrir el panel, entra a la carpeta y ejecuta: node panel.js"
node panel.js
