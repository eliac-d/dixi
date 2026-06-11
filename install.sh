#!/bin/bash
pkg update && pkg upgrade -y
pkg install nodejs git ffmpeg imagemagick libwebp -y
npm install -g pm2
git clone https://github.com/eliac-d/kirito-Bot-MD
cd kirito-Bot-MD
npm install
npm install blessed blessed-contrib
echo "INSTALACIÓN COMPLETADA. EJECUTA: node panel.js"
