#!/bin/bash
pkg update && pkg upgrade -y
pkg install nodejs git ffmpeg imagemagick libwebp -y
npm install -g pm2
npm install blessed
# Ejecuta el panel para que él se encargue de todo lo demás
node panel.js
