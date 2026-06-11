#!/bin/bash
clear
apt update && apt upgrade -y
pkg install nodejs git ffmpeg imagemagick libwebp -y
npm install -g pm2
mkdir -p $HOME/Kirito-Panel
cd $HOME/Kirito-Panel
git clone https://github.com/eliac-d/dixi .
npm install blessed blessed-contrib
echo "node panel.js" > start.sh
chmod +x start.sh
./start.sh
