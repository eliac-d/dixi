#!/bin/bash
pkg update && pkg upgrade -y
pkg install nodejs git ffmpeg imagemagick libwebp -y
npm install blessed blessed-contrib
node panel.js
