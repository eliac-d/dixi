#!/bin/bash
vibrate_device() {
if command -v termux-vibrate >/dev/null 2>&1; then
termux-vibrate -d 60 >/dev/null 2>&1
sleep 0.05
termux-vibrate -d 60 >/dev/null 2>&1
fi
}
print_line() {
echo -e "$1"
vibrate_device
}
clear
print_line "\e[1;36m========================================================================\e[0m"
print_line "\e[1;31m  _  _  _  _   _   _   ___   _  _     _  _  _   _   ___  ___  _   _  ___  \e[0m"
print_line "\e[1;33m | |/ | || \ | | /*\ |* *| /*| |   | || \ | |/*\ |* *||* *|| \ | |/ _ \ \e[0m"
print_line "\e[1;32m |   |   ||  | |/ _ \ | | / _ \ |*_ | ||  | / _ \ | |  | | |  | | |*| |\e[0m"
print_line "\e[1;34m _*/_*/ |*|_*/*/ _|*|/*/ __**||*||*|_*/*/ _|*| |***|*|_*|___/ \e[0m"
print_line "\e[1;35m                                                                        \e[0m"
print_line "\e[1;36m            Δ   Ι   Ξ   Ι      Ι   Ν   Φ   Ο      Τ   Ε   Ρ   Μ             \e[0m"
print_line "\e[1;36m========================================================================\e[0m"
sleep 1
print_line "\e[1;33m[+] Iniciando análisis de arquitectura del sistema...\e[0m"
sleep 0.5
DIR_ACTUAL=$(pwd)
ARCHIVO_JS="$DIR_ACTUAL/panel.js"
if [ -f "$ARCHIVO_JS" ]; then
print_line "\e[1;32m[✓] Archivo principal detectado de manera local.\e[0m"
if ! grep -q "#!/usr/bin/env node" "$ARCHIVO_JS"; then
sed -i '1s/^/#!/usr/bin/env node\n/' "$ARCHIVO_JS"
fi
chmod +x "$ARCHIVO_JS"
else
print_line "\e[1;31m[✗] Error crítico: No se encontró dixi_panel.js en el directorio actual.\e[0m"
exit 1
fi
print_line "\e[1;33m[+] Determinando el entorno de terminal para la instalación...\e[0m"
sleep 0.5
if [ -n "$TERMUX_VERSION" ] || [ -d "/data/data/com.termux" ]; then
print_line "\e[1;34m[i] Dispositivo Termux (Android) identificado.\e[0m"
RUTA_BIN="$PREFIX/bin/dixi"
else
print_line "\e[1;34m[i] Servidor VPS (Linux Distro) identificado.\e[0m"
RUTA_BIN="/usr/local/bin/dixi"
fi
print_line "\e[1;33m[+] Depurando posibles comandos globales anteriores...\e[0m"
if [ -L "$RUTA_BIN" ] || [ -f "$RUTA_BIN" ]; then
rm -f "$RUTA_BIN"
fi
sleep 0.5
print_line "\e[1;33m[+] Registrando acceso simbólico en el núcleo de comandos...\e[0m"
if ln -s "$ARCHIVO_JS" "$RUTA_BIN"; then
print_line "\e[1;32m[✓] Enlace global creado de forma correcta.\e[0m"
else
print_line "\e[1;31m[✗] Error al escribir el binario del comando global en el sistema.\e[0m"
exit 1
fi
sleep 0.5
print_line "\e[1;36m========================================================================\e[0m"
print_line "\e[1;32m ¡INSTALACIÓN COMPLETADA EXITOSAMENTE! \e[0m"
print_line "\e[1;37m Ejecuta el monitor desde cualquier lugar ingresando el comando: \e[0m"
print_line "\e[1;33m dixi \e[0m"
print_line "\e[1;36m========================================================================\e[0m"
