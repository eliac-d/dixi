#!/bin/bash

clear
echo -e "\e[1;32m"

apt update -y &> /dev/null

clear

play_click() {
    printf '\a'
}

play_startup() {
    printf '\a\a'
    sleep 0.1
    printf '\a\a'
}

edex_print() {
    local msg="$1"
    printf '\a\a'
    echo -e "$msg"
    sleep 0.3
}

play_startup
sleep 0.5

edex_print ">>> INICIANDO SISTEMA DE DESPLIEGUE DIXI PANEL <<<"
edex_print "========================================================="
sleep 0.2

edex_print "[+] Sincronizando núcleos del procesador..."
echo ""

edex_print "[+] Verificando runtime de ejecución principal (Node.js)..."
if ! command -v node &> /dev/null
then
    edex_print "[!] Alerta de dependencias: Node.js no encontrado."
    edex_print "[+] Descargando e instalando paquetes desde los repositorios..."
    printf '\a\a'
    pkg install nodejs -y
else
    edex_print "[+] Runtime de Node.js validado de forma correcta."
fi

edex_print "[+] Instalando dependencias internas del proyecto..."
printf '\a\a'
npm install

edex_print "========================================================="
edex_print "[+] PROCESO DE CONFIGURACIÓN COMPLETADO EXITOSAMENTE"
edex_print "[+] Inicializando el entorno visual..."
edex_print "========================================================="
echo ""

play_startup
sleep 2.0

node panel.js
