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

edex_type() {
    local msg="$1"
    local delay=0.03
    printf '\a\a'
    for (( i=0; i<${#msg}; i++ )); do
        echo -en "${msg:$i:1}"
        sleep $delay
    done
    echo ""
}

edex_loading_bar() {
    local width=30
    echo -n "   ["
    printf '\a\a'
    for ((i=0; i<width; i++)); do
        echo -n "█"
        sleep 0.04
    done
    echo "]"
}

play_startup
sleep 0.5

edex_type ">>> INICIANDO SISTEMA DE DESPLIEGUE DIXI PANEL <<<"
edex_type "========================================================="
sleep 0.5

edex_type "[+] Sincronizando núcleos del procesador..."
edex_loading_bar
echo ""

edex_type "[+] Verificando runtime de ejecución principal (Node.js)..."
if ! command -v node &> /dev/null
then
    edex_type "[!] Alerta de dependencias: Node.js no encontrado."
    edex_type "[+] Descargando e instalando paquetes desde los repositorios..."
    printf '\a\a'
    pkg install nodejs -y
else
    edex_type "[+] Runtime de Node.js validado de forma correcta."
fi

edex_type "[+] Instalando dependencias internas del proyecto..."
printf '\a\a'
npm install

edex_type "========================================================="
edex_type "[+] PROCESO DE CONFIGURACIÓN COMPLETADO EXITOSAMENTE"
edex_type "[+] Inicializando el entorno visual..."
edex_type "========================================================="
echo ""

play_startup
sleep 2.0

node panel.js
