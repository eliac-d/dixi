#!/bin/bash

# Limpiar la pantalla para iniciar la interfaz de instalación
clear

# Función para simular una escritura rápida con pitidos futuristas
hacker_type() {
    local msg="$1"
    local delay=0.02
    for (( i=0; i<${#msg}; i++ )); do
        echo -en "${msg:$i:1}"
        # Emitir el pitido nativo de la terminal cada 3 caracteres para no saturar el buffer
        if (( i % 3 == 0 )); then
            echo -en "\a"
        fi
        sleep $delay
    done
    echo ""
}

# Función para simular una barra de carga futurista con sonido secuencial acelerado
hacker_loading_bar() {
    local width=30
    echo -n "   ["
    for ((i=0; i<width; i++)); do
        echo -n "█"
        # Emitir un pitido en cada paso de la barra de carga
        echo -en "\a"
        sleep 0.04
    done
    echo "]"
}

# Inicio de la secuencia de instalación visual y sonora
echo -e "\e[1;32m" # Cambiar color a verde brillante de terminal clásica
hacker_type ">>> INICIANDO PROTOCOLO DE INSTALACIÓN DIXI PANEL <<<"
hacker_type "========================================================="
sleep 0.5

hacker_type "[+] Estableciendo enlace seguro con los servidores..."
hacker_loading_bar
echo ""

# 1. Actualizar repositorios y paquetes del sistema
hacker_type "[+] Descargando metadatos y repositorios del sistema..."
apt update -y && apt upgrade -y

# 2. Instalar Node.js si no está instalado
hacker_type "[+] Analizando dependencias locales (Node.js)..."
if ! command -v node &> /dev/null
then
    hacker_type "[!] Alerta: Node.js no detectado en el entorno."
    hacker_type "[+] Descargando e instalando runtime compatible..."
    pkg install nodejs -y
else
    hacker_type "[+] Node.js detectado de forma correcta."
fi

# 3. Instalar dependencias del proyecto (blessed)
hacker_type "[+] Sincronizando librerías del panel de control..."
npm install

# 4. Configuración finalizada con sonidos de confirmación
hacker_type "========================================================="
hacker_type "[+] COMPILACIÓN FINALIZADA CORRECTAMENTE"
hacker_type "[+] El servicio local está listo para inicializarse."
hacker_type "========================================================="
echo ""

# Triple pitido rápido para avisar que la terminal ha terminado la tarea
echo -en "\a"
sleep 0.1
echo -en "\a"
sleep 0.1
echo -en "\a"

sleep 1.5

# Ejecutar el panel
node panel.js