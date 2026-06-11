#!/bin/bash

# Limpiar pantalla e inicializar interfaz
clear

# Forzar color de texto en verde clásico de terminal hacker
echo -e "\e[1;32m"

# 1. Configuración silenciosa de herramientas de red y audio básicas
echo "[+] Preparando entorno de audio digital..."
apt update -y &> /dev/null
apt install wget sox -y &> /dev/null

# 2. Descargar los efectos de sonido originales de eDEX-UI en segundo plano
SOUNDS_DIR="$HOME/.config/.dixi_sounds"
mkdir -p "$SOUNDS_DIR"

# URLs directas a los recursos multimedia originales del GitHub de eDEX-UI
URL_KEYSTROKE="https://raw.githubusercontent.com/gsaillard/edex-ui/master/src/media/keystroke1.wav"
URL_STARTUP="https://raw.githubusercontent.com/gsaillard/edex-ui/master/src/media/startup.wav"

# Descargar archivos de sonido únicamente si no existen localmente para ahorrar ancho de banda
if [ ! -f "$SOUNDS_DIR/keystroke.wav" ]; then
    wget -q -O "$SOUNDS_DIR/keystroke.wav" "$URL_KEYSTROKE"
fi

if [ ! -f "$SOUNDS_DIR/startup.wav" ]; then
    wget -q -O "$SOUNDS_DIR/startup.wav" "$URL_STARTUP"
fi

# Definir variables de ruta de audio
SOUND_CLICK="$SOUNDS_DIR/keystroke.wav"
SOUND_STARTUP="$SOUNDS_DIR/startup.wav"

# Limpiar la terminal tras descargar las dependencias para una presentación fluida
clear

# Función para reproducir el chasquido original de teclado de forma asíncrona (no bloqueante)
play_click() {
    if [ -f "$SOUND_CLICK" ]; then
        play -q "$SOUND_CLICK" &> /dev/null &
    else
        echo -en "\a"
    fi
}

# Función para reproducir el sonido de arranque futurista original de eDEX-UI
play_startup() {
    if [ -f "$SOUND_STARTUP" ]; then
        play -q "$SOUND_STARTUP" &> /dev/null &
    else
        echo -en "\a"
        sleep 0.1
        echo -en "\a"
    fi
}

# Función de escritura de caracteres sincronizada con el chasquido real
edex_type() {
    local msg="$1"
    local delay=0.03
    for (( i=0; i<${#msg}; i++ )); do
        echo -en "${msg:$i:1}"
        play_click
        sleep $delay
    done
    echo ""
}

# Función de barra de carga interactiva
edex_loading_bar() {
    local width=30
    echo -n "   ["
    for ((i=0; i<width; i++)); do
        echo -n "█"
        play_click
        sleep 0.04
    done
    echo "]"
}

# --- INICIO DE LA SECUENCIA DE INSTALACIÓN VISUAL Y SONORA ---

# Sonido de arranque inicial de eDEX-UI
play_startup
sleep 0.5

edex_type ">>> INICIANDO SISTEMA DE DESPLIEGUE DIXI PANEL <<<"
edex_type "========================================================="
sleep 0.5

edex_type "[+] Sincronizando núcleos del procesador..."
edex_loading_bar
echo ""

# Ejecución de instalaciones reales de dependencias del sistema de cara al usuario
edex_type "[+] Verificando runtime de ejecución principal (Node.js)..."
if ! command -v node &> /dev/null
then
    edex_type "[!] Alerta de dependencias: Node.js no encontrado."
    edex_type "[+] Descargando e instalando paquetes desde los repositorios..."
    pkg install nodejs -y
else
    edex_type "[+] Runtime de Node.js validado de forma correcta."
fi

edex_type "[+] Instalando dependencias internas del proyecto..."
npm install

edex_type "========================================================="
edex_type "[+] PROCESO DE CONFIGURACIÓN COMPLETADO EXITOSAMENTE"
edex_type "[+] Inicializando el entorno visual..."
edex_type "========================================================="
echo ""

# Sonido final de confirmación de arranque
play_startup
sleep 2.0

# Lanzar el panel gráfico en Node.js
node panel.js