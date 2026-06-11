#!/bin/bash

# Limpiar la pantalla para iniciar la interfaz de instalación estilo eDEX-UI
clear

# Forzar salida en color verde brillante (estilo fósforo clásico de eDEX-UI)
echo -e "\e[1;32m"

# Intentar instalar sox silenciosamente al inicio solo para generar los efectos de sonido precisos de eDEX-UI
apt update -y &> /dev/null
apt install sox -y &> /dev/null

# Función para reproducir el característico "click" digital de teclado de eDEX-UI
play_click() {
    # Si 'play' (de sox) está disponible, genera un chasquido metálico ultra-corto (ruido blanco filtrado de 15ms)
    if command -v play &> /dev/null; then
        play -q -n synth 0.015 noctave 8000 &
    else
        # Alternativa nativa ultraligera si no se ha instalado sox todavía (pitido de alta frecuencia de 10ms)
        echo -en "\a"
    fi
}

# Función para reproducir el pitido agudo de confirmación de eDEX-UI (un tono de 880Hz por 80ms)
play_beep() {
    if command -v play &> /dev/null; then
        play -q -n synth 0.08 sin 880 &
    else
        echo -en "\a"
        sleep 0.05
        echo -en "\a"
    fi
}

# Función para el efecto de escritura con sonido de teclado eDEX-UI característico
edex_type() {
    local msg="$1"
    local delay=0.03
    for (( i=0; i<${#msg}; i++ )); do
        echo -en "${msg:$i:1}"
        # Cada carácter que se imprime genera el chasquido metálico característico
        play_click
        sleep $delay
    done
    echo ""
}

# Función para la barra de progreso con el sonido de carga secuencial de eDEX-UI
edex_loading_bar() {
    local width=30
    echo -n "   ["
    for ((i=0; i<width; i++)); do
        echo -n "█"
        play_click
        sleep 0.05
    done
    echo "]"
    play_beep
}

# Inicio del despliegue visual y sonoro al estilo eDEX-UI
edex_type ">>> INICIANDO ENTORNO OPERATIVO DIXI PANEL <<<"
edex_type "========================================================="
sleep 0.5

edex_type "[+] Estableciendo conexión con la base de datos local..."
edex_loading_bar
echo ""

# 1. Actualizar repositorios y paquetes del sistema
edex_type "[+] Sincronizando repositorios y actualizando paquetes..."
apt update -y && apt upgrade -y

# 2. Instalar Node.js si no está instalado
edex_type "[+] Verificando la presencia de Node.js..."
if ! command -v node &> /dev/null
then
    edex_type "[!] Alerta: Node.js no está instalado en el sistema."
    edex_type "[+] Descargando dependencias de Node.js..."
    pkg install nodejs -y
else
    edex_type "[+] Node.js detectado de forma correcta."
fi

# 3. Instalar dependencias del proyecto (blessed)
edex_type "[+] Descargando módulos de interfaz visual (npm install)..."
npm install

# 4. Configuración finalizada con sonidos de confirmación
edex_type "========================================================="
edex_type "[+] INSTALACIÓN DE DIXI PANEL COMPLETADA"
edex_type "[+] Lanzando el entorno de control..."
edex_type "========================================================="
echo ""

# Pitido de confirmación final estilo eDEX-UI
play_beep
sleep 1.5

# Ejecutar el panel
node panel.js