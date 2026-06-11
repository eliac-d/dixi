#!/bin/bash

# Limpiar pantalla
clear

echo "========================================="
echo "   Iniciando instalación de Dixi Panel   "
echo "========================================="
echo ""

# 1. Actualizar repositorios y paquetes del sistema
echo "[1/4] Actualizando sistema y paquetes..."
apt update -y && apt upgrade -y

# 2. Instalar Node.js si no está instalado (necesario para ejecutar el panel)
echo "[2/4] Verificando instalación de Node.js..."
if ! command -v node &> /dev/null
then
    echo "Node.js no encontrado. Instalando Node.js..."
    pkg install nodejs -y
else
    echo "Node.js ya está instalado."
fi

# 3. Instalar dependencias del proyecto (blessed)
echo "[3/4] Instalando dependencias del panel (npm install)..."
npm install

# 4. Asignar permisos y arrancar
echo "[4/4] Configuración finalizada."
echo "========================================="
echo "   Iniciando el Panel en 3 segundos...   "
echo "========================================="
sleep 3

# Ejecutar el panel
node panel.js