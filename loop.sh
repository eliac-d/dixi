#!/data/data/com.termux/files/usr/bin/bash

# Bucle infinito para mantener la tarea activa
while true
do
    # Enviar la notificación a la interfaz gráfica de Android utilizando Termux:API
    termux-notification --title "Servicio Activo" --content "Ejecutando tarea automática cada 5 segundos."
    
    # Pausar la ejecución del hilo actual durante 5 segundos
    sleep 5
done
