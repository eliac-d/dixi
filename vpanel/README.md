# VPanel — Panel de control VPS

Panel de control estilo Pterodactyl para gestionar servidores y archivos en tu VPS.

## Instalación rápida

```bash
git clone <este-repo> vpanel
cd vpanel
chmod +x install.sh
sudo bash install.sh
```

Abre tu navegador en `http://tu-ip:8080` y crea tu clave maestra.

## Instalación manual

```bash
npm install
node server.js
```

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| PORT | 8080 | Puerto del panel |

## Funciones

- **Dashboard** — CPU, RAM, disco y uptime en tiempo real
- **Servidores** — Clona repos de Git (públicos o privados con token), instala dependencias, inicia/detiene procesos con consola en vivo via WebSockets
- **Explorador de archivos** — Navega, crea, renombra, elimina archivos y edita con editor integrado
- **Terminal** — Shell remota vía WebSockets con historial de comandos

## Seguridad

- Clave de acceso hasheada con bcrypt
- Sesiones con express-session
- Sin clave no hay acceso a ningún endpoint
