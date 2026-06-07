#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'
BOLD='\033[1m'

echo ""
echo -e "${CYAN}${BOLD}"
echo "  ██╗   ██╗██████╗  █████╗ ███╗   ██╗███████╗██╗"
echo "  ██║   ██║██╔══██╗██╔══██╗████╗  ██║██╔════╝██║"
echo "  ██║   ██║██████╔╝███████║██╔██╗ ██║█████╗  ██║"
echo "  ╚██╗ ██╔╝██╔═══╝ ██╔══██║██║╚██╗██║██╔══╝  ██║"
echo "   ╚████╔╝ ██║     ██║  ██║██║ ╚████║███████╗███████╗"
echo "    ╚═══╝  ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝"
echo -e "${NC}"
echo -e "${GREEN}Panel de control VPS — Instalador v1.0${NC}"
echo -e "${YELLOW}─────────────────────────────────────────${NC}"
echo ""

INSTALL_DIR="/opt/vpanel"
PORT=${VPANEL_PORT:-8080}

echo -e "${CYAN}[1/5] Verificando dependencias...${NC}"
if ! command -v node &>/dev/null; then
  echo -e "${YELLOW}Node.js no encontrado. Instalando...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
else
  echo -e "${GREEN}✓ Node.js $(node -v)${NC}"
fi

if ! command -v git &>/dev/null; then
  echo -e "${YELLOW}Git no encontrado. Instalando...${NC}"
  apt-get install -y git
else
  echo -e "${GREEN}✓ Git $(git --version | cut -d' ' -f3)${NC}"
fi

echo ""
echo -e "${CYAN}[2/5] Creando directorio de instalación...${NC}"
mkdir -p "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/servers"
mkdir -p "$INSTALL_DIR/tmp"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp -r "$SCRIPT_DIR"/* "$INSTALL_DIR/"
echo -e "${GREEN}✓ Archivos copiados a $INSTALL_DIR${NC}"

echo ""
echo -e "${CYAN}[3/5] Instalando dependencias npm...${NC}"
cd "$INSTALL_DIR"
npm install --production
echo -e "${GREEN}✓ Dependencias instaladas${NC}"

echo ""
echo -e "${CYAN}[4/5] Configurando servicio systemd...${NC}"
cat > /etc/systemd/system/vpanel.service << EOF
[Unit]
Description=VPanel - Panel de control VPS
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node $INSTALL_DIR/server.js
Restart=always
RestartSec=5
Environment=PORT=$PORT
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable vpanel
systemctl start vpanel
echo -e "${GREEN}✓ Servicio vpanel iniciado${NC}"

echo ""
echo -e "${CYAN}[5/5] Configurando firewall (si ufw está activo)...${NC}"
if command -v ufw &>/dev/null && ufw status | grep -q "active"; then
  ufw allow $PORT/tcp
  echo -e "${GREEN}✓ Puerto $PORT habilitado en ufw${NC}"
else
  echo -e "${YELLOW}UFW no activo — asegúrate de abrir el puerto $PORT manualmente${NC}"
fi

IP=$(curl -s ifconfig.me 2>/dev/null || echo "tu-ip")
echo ""
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  ✓ VPanel instalado exitosamente!${NC}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════${NC}"
echo ""
echo -e "  Panel disponible en: ${CYAN}${BOLD}http://${IP}:${PORT}${NC}"
echo ""
echo -e "  ${YELLOW}La primera vez que accedas se te pedirá"
echo -e "  crear tu clave maestra de acceso.${NC}"
echo ""
echo -e "  Comandos útiles:"
echo -e "  ${CYAN}systemctl status vpanel${NC}  — estado del servicio"
echo -e "  ${CYAN}systemctl restart vpanel${NC} — reiniciar panel"
echo -e "  ${CYAN}journalctl -u vpanel -f${NC}  — ver logs en vivo"
echo ""
