
#!/bin/bash

vibrate_device() {
    if command -v termux-vibrate >/dev/null 2>&1; then
        (termux-vibrate -d 40 >/dev/null 2>&1 && sleep 0.05 && termux-vibrate -d 40 >/dev/null 2>&1) &
    fi
}

print_line() {
    echo -e "$1"
    vibrate_device
}

clear

print_line "\e[1;36m========================================================================\e[0m"
print_line "\e[1;31m  _  _  _  _   _   _   ___   _  _     _  _  _   _   ___  ___  _   _  ___  \e[0m"
print_line "\e[1;33m | |/ \| || \ | | /_\ |_ _| /_\| |   | || \ | |/_\ |_ _||_ _|| \ | |/ _ \ \e[0m"
print_line "\e[1;32m |   |   ||  \| |/ _ \ | | / _ \ |__ | ||  \| / _ \ | |  | | |  \| | |_| |\e[0m"
print_line "\e[1;34m \__/\__/ |_|\__/_/ \_\|_|/_/ \_\___||_||_|\__/_/ \_\|_| |___|_|\__|\___/ \e[0m"
print_line "\e[1;35m                                                                        \e[0m"
print_line "\e[1;36m            Δ   Ι   Ξ   Ι      Ι   Ν   Φ   Ο      Τ   Ε   Ρ   Μ             \e[0m"
print_line "\e[1;36m========================================================================\e[0m"
sleep 1

print_line "\e[1;33m[+] Εκκίνηση εγκατάστασης του DIXI INFO TERMINAL...\e[0m"
sleep 0.5

DIR_ACTUAL=$(pwd)
ARCHIVO_JS="$DIR_ACTUAL/panel.js"

if [ -f "$ARCHIVO_JS" ]; then
    print_line "\e[1;32m[✓] Το κύριο αρχείο panel.js εντοπίστηκε.\e[0m"
    chmod +x "$ARCHIVO_JS"
else
    print_line "\e[1;31m[✗] Σφάλμα: Το panel.js δεν βρέθηκε στο: $DIR_ACTUAL\e[0m"
    exit 1
fi

print_line "\e[1;33m[+] Έλεγχος και εγκατάσταση του tmux...\e[0m"
if ! command -v tmux &> /dev/null; then
    if [ -n "$TERMUX_VERSION" ] || [ -d "/data/data/com.termux" ]; then
        pkg install tmux -y
    else
        sudo apt-get update && sudo apt-get install tmux -y
    fi
fi

print_line "\e[1;33m[+] Προσδιορισμός περιβάλλοντος συστήματος...\e[0m"
if [ -n "$TERMUX_VERSION" ] || [ -d "/data/data/com.termux" ]; then
    RUTA_BIN="$PREFIX/bin/dixi"
else
    RUTA_BIN="/usr/local/bin/dixi"
fi

print_line "\e[1;33m[+] Εγγραφή του φορτωτή συνεδρίας Tmux...\e[0m"

cat << EOF > "$RUTA_BIN"
#!/bin/bash
SESSION="dixi"
DIR_PANEL="$DIR_ACTUAL"

if ! command -v tmux &> /dev/null; then
    exit 1
fi

if tmux has-session -t \$SESSION 2>/dev/null; then
    tmux attach -t \$SESSION
    exit 0
fi

tmux new-session -d -s \$SESSION -n panel
tmux send-keys -t \$SESSION "node \$DIR_PANEL/panel.js" C-m
tmux split-window -v -t \$SESSION -l 70%
tmux send-keys -t \$SESSION "clear" C-m
tmux select-pane -t \$SESSION:0.1
tmux attach -t \$SESSION
EOF

chmod +x "$RUTA_BIN"

print_line "\e[1;36m========================================================================\e[0m"
print_line "\e[1;32m Η ΕΓΚΑΤΑΣΤΑΣΗ ΟΛΟΚΛΗΡΩΘΗΚΕ ΜΕ ΕΠΙΤΥΧΙΑ! \e[0m"
print_line "\e[1;37m Τώρα μπορείτε να εκτελέσετε το panel από οπουδήποτε πληκτρολογώντας: \e[0m"
print_line "\e[1;33m dixi \e[0m"
print_line "\e[1;36m========================================================================\e[0m"

