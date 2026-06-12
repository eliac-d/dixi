#!/bin/bash

SESSION="dixi"
DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v tmux &> /dev/null; then
    echo "Instalando tmux..."
    pkg install tmux -y
fi

if tmux has-session -t $SESSION 2>/dev/null; then
    tmux attach -t $SESSION
    exit 0
fi

tmux new-session -d -s $SESSION -n panel

tmux send-keys -t $SESSION "node $DIR/panel.js" C-m

tmux split-window -v -t $SESSION -l 70%

tmux send-keys -t $SESSION "clear" C-m

tmux select-pane -t $SESSION:0.1

tmux attach -t $SESSION
