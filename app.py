"""
GestEffect - Real-time AR Hand Tracking Web Application
Minimal Flask backend: serves static files and persists theme selection.
All MediaPipe inference and rendering is handled client-side via MediaPipe.js (WASM).
"""

import os
import logging
from flask import Flask, render_template, jsonify, request
from threading import Lock
import signal
import sys

# Suppress Werkzeug request logs
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

app = Flask(__name__, template_folder='templates', static_folder='static')

# --- Theme State ---
VALID_THEMES = [
    "Rainbow", "Cyberpunk", "Lava", "Ocean", "Galaxy",
    "Matrix", "Frostbite", "GoldenHour", "Synthwave", "NeonDemon"
]
current_theme = "Cyberpunk"
theme_lock = Lock()


@app.route('/')
def index():
    """Serve the main application page."""
    return render_template('index.html')


@app.route('/get_theme', methods=['GET'])
def get_theme():
    """Return the current theme."""
    with theme_lock:
        theme = current_theme
    return jsonify({'theme': theme, 'available_themes': VALID_THEMES})


@app.route('/update_theme', methods=['POST'])
def update_theme():
    """Persist a theme selection from the client."""
    global current_theme
    data = request.get_json()
    theme = data.get('theme', 'Cyberpunk')

    if theme in VALID_THEMES:
        with theme_lock:
            current_theme = theme
        return jsonify({'status': 'success', 'theme': current_theme})

    return jsonify({'status': 'error', 'message': 'Invalid theme'}), 400


@app.route('/kill', methods=['POST'])
def kill_server():
    """Disconnect client and kill UI without shutting down the backend server."""
    print("Received kill request from client. Disconnecting client session...")
    return jsonify({'status': 'success', 'message': 'Client session terminated. Server remains running.'})


def sigint_handler(sig, frame):
    print("\nGracefully terminating GestEffect Server...")
    sys.exit(0)


BANNER = r"""
  ____           _   _____  __  __          _   
 / ___| ___  ___| |_| ____|/ _|/ _| ___  ___| |_ 
| |  _ / _ \/ __| __|  _| | |_| |_ / _ \/ __| __|
| |_| |  __/\__ \ |_| |___|  _|  _|  __/ (__| |_ 
 \____|\___||___/\__|_____|_| |_|  \___|\___|\__|
"""

if __name__ == '__main__':
    # Register Ctrl+C handler
    signal.signal(signal.SIGINT, sigint_handler)
    
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        local_ip = "127.0.0.1"

    print(BANNER)
    print("GestEffect AR — Client-Side MediaPipe Engine")
    print("============================================")
    print(f"UI Address: https://{local_ip}:5000")
    print(f"Local URL : https://127.0.0.1:5000")
    print("============================================\n")
    
    try:
        app.run(debug=False, threaded=True, host='0.0.0.0', port=5000, ssl_context='adhoc')
    except KeyboardInterrupt:
        pass
