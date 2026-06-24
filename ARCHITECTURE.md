# GestEffect — Architecture & Implementation Guide

**Version**: 2.0 (Client-Side Edition) | **Last Updated**: June 2026

---

## Overview

GestEffect is a **client-side AR hand-tracking engine** — all computer vision processing runs in the browser via **MediaPipe WASM** (WebAssembly). The Flask backend is minimal, serving only the HTML/CSS/JS and persisting theme selections.

**Key Design Principle**: Maximum performance by moving ML inference to the client. Zero backend compute load.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  Web Browser (Client-Side Engine)               │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    index.html (Jinja2)                       ││
│  │  - Camera permission overlay                                 ││
│  │  - Canvas element (1280×720) for rendering                   ││
│  │  - Stats panels (FPS, hands, gesture, spread)                ││
│  │  - Theme selector buttons (10 themes)                        ││
│  │  - Record button + status pills                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                           ↓                                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              main.js — Main Engine (ES6 Modules)             ││
│  │                                                              ││
│  │  [1] MediaPipe HandLandmarker (GPU-accelerated WASM)         ││
│  │      ├─ Loads model from CDN                                 ││
│  │      ├─ Runs inference on video frames (~33ms per frame)     ││
│  │      └─ Returns: 21 landmarks × up to 2 hands                ││
│  │                                                              ││
│  │  [2] Gesture Detection Engine                                ││
│  │      ├─ detectGesture(landmarks) → PINCH/FIST/OPEN/HEART    ││
│  │      ├─ calcSpread(landmarks) → 0–100%                       ││
│  │      └─ isFingerHeart(landmarks) → boolean                   ││
│  │                                                              ││
│  │  [3] Effects & Particles                                     ││
│  │      ├─ Fireball: charge, throw, trail                       ││
│  │      ├─ Hearts: spawn, float, burst on expiry                ││
│  │      ├─ Particles: velocity, gravity, fade                   ││
│  │      └─ All physics-based in JS                              ││
│  │                                                              ││
│  │  [4] Audio Engine (Web Audio API)                            ││
│  │      ├─ Background oscillation synced to hand spread         ││
│  │      ├─ Fireball & heart sound effects                       ││
│  │      └─ Master gain control (mute/unmute)                    ││
│  │                                                              ││
│  │  [5] Canvas Rendering (2D Context)                           ││
│  │      ├─ Video feed (mirrored, darkened)                      ││
│  │      ├─ Neon wireframes (hand skeletons)                     ││
│  │      ├─ Multiverse connections (hand-to-hand)                ││
│  │      ├─ Sparkles & glow effects (shader-like)                ││
│  │      └─ Particle trails                                      ││
│  │                                                              ││
│  │  [6] Recording (Canvas.captureStream)                        ││
│  │      ├─ 60-second limit                                      ││
│  │      ├─ MP4 export (via MediaRecorder API)                   ││
│  │      └─ Auto-download with timestamp filename                ││
│  │                                                              ││
│  │  [7] Theme & UI Management                                   ││
│  │      ├─ 10 switchable themes (auto-rotate every 15s)         ││
│  │      ├─ Live theme updates (no reload)                       ││
│  │      └─ Theme persistence via /update_theme API              ││
│  │                                                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │         style.css — Glassmorphism UI & Animations            ││
│  │  - Frosted glass panels (backdrop-filter)                    ││
│  │  - Responsive grid layout (mobile + desktop)                 ││
│  │  - Color cycling animations                                  ││
│  │  - Recording pulse effects                                   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  getUserMedia() ──→ Video stream → Canvas → requestAnimationFrame│
│  (camera capture)    (1280×720)   (inference → render)  (60 FPS)│
│                                                                  │
└───────────────────────────┬──────────────────────────────────────┘
                            │ HTTP/HTTPS Requests
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        │ GET /             │ POST /update_theme│
        │ GET /get_theme    │ POST /kill        │
        │                   │                   │
┌───────▼───────────────────▼───────────────────▼───┐
│         Flask Backend (app.py) — Port 5000        │
│                                                   │
│  Routes:                                          │
│   GET  /                → render 'index.html'     │
│   GET  /get_theme       → JSON {theme, themes}    │
│   POST /update_theme    → persist theme (locked)  │
│   POST /kill            → terminate session       │
│                                                   │
│  Globals:                                         │
│   current_theme: str    (threading.Lock guarded)  │
│   VALID_THEMES: list    (10 immutable themes)     │
│                                                   │
└───────────────────────────────────────────────────┘
```

---

## Data Flow: Gesture Detection → Rendering

```
Frame N captured from camera:
  ↓
[1] MediaPipe.detectForVideo(video, timestamp)
    └─ Returns: [[landmark{x,y}, ...], [landmark{x,y}, ...]]  (up to 2 hands)
  ↓
[2] For each hand:
    ├─ mirroredHands = flip landmarks horizontally (selfie effect)
    ├─ gesture = detectGesture(landmarks)
    ├─ spread = calcSpread(landmarks)
    ├─ isHeart = isFingerHeart(landmarks)
    └─ Store: gestures[], spreads[], heartCharges[]
  ↓
[3] Effects processing:
    ├─ Fireball: detect hand velocity, charge by rubbing, auto-throw
    ├─ Hearts: spawn if gesture held, update floating position
    ├─ Particles: update physics (velocity, gravity, fade)
    └─ Store in: fireballs[], hearts[], particles[]
  ↓
[4] Audio update:
    ├─ audioEngine.updateSound(spread%, handCount)
    └─ Sets oscillator frequency + gain based on hand state
  ↓
[5] Canvas rendering (in order):
    ├─ Darken background: fillRect with 40% opacity black
    ├─ Draw particles: particle.draw() for each
    ├─ Draw hearts: heart.draw() for each (with physics update)
    ├─ Draw fireballs: fireball.draw() with trail
    ├─ Draw hand wireframes: drawNeonLine() for each connection
    ├─ Draw multiverse: fingertip-to-fingertip lines (2 hands)
    ├─ Draw heart charging: drawHeartWireframe() if gesture active
    ├─ Draw charging fireball: radial gradient + spark particles
    └─ Update DOM: gesture text, spread %, FPS counter
  ↓
[6] Persistence:
    ├─ sync currentTheme to /update_theme endpoint (batched)
    └─ Store in backend for session continuity
  ↓
Frame N+1 ready (requestAnimationFrame loop)
```

---

## Component Deep-Dive

### 1. MediaPipe HandLandmarker (WASM)

**Source**: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/`

```javascript
// Initialization
const vision = await FilesetResolver.forVisionTasks(wasmPath);
const handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { 
        modelAssetPath: "hand_landmarker.task",
        delegate: "GPU"  // Requires WebGL context
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5
});

// Inference
const results = handLandmarker.detectForVideo(video, timestamp);
// results.landmarks: [[{x, y, z}, ...], [{x, y, z}, ...]]
// Each hand has 21 landmarks (fingers, palm, wrist)
```

**Performance**:
- CPU: ~30–100ms per frame (1280×720)
- GPU: ~15–30ms per frame (with WebGL acceleration)
- Memory: ~50MB for model + WASM runtime

---

### 2. Gesture Detection

#### `detectGesture(landmarks)`

```javascript
function detectGesture(lm) {
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    
    // Check PINCH: thumb (4) and index (8) close
    if (dist(lm[4], lm[8]) < 0.06) return 'PINCH! 🤏';
    
    // Check FIST: all fingertips close to palm (9)
    const palm = lm[9];
    const maxDist = Math.max(...[4, 8, 12, 16, 20].map(i => dist(palm, lm[i])));
    if (maxDist < 0.12) return 'Fist ✊';
    
    // Default
    return 'Open Hand 🖐';
}
```

**Thresholds** (normalized to frame width):
- PINCH_THRESHOLD = 0.06 (6% of frame width)
- FIST_THRESHOLD = 0.12 (12% of frame width)

#### `calcSpread(landmarks)`

```javascript
function calcSpread(lm) {
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const dists = [4, 8, 12, 16, 20].map(i => dist(lm[9], lm[i]));
    const spread = ((Math.max(...dists) - Math.min(...dists)) / Math.max(Math.max(...dists), 0.001)) * 100;
    return Math.max(0, Math.min(100, spread));
}
```

Returns: 0–100% (0 = fist, 100 = fully spread)

#### `isFingerHeart(landmarks)`

```javascript
function isFingerHeart(lm) {
    // Thumb(4) and Index(8) close together
    if (Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) > 0.08) return false;
    // Both pointing upwards (y < palm y)
    if (lm[8].y > lm[9].y || lm[4].y > lm[9].y) return false;
    // Middle, ring, pinky curled (tips below PIPs)
    if (lm[12].y < lm[10].y && lm[16].y < lm[14].y) return false;
    return true;
}
```

---

### 3. Effects Engine

#### Fireball System

**State Variables**:
- `chargeAmount`: accumulated charge (0–∞)
- `chargeFrames`: frames since charge started
- `throwCooldown`: frames until next throw allowed
- `fullGrownFrames`: frames at max charge (auto-throw at 180 frames ≈ 3 sec)
- `fireballs[]`: active projectiles

**Charging Logic**:
1. Detect two hands close together (distance < 0.4)
2. Calculate hand velocity from frame-to-frame delta
3. Accumulate charge: `chargeAmount += 1.0 + (rubSpeed * 30.0)`
4. Draw charging sphere: `radius = min(500, chargeAmount * 1.5)`
5. If radius ≥ 500, hold for 3 seconds then auto-throw

**Throwing Logic**:
- Single hand velocity: Create small fireball instantly
- Two-hand throw: Calculate velocity from both hands
- Auto-throw: Random direction if fully charged

#### Heart Spawning

**State Variables**:
- `heartCharges[2]`: charge per hand (0–60)
- `hearts[]`: active floating hearts
- `nextHeartSpawn`: frame counter for spawn timing

**Logic**:
1. Detect finger heart gesture (isFingerHeart)
2. Increment heartCharges[i] by 2 per frame (max 60)
3. Draw heart wireframe charging animation
4. At charge = 60, spawn Heart object every 30–180 frames
5. Heart floats upward, bounces off walls, fades out

#### Particle System

**Particle Class**:
```javascript
class Particle {
    constructor(x, y, vx, vy, color, life, size) {
        this.x = x; this.y = y;
        this.vx = vx; this.vy = vy;  // Velocity
        this.color = color;
        this.life = life;  // Max lifetime
        this.size = size;
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= 0.016;  // Decay
        if (this.y > canvas.height) this.vy *= -0.6;  // Bounce
    }
}
```

**Spawning**:
- Heart expiry: 30 particles radiating outward
- Fireball trail: 3 particles per frame
- Custom effects: Configurable via `spawnParticles(x, y, count, colorFunc, speedMult)`

---

### 4. Audio Engine

**Web Audio API Context**:
```javascript
class AudioEngine {
    constructor() {
        this.ctx = new AudioContext();  // Global audio context
        this.master = this.ctx.createGain();  // Volume control
        this.master.gain.value = 0;  // Start muted
        this.master.connect(this.ctx.destination);
    }
    
    updateSound(spreadPercent, handCount) {
        // Frequency = base + spread + multi-hand bonus
        const freq = 50 + (spreadPercent * 1.5) + (handCount === 2 ? 100 : 0);
        this.osc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
        
        // Gain = hand presence + spread amount
        const gain = 0.05 + (spreadPercent / 100) * 0.1;
        this.gain.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.1);
    }
    
    play(type) {  // 'fireball' or 'heart'
        if (type === 'fireball') {
            // Sawtooth sweep: 150 Hz → 40 Hz over 0.5s
            const osc = this.ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.5);
            osc.start(this.ctx.currentTime);
            osc.stop(this.ctx.currentTime + 0.5);
        } else if (type === 'heart') {
            // Sine chirp: 400 Hz + short pop
            // ...
        }
    }
}
```

---

### 5. Canvas Rendering

**Neon Line Drawing**:
```javascript
function drawNeonLine(x1, y1, x2, y2, color, core) {
    ctx.save();
    
    // Outer glow (12px blur)
    ctx.shadowBlur = 12;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    
    // Core glow (4px blur)
    ctx.shadowBlur = 4;
    ctx.shadowColor = core;
    ctx.strokeStyle = core;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    
    // Sparkle effect (random)
    if (Math.random() > 0.65) {
        ctx.save();
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#ffffff';
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.9;
        const t = Math.random();
        ctx.beginPath();
        ctx.arc(x1 + t*(x2-x1), y1 + t*(y2-y1), 1.5, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
    }
    
    ctx.restore();
}
```

**Hand Wireframe Drawing**:
```javascript
function drawHand(landmarks, handIdx) {
    const W = canvas.width, H = canvas.height;
    const color = getNeonColor(frameCount, handIdx);
    const core = THEMES[currentTheme].core;
    
    // Draw 21 connections
    for (const [a, b] of CONNECTIONS) {
        drawNeonLine(
            landmarks[a].x * W,
            landmarks[a].y * H,
            landmarks[b].x * W,
            landmarks[b].y * H,
            color,
            core
        );
    }
}
```

---

### 6. Recording System

**Canvas Capture → MediaRecorder → MP4 Export**:

```javascript
const stream = canvas.captureStream(30);  // 30 FPS capture
const mediaRecorder = new MediaRecorder(stream, {
    mimeType: 'video/mp4'  // or fallback to webm
});

mediaRecorder.ondataavailable = (event) => {
    recordedChunks.push(event.data);
};

mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, {type: mediaRecorder.mimeType});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gesteffect_${getFormattedDateTime()}.mp4`;
    a.click();
};

mediaRecorder.start();
// ... 60 seconds later ...
mediaRecorder.stop();
```

**UI Flow**:
1. Click "Record" button
2. Show 5-second countdown (orange dot)
3. Start recording (red pulsing dot)
4. 60-second timer display
5. Auto-stop and download MP4

---

### 7. Flask Backend (`app.py`)

**Minimal routes**:

```python
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/get_theme', methods=['GET'])
def get_theme():
    with theme_lock:
        theme = current_theme
    return jsonify({'theme': theme, 'available_themes': VALID_THEMES})

@app.route('/update_theme', methods=['POST'])
def update_theme():
    global current_theme
    data = request.get_json()
    theme = data.get('theme', 'Cyberpunk')
    if theme in VALID_THEMES:
        with theme_lock:
            current_theme = theme
        return jsonify({'status': 'success', 'theme': current_theme})
    return jsonify({'status': 'error'}), 400

@app.route('/kill', methods=['POST'])
def kill_server():
    print("Client session terminated.")
    return jsonify({'status': 'success'})
```

**SSL Setup**:
```python
app.run(host='0.0.0.0', port=5000, ssl_context='adhoc')
```

Requires `pyopenssl` for adhoc certificate generation.

---

## Theme Definitions

**10 Available Themes** (from `main.js`):

| Name | Primary Colours | Core | Use Case |
|------|---|---|---|
| Rainbow | #ff0000, #00ff00, #0000ff | #ffffff | Colorful, cycling |
| Cyberpunk | #ff14a3, #00ffff | #ffffff | Neon pink + cyan (default) |
| Lava | #ff2200, #ff8800, #ffff00 | #ffffff | Fiery, warm |
| Ocean | #00e5ff, #0088ff | #ffffff | Cool, watery |
| Galaxy | #cc00ff, #ff00ff, #ffffff | #ffffff | Cosmic, purple |
| Matrix | #00ff00, #00bb00 | #ccffcc | Terminal, green |
| Frostbite | #ffffff, #aaddff, #4499ff | #ffffff | Icy, cold |
| GoldenHour | #ff9900, #ffdd00, #ff6688 | #fff0cc | Warm, sunset |
| Synthwave | #ff00ff, #00ffff, #ff0077 | #ffccff | Retro, 80s |
| NeonDemon | #ff0000, #cc0000, #ff4444 | #ff9999 | Dark, red |

All colours cycle based on `(frameCount * 0.05 + handIdx * 3) % colors.length`.

---

## Performance Considerations

| Metric | Value | Notes |
|--------|-------|-------|
| Video Resolution | 1280×720 | Adjustable in getUserMedia config |
| FPS Target | 30 | requestAnimationFrame loop frequency |
| FPS Achieved | 25–30 CPU, 30–60 GPU | GPU = WebGL acceleration via MediaPipe |
| Canvas Draw Time | 2–5ms | 2D context relatively fast |
| MediaPipe Inference | 15–100ms | Depends on GPU support; WASM on CPU is slower |
| Memory Usage | 150–250MB | Browser process (WASM + runtime) |
| Startup Time | 3–5s | Model download + WASM compilation |

**Optimizations**:
- Draw particles/effects only when active (garbage collection)
- Use `globalAlpha` instead of per-pixel transparency
- Shadow blur (expensive) kept minimal (4–12px)
- Theme calculations cached, not recomputed per line
- Gesture thresholds normalized to frame width (resolution-independent)

---

## Future Enhancements

1. **Custom Gesture API**: User-defined ML models via TensorFlow.js
2. **Multiplayer**: WebRTC peer-to-peer hand tracking collaboration
3. **Save Presets**: User-created theme editor & persistent storage
4. **Hand Pose Classification**: Advanced ML for ASL/BSL recognition
5. **Mobile Optimization**: Reduce resolution on low-end devices
6. **Server-Side Analysis**: Optional backend for gesture archival/analytics
7. **Accessibility**: Keyboard controls for camera/recording (no hands needed)

---

## Known Limitations

1. **iOS Camera**: Limited MediaPipe WASM support; no GPU acceleration
2. **HTTPS Required**: Camera access demands secure context
3. **Single Tab**: MediaRecorder may conflict if multiple tabs active
4. **Firefox WASM**: Slower than Chromium; GPU support varies
5. **Gesture Accuracy**: Thresholds tuned empirically; may vary by lighting/hand size
6. **Recording Codec**: Browser-dependent; MP4 may fallback to WebM

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

For architecture questions, open an issue or contact the maintainers.
