# GestEffect — Design Architecture & Code Audit

## Project Overview

GestEffect is a real-time AR hand-tracking web application that combines computer vision, gesture recognition, and neon visual effects into a browser-accessible stream. A single Python process handles webcam capture, MediaPipe hand detection, gesture classification, neon rendering, and MJPEG streaming simultaneously.

**Version**: 1.0 | **Stack**: Python 3.8+, Flask 3.0, MediaPipe 0.10, OpenCV 4.8

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Web Browser (Frontend)                        │
│                                                                  │
│  <img src="/video_feed">  ← MJPEG stream (multipart)            │
│                                                                  │
│  ┌─────────────────┐  ┌──────────────────┐                      │
│  │  Stats Panel 1  │  │  Stats Panel 2   │                      │
│  │  Hands | FPS    │  │  Gesture | Spread│  (polled 100ms)      │
│  └─────────────────┘  └──────────────────┘                      │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Theme Selector: 🌈 Rainbow | 🌃 Cyberpunk | 🔥 Lava      │ │
│  │                   🌊 Ocean  | 🌌 Galaxy                    │ │
│  └────────────────────────────────────────────────────────────┘ │
└────────────────────┬──────────────────────────────┬─────────────┘
                     │ GET /video_feed (MJPEG)       │ GET/POST API
                     │ GET /get_stats (JSON, 100ms)  │ /update_theme
                     │                               │ /get_theme
┌────────────────────▼───────────────────────────────▼─────────────┐
│                    Flask Backend — Port 5000                       │
│                                                                    │
│  Routes:                                                           │
│   GET  /                  → render_template('index.html')          │
│   GET  /video_feed        → Response(generate_frames(), MJPEG)     │
│   POST /update_theme      → update global current_theme (locked)   │
│   GET  /get_theme         → {theme, available_themes}              │
│   GET  /get_stats         → {fps, hand_count, gestures, spreads}   │
│                                                                    │
│  Globals:                                                          │
│   current_theme: str      (guarded by threading.Lock)             │
│   processor: FrameProcessor  (singleton, shared across requests)  │
└────────────────────┬──────────────────────────────────────────────┘
                     │ cv2.VideoCapture(0)
                     │ 1280×720 @ 30 FPS
┌────────────────────▼──────────────────────────────────────────────┐
│                Frame Processing Pipeline (per frame)               │
│                                                                    │
│  [1] cap.read() → raw BGR frame (1280×720)                        │
│       ↓                                                            │
│  [2] cv2.flip(frame, 1) → mirror for selfie view                  │
│       ↓                                                            │
│  [3] addWeighted(frame 0.6, black 0.4) → darkened background      │
│       ↓                                                            │
│  [4] cv2.cvtColor(BGR → RGB) → hands.process() → MediaPipe        │
│       ↓                                                            │
│  [5] For each detected hand (up to 2):                             │
│       - detect_gesture() → "PINCH!" / "Fist" / "Open Hand"        │
│       - calculate_hand_spread() → 0–100%                           │
│       - draw_hand_landmarks() → neon wireframe + glow dots         │
│       ↓ (if 2 hands detected)                                      │
│  [6] draw_multiverse_connections() → neon lines between fingertips │
│       ↓                                                            │
│  [7] draw_overlay() → FPS, hand count, gesture, spread text        │
│       ↓                                                            │
│  [8] cv2.imencode('.jpg') → JPEG bytes                             │
│       ↓                                                            │
│  [9] yield multipart frame → browser MJPEG stream                  │
└────────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. `app.py` — Flask Backend & Frame Processor

#### Module-level Globals

```python
current_theme = "Cyberpunk"      # Active theme name (string)
theme_lock    = threading.Lock() # Protects current_theme from race conditions
processor     = FrameProcessor() # Singleton; holds FPS, gesture, spread state
```

> **Note**: `current_theme` is accessed from both the Flask request thread
> (`/update_theme`, `/get_stats`) and the frame generator thread. The `theme_lock`
> prevents torn reads/writes. However, `draw_neon_line()` at line 149 accesses
> `current_theme` *without* the lock — this is a thread-safety gap.

---

#### `THEME_COLORS` Dictionary

All colours stored in **BGR format** (OpenCV convention — reversed from RGB):

```python
THEME_COLORS = {
    "Rainbow":  { "primary": [(255,0,0), (0,255,0), (0,0,255)], ... },
    "Cyberpunk":{ "primary": [(147,20,255), (255,255,0)],       ... },
    "Lava":     { "primary": [(0,0,255), (0,165,255), (0,255,255)], ... },
    "Ocean":    { "primary": [(200,255,0), (255,200,0)],        ... },
    "Galaxy":   { "primary": [(255,0,150), (255,0,255), (255,255,255)], ... }
}
```

Each theme has three keys:
- `primary` — list of colours cycled across frame count for the neon wireframes
- `secondary` — used in inter-hand multiverse connection tint (referenced but not fully used)
- `glow_core` — always `(255,255,255)` — the bright white core of each neon line

---

#### `FrameProcessor` Class

**State fields:**

| Field | Type | Purpose |
|-------|------|---------|
| `frame_count` | `int` | Counts frames for FPS and color cycling |
| `fps_start_time` | `float` | Timestamp of last FPS reset |
| `fps` | `float` | Current frames per second |
| `hand_count` | `int` | Number of hands detected in last frame |
| `gestures` | `list[str, str]` | Gesture label per hand (max 2) |
| `spreads` | `list[float, float]` | Spread percentage per hand (0–100) |

---

**`calculate_distance(point1, point2)`**
- Returns Euclidean pixel distance between two `(x, y)` tuples
- Formula: `sqrt((x2-x1)² + (y2-y1)²)`
- Used for both gesture thresholds and spread calculation

---

**`calculate_hand_spread(landmarks, frame_width, frame_height)`**
- Converts normalised MediaPipe landmarks → pixel coordinates
- Measures distances from palm centre (landmark 9) to each of the 5 fingertips [4, 8, 12, 16, 20]
- Formula: `((max_distance - min_distance) / max_distance) * 100`
- Returns: `float` in range [0, 100]

---

**`detect_gesture(landmarks, frame_width, frame_height)`**

Priority order (first match wins):

| Check | Condition | Returns |
|-------|-----------|---------|
| Pinch | `distance(thumb_tip[4], index_tip[8]) < PINCH_THRESHOLD (50px)` | `"PINCH!"` |
| Fist | `max(distance(palm[9], fingertip[i]) for i in [4,8,12,16,20]) < FIST_THRESHOLD (80px)` | `"Fist"` |
| Default | — | `"Open Hand"` |

---

**`get_neon_color(frame_index)`**
- Reads `current_theme` under `theme_lock`
- **Rainbow**: `colors[(frame_index // 5) % len(colors)]` — slow cycle (changes every 5 frames)
- **All others**: `colors[frame_index % len(colors)]` — fast cycle (changes every frame)

---

**`draw_neon_line(frame, pt1, pt2, color, thickness=3)`**

Three-pass neon line rendering:
1. **Outer glow**: `color * 0.3` at `thickness + 4` — dark wide bloom
2. **Main line**: `color` at `thickness` — solid coloured line
3. **Bright core**: `(255,255,255)` at 1px — white centre highlight

> **Known Issue** (line 149): `THEME_COLORS[current_theme]["glow_core"]` accesses
> `current_theme` directly without `theme_lock`. If a theme switch races with frame
> rendering, this could cause a `KeyError`. Fix: read theme under lock at the start
> of `draw_hand_landmarks()` and pass it through.

---

**`draw_hand_landmarks(frame, hand_landmarks, handedness, hand_index)`**

Workflow:
1. Calls `detect_gesture()` and `calculate_hand_spread()` — stores in `self.gestures[hand_index]` and `self.spreads[hand_index]`
2. Converts all 21 landmarks to pixel `(x, y)` tuples
3. Gets theme colour via `get_neon_color(frame_count + hand_index * 10)` — offsets second hand by 10 frames for colour variety
4. Iterates `mp_hands.HAND_CONNECTIONS` — draws each bone segment with `draw_neon_line()`
5. Draws a 3px filled circle at each landmark point + a 5px dim glow ring

---

**`draw_multiverse_connections(frame, results)`**

Draws neon lines between matching fingertips of two detected hands:
- Fingertip indices: `[4, 8, 12, 16, 20]` (Thumb, Index, Middle, Ring, Pinky)
- Line colour: `THEME_COLORS[current_theme]["primary"][0]` (first primary colour)
- Only called when `hand_count == 2`

---

**`update_fps()`**

- Increments `frame_count`
- Every time elapsed since last reset ≥ 1 second: `fps = frame_count / elapsed`, then resets counter

> **Known Issue** (lines 226–228): When FPS is computed, `self.frame_count` is reset
> to 0 but `self.frame_count` was also being incremented in the same call to
> `update_fps()`. The `frame_count` that's reset is the batch count, not the total —
> this is correct behaviour, but the variable name is reused for two roles in the
> same method, making it confusing.

---

**`process_frame(frame)`**

Main pipeline entry point:
1. Calls `update_fps()`
2. **Redundant variable assignment** (lines 234–235): `h, frame_width = frame.shape[:2]` immediately overwritten by `h, frame_height = frame.shape[:2]` — `frame_width` is the frame height value from the first unpack. Should be `frame_height, frame_width = frame.shape[:2]`.
3. Flips frame: `cv2.flip(frame, 1)` (horizontal mirror)
4. Darkens: `addWeighted(frame, 0.6, black_overlay, 0.4, 0)`
5. Converts BGR→RGB, passes to `hands.process()`
6. Resets `hand_count`, `gestures`, `spreads` to defaults
7. Draws landmarks + multiverse connections if applicable
8. Draws text overlay
9. Returns processed frame

> **Known Bug** (lines 234–235): Shape unpack is wrong:
> ```python
> h, frame_width  = frame.shape[:2]   # frame_width gets height value
> h, frame_height = frame.shape[:2]   # frame_height gets width value
> ```
> Correct form: `frame_height, frame_width = frame.shape[:2]`
> Impact: `frame_width` and `frame_height` are swapped in `process_frame()`.
> However, the background overlay rectangle uses `(frame_width, frame_height)`
> which is still drawn correctly as long as the overlay covers the whole frame.
> The MediaPipe and landmark drawing use `frame.shape[:2]` directly (correct).

---

**`draw_overlay(frame)`**

Draws cyan `cv2.FONT_HERSHEY_SIMPLEX` text directly on the frame:
- Line 1 (`y=30`): `FPS: <int(fps)>`
- Line 2 (`y=60`): `Hands: <hand_count>`
- Lines 3+ (`y=90+i*30`): `Hand <n>: <gesture>` and `Spread: <n.1>%` for each hand

---

#### `generate_frames()` Generator

```python
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
cap.set(cv2.CAP_PROP_FPS,          30)
```

Yields a multipart MJPEG frame on each iteration:
```
b'--frame\r\n'
b'Content-Type: image/jpeg\r\n'
b'Content-Length: <N>\r\n\r\n'
<JPEG bytes>
b'\r\n'
```

`cap.release()` is called in the `finally` block, ensuring the webcam is always freed even on error.

---

#### Flask Routes

| Route | Function | Detail |
|-------|----------|--------|
| `GET /` | `index()` | `render_template('index.html')` |
| `GET /video_feed` | `video_feed()` | `Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')` |
| `POST /update_theme` | `update_theme()` | Reads JSON `{theme}`, validates against `THEME_COLORS`, updates under `theme_lock` |
| `GET /get_theme` | `get_theme()` | Returns `{theme, available_themes}` |
| `GET /get_stats` | `get_stats()` | Returns `{fps, hand_count, gestures, spreads}` from `processor` |

---

### 2. `templates/index.html` — Frontend UI

**Structure**: Full-screen `<img>` tag streaming `/video_feed` with three absolutely-positioned overlay layers.

**DOM Elements:**

| ID | Type | Purpose |
|----|------|---------|
| `videoFeed` | `<img>` | MJPEG stream source |
| `handCount` | `<span>` | Live hand count |
| `fps` | `<span>` | Live FPS counter |
| `gesture` | `<span>` | Gesture label (colour-coded) |
| `spread` | `<span>` | Spread percentage |
| `.theme-btn[data-theme]` | `<button>` ×5 | Theme switchers |

**JavaScript Functions:**

| Function | Trigger | Action |
|----------|---------|--------|
| `initializeTheme()` | DOMContentLoaded | `GET /get_theme` → activates matching button |
| Theme button click | User click | `POST /update_theme {theme}` → updates `.active` class |
| `updateActiveThemeButton(theme)` | After POST | Toggles `.active` class on correct button |
| `updateStats()` | `setInterval(100ms)` | `GET /get_stats` → updates DOM + gesture colour class |

**Gesture Colour Classes** (applied to `#gesture` span):

| Class | Colour | Trigger |
|-------|--------|---------|
| `gesture-pinch` | `#ff1493` (pink) | `data.gestures[0] === "PINCH!"` |
| `gesture-fist` | `#ffa500` (orange) | `data.gestures[0] === "Fist"` |
| `gesture-open` | `#00ffff` (cyan) | `data.gestures[0] === "Open Hand"` |

> **Note**: The stats UI only displays Hand 1's gesture and spread (index 0). Hand 2's
> gesture is tracked in the backend (`processor.gestures[1]`) and included in `/get_stats`
> JSON, but the frontend doesn't render it.

---

### 3. `static/style.css` — Glassmorphism Styling

**Design System:**

| Element | Technique |
|---------|-----------|
| Stats panels | `rgba(255,255,255,0.1)` background + `backdrop-filter: blur(10px)` |
| Theme bar | Same glassmorphism, `border-radius: 50px` pill shape |
| Active theme | `rgba(255,255,255,0.25)` + `box-shadow: 0 0 20px rgba(0,255,255,0.3)` |
| Stat values | Cyan (`#00ffff`) with `text-shadow` glow animation |
| Glow animation | CSS `@keyframes glow` — oscillates text-shadow opacity over 2s |

**Responsive Breakpoints:**

| Breakpoint | Changes |
|-----------|---------|
| `max-width: 768px` | Reduced panel padding/font; panel 2 moves up |
| `max-width: 480px` | Further reduction; theme button labels hidden (icon only) |

---

## MediaPipe Hand Landmark Reference

```
                    8 (Index Tip)
                    |
              7     |
              |  6  |    12 (Middle Tip)
              |  |  |    |
         4    5  |  9 (Palm Center)   16 (Ring Tip)   20 (Pinky Tip)
(Thumb Tip)|  |  |  |                 |               |
           3  |  |  10               15              19
           |  |  |  |                |               |
           2  |  |  11              14              18
           |  |  |                  |               |
           1  |  |                 13              17
           |  |  |
           0 (Wrist)
```

**Key landmark indices:**
- `0` — Wrist
- `4` — Thumb tip
- `8` — Index finger tip
- `9` — Palm centre (used for spread + fist detection)
- `12` — Middle finger tip
- `16` — Ring finger tip
- `20` — Pinky tip
- **Fingertips**: `[4, 8, 12, 16, 20]`

---

## Gesture Recognition Algorithms

### PINCH Detection
```python
distance(landmarks[4], landmarks[8]) < 50  # pixels
```
Checks thumb tip to index tip Euclidean distance. Threshold of 50px works for 1280×720.

### FIST Detection
```python
max(distance(landmarks[9], landmarks[i]) for i in [4,8,12,16,20]) < 80  # pixels
```
All fingertips must be within 80px of palm centre. Evaluated after PINCH.

### Hand Spread Formula
```
spread = ((max_dist - min_dist) / max_dist) * 100
```
Where distances are from landmark 9 (palm) to each of the 5 fingertips.
- Spread ≈ 0% → fist (all similar distance)
- Spread ≈ 100% → fingers fully splayed

---

## Data Flow Diagrams

### Video Stream Flow
```
Webcam (30 FPS)
    → cv2.VideoCapture(0)
    → cv2.flip() [mirror]
    → addWeighted() [darken]
    → cv2.cvtColor(BGR→RGB)
    → mediapipe.Hands.process()
    → detect_gesture() × hands
    → calculate_hand_spread() × hands
    → draw_hand_landmarks() × hands
    → draw_multiverse_connections() [if 2 hands]
    → draw_overlay() [FPS/stats text]
    → cv2.imencode('.jpg')
    → yield multipart chunk
    → Flask Response → Browser <img>
```

### Theme Update Flow
```
User clicks theme button
    → JavaScript fetch POST /update_theme {theme: "Lava"}
    → Flask update_theme()
    → theme_lock.acquire()
    → current_theme = "Lava"
    → theme_lock.release()
    → return {status: "success", theme: "Lava"}
    → JS: updateActiveThemeButton("Lava")
    → Next frame: get_neon_color() reads new theme
```

### Stats Polling Flow
```
setInterval(100ms)
    → fetch GET /get_stats
    → Flask get_stats()
    → {fps, hand_count, gestures, spreads} from processor instance
    → JS: update #fps, #handCount, #gesture, #spread DOM
    → apply CSS class for gesture colour
```

---

## Known Issues & Audit Findings

### Bug 1 — `process_frame()` lines 234–235: Shape dimensions swapped

```python
# CURRENT (incorrect):
h, frame_width  = frame.shape[:2]   # frame_width actually gets height
h, frame_height = frame.shape[:2]   # frame_height actually gets width

# CORRECT:
frame_height, frame_width = frame.shape[:2]
```

**Impact**: `frame_width` and `frame_height` are assigned swapped values in `process_frame()`.
The black overlay rectangle `(0,0) → (frame_width, frame_height)` still covers the whole frame
(since both values come from the same shape), but any code relying on correct width/height
distinction in this scope would behave incorrectly.

---

### Issue 2 — `draw_neon_line()` line 149: `current_theme` read without lock

```python
# CURRENT (no lock):
core_color = THEME_COLORS[current_theme]["glow_core"]

# SAFE form:
with theme_lock:
    theme = current_theme
core_color = THEME_COLORS[theme]["glow_core"]
```

**Impact**: In CPython, string assignment is effectively atomic due to the GIL, making a
`KeyError` extremely unlikely in practice. However, the pattern is inconsistent with the
rest of the code which always locks `current_theme` access.

---

### Design Note — Frontend only shows Hand 1 stats

The `/get_stats` endpoint returns `gestures[0..1]` and `spreads[0..1]` for both hands,
but `index.html` only reads `data.gestures[0]` and `data.spreads[0]`. Hand 2 stats are
computed and available via the API but not displayed.

---

## Performance Specifications

| Stage | Time |
|-------|------|
| Camera capture | 2–3ms |
| Background darkening (`addWeighted`) | 1–2ms |
| MediaPipe hand detection | 10–20ms (CPU), ~5ms (GPU) |
| Gesture recognition (per hand) | <1ms |
| Landmark + neon drawing | 2–10ms |
| JPEG encoding (`imencode`) | 5–10ms |
| **Total per frame** | **~25–35ms → ~30 FPS** |

---

## Thread Safety Model

| Resource | Access Pattern | Protection |
|----------|---------------|------------|
| `current_theme` | Read: frame generator; Write: `/update_theme` | `threading.Lock()` |
| `processor.fps` | Write: frame generator; Read: `/get_stats` | None (float read is atomic in CPython) |
| `processor.gestures` | Write: frame generator; Read: `/get_stats` | None (list replacement is atomic in CPython) |
| `cap` (VideoCapture) | Frame generator only | Single-writer (no lock needed) |

---

## File Structure

```
gesteffect/
├── app.py                              # Flask app, FrameProcessor, routes (385 lines)
├── requirements.txt                    # Pinned Python dependencies
├── templates/
│   └── index.html                      # Jinja2 template, 153 lines
├── static/
│   └── style.css                       # Glassmorphism UI, 265 lines
├── .github/
│   └── workflows/
│       ├── python-check.yml            # CI: Python syntax check
│       └── documentation-check.yml    # CI: Documentation presence check
├── .gitignore                          # Python, IDE, video file exclusions
├── GESTEFFECT_DESIGN_ARCHITECTURE.md  # This document
├── CONTRIBUTING.md                     # Contribution guidelines
├── CODE_OF_CONDUCT.md                  # Community standards
├── SECURITY.md                         # Security policy
├── LICENSE                             # MIT License
├── setup.sh                            # Linux/macOS setup helper
├── setup.bat                           # Windows setup helper
└── README.md                           # Project readme
```

---

## Deployment

### Local Development
```bash
pip install -r requirements.txt
python app.py
# Open http://localhost:5000
```

### Network Access (LAN)
The app already binds to `0.0.0.0:5000`. Access from other devices on the same network
via `http://<your-ip>:5000`.

For firewall rules on Linux:
```bash
sudo ufw allow 5000/tcp
```

### Production Considerations
- Replace `app.run(debug=False, threaded=True)` with a production WSGI server
- Use `gunicorn` with `gevent` worker for concurrent streaming:
  ```bash
  gunicorn -w 1 -k gevent app:app --bind 0.0.0.0:5000
  ```
- Note: MJPEG streaming requires persistent connections — use only 1 worker process

---

**Version**: 1.0 | **Status**: Production Ready | **Built with**: MediaPipe, OpenCV, Flask, HTML5/CSS3