# GestEffect - Quick Start Guide

## 30-Second Setup

```bash
cd gesteffect
pip install -r requirements.txt
python app.py
```

Then open: **http://localhost:5000**

---

## What You'll See

Your webcam feed with:
- ✨ **Neon hand wireframes** in real-time
- 📊 **FPS counter** (top-left)
- 👐 **Hand count** (top-left)
- 🎭 **Gesture name** (top-left, color-coded)
- 📏 **Hand spread %** (top-left, 0-100%)
- 🎨 **5 theme buttons** (bottom center)

---

## Gestures

| Gesture | How | Color | Action |
|---------|-----|-------|--------|
| 🤏 PINCH | Touch thumb + index | 🔴 Pink | Grab/Select |
| ✊ FIST | Closed hand | 🟠 Orange | Power/Close |
| ✋ OPEN | Spread fingers | 🔵 Cyan | Normal/Drag |

---

## Themes

Click buttons at bottom:
- 🌈 **Rainbow** - RGB cycling
- 🌃 **Cyberpunk** - Neon pink/cyan
- 🔥 **Lava** - Hot colors
- 🌊 **Ocean** - Cool teals
- 🌌 **Galaxy** - Purples & magentas

---

## Files Included

```
gesteffect/
├── app.py                    ← Flask backend
├── requirements.txt          ← Dependencies
├── templates/index.html      ← Web UI
├── static/style.css          ← Styling
├── README.md                 ← Full guide
├── QUICK_START.md            ← This file
└── GESTEFFECT_DESIGN_ARCHITECTURE.md  ← Technical docs
```

---

## System Requirements

| Item | Requirement |
|------|------------|
| Python | 3.8+ |
| Webcam | Any USB or integrated |
| Browser | Chrome, Firefox, Safari, Edge |
| RAM | 2GB minimum |
| CPU | Dual-core minimum |
| GPU | Optional (faster) |

---

## Common Issues & Fixes

### "No hands detected"
→ Better lighting, move closer

### "Laggy video"
→ Close other apps, reduce resolution in code

### "Camera not found"
→ Check `ls /dev/video*`, try `cv2.VideoCapture(1)`

### "ModuleNotFoundError"
→ Run: `pip install -r requirements.txt`

---

## Configuration Quick Tips

Edit `app.py` to change:

```python
# Line ~16: Detection settings
min_detection_confidence=0.5  # Lower = more detections
max_num_hands=2               # Max hands to track

# Line ~60: Camera settings
cv2.CAP_PROP_FRAME_WIDTH=1280   # Resolution width
cv2.CAP_PROP_FRAME_HEIGHT=720   # Resolution height
cv2.CAP_PROP_FPS=30             # Frames per second

# Line ~23-24: Gesture thresholds
PINCH_THRESHOLD = 50  # Lower = easier pinch
FIST_THRESHOLD = 80   # Lower = easier fist
```

---

## API Quick Reference

```bash
# Get current stats
curl http://localhost:5000/get_stats

# Change theme (replace "Lava" with theme name)
curl -X POST http://localhost:5000/update_theme \
  -H "Content-Type: application/json" \
  -d '{"theme": "Lava"}'

# Get current theme
curl http://localhost:5000/get_theme
```

---

## Performance Tips

1. **Faster**: Use GPU (if available)
2. **Better detection**: Good lighting, clean background
3. **Smoother**: Reduce resolution to 640×480 if needed
4. **Lower CPU**: Close other applications

---

## Mobile / Remote Access

To access from other computers:

1. Find your IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
2. Edit `app.py` line ~95:
   ```python
   app.run(host='0.0.0.0', port=5000)
   ```
3. On other device, visit: `http://YOUR_IP:5000`

---

## Browser DevTools

Press **F12** to see:
- Console for JavaScript errors
- Network tab to see video stream
- Performance metrics

---

## Keyboard Shortcuts (in HTML, add to index.html)

Optional enhancements:
- `T` = Cycle themes
- `R` = Reset detection
- `F` = Toggle fullscreen

---

## Video/Audio Recording

To record the processed video:

```python
# Add to app.py after line 54:
fourcc = cv2.VideoWriter_fourcc(*'mp4v')
out = cv2.VideoWriter('output.mp4', fourcc, 30.0, (1280, 720))

# Add in generate_frames() after encoding:
out.write(processed_frame)

# Add cleanup in finally block:
out.release()
```

---

## Testing Checklist

- [ ] Python 3.8+ installed
- [ ] Dependencies installed (`pip install -r requirements.txt`)
- [ ] Webcam connected and working
- [ ] Flask runs without errors
- [ ] Browser loads http://localhost:5000
- [ ] Video feed appears
- [ ] Hand detection works
- [ ] Gesture recognition responds
- [ ] Themes change colors
- [ ] FPS counter updates
- [ ] Stats panel shows correct info

---

## Next Steps

1. ✅ Try all 5 themes
2. ✅ Test all 3 gestures
3. ✅ Check FPS in different lighting
4. ✅ Read [GESTEFFECT_DESIGN_ARCHITECTURE.md](GESTEFFECT_DESIGN_ARCHITECTURE.md)
5. ✅ Customize themes/gestures if desired

---

## Need More Help?

- 📖 See full **README.md** for detailed guide
- 🏗️ See **GESTEFFECT_DESIGN_ARCHITECTURE.md** for technical details
- 💻 Check Flask console output for errors

---

**Ready to track hands in neon style?** 🚀

Start now:
```bash
python app.py
```

**Then visit: http://localhost:5000** 🎉
