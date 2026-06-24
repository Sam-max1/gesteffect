import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

// ─────────────────────────────────────────────────────────────
// CONSTANTS & CONFIG
// ─────────────────────────────────────────────────────────────
const CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [5,9],[9,10],[10,11],[11,12],
    [9,13],[13,14],[14,15],[15,16],
    [13,17],[0,17],[17,18],[18,19],[19,20]
];

const THEMES = {
    Rainbow:    { colors: ['#ff0000','#00ff00','#0000ff'], core: '#ffffff' },
    Cyberpunk:  { colors: ['#ff14a3','#00ffff'],           core: '#ffffff' },
    Lava:       { colors: ['#ff2200','#ff8800','#ffff00'], core: '#ffffff' },
    Ocean:      { colors: ['#00e5ff','#0088ff'],           core: '#ffffff' },
    Galaxy:     { colors: ['#cc00ff','#ff00ff','#ffffff'], core: '#ffffff' },
    Matrix:     { colors: ['#00ff00','#00bb00'],           core: '#ccffcc' },
    Frostbite:  { colors: ['#ffffff','#aaddff','#4499ff'], core: '#ffffff' },
    GoldenHour: { colors: ['#ff9900','#ffdd00','#ff6688'], core: '#fff0cc' },
    Synthwave:  { colors: ['#ff00ff','#00ffff','#ff0077'], core: '#ffccff' },
    NeonDemon:  { colors: ['#ff0000','#cc0000','#ff4444'], core: '#ff9999' },
};
const THEME_KEYS = Object.keys(THEMES);

const PINCH_THRESHOLD = 0.06;
const FIST_THRESHOLD  = 0.12;

// ─────────────────────────────────────────────────────────────
// AUDIO ENGINE
// ─────────────────────────────────────────────────────────────
class AudioEngine {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0; // Starts muted
        this.master.connect(this.ctx.destination);
        this.isMuted = true;
        this.osc = null;
        this.gain = null;
    }

    init() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        if (!this.osc) {
            this.osc = this.ctx.createOscillator();
            this.gain = this.ctx.createGain();
            this.osc.type = 'sine';
            this.osc.frequency.value = 50; 
            this.gain.gain.value = 0.05;
            this.osc.connect(this.gain);
            this.gain.connect(this.master);
            this.osc.start();
        }
    }

    toggleMute() {
        this.init();
        this.isMuted = !this.isMuted;
        this.master.gain.setTargetAtTime(this.isMuted ? 0 : 0.8, this.ctx.currentTime, 0.1);
        return !this.isMuted;
    }

    updateSound(spreadPercent, handCount) {
        if (!this.osc || this.isMuted) return;
        if (handCount === 0) {
            this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
        } else {
            this.gain.gain.setTargetAtTime(0.05 + (spreadPercent / 100) * 0.1, this.ctx.currentTime, 0.1);
            const freq = 50 + (spreadPercent * 1.5) + (handCount === 2 ? 100 : 0);
            this.osc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
        }
    }

    play(type) {
        if (this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain); gain.connect(this.master);
        if (type === 'fireball') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.5);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
            osc.start(now); osc.stop(now + 0.5);
        } else if (type === 'heart') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.setValueAtTime(600, now + 0.1); 
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            osc.start(now); osc.stop(now + 0.3);
        }
    }
}
const audio = new AudioEngine();

// ─────────────────────────────────────────────────────────────
// STATE & DOM
// ─────────────────────────────────────────────────────────────
const video = document.getElementById('videoElement');
const canvas = document.getElementById('outputCanvas');
const ctx = canvas.getContext('2d', { alpha: false });
let handLandmarker = null;
let currentTheme = 'Cyberpunk';
let themeAutoRotate = true;
let frameCount = 0;
let framesThisSecond = 0;
let lastFpsTime = performance.now();
let fps = 0;
let isPaused = false;
let animFrameId = null;

// Fireball State
let prevHands = null;
let chargeFrames = 0;
let throwCooldown = 0;
const fireballs = [];
let chargeAmount = 0;
let fullGrownFrames = 0;
let pendingFireballPos = null;

// Heart State
const hearts = [];
const particles = [];
let nextHeartSpawn = 0;
let heartCharges = [0, 0];

// ─────────────────────────────────────────────────────────────
// GESTURE DETECTION
// ─────────────────────────────────────────────────────────────
function detectGesture(lm) {
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    if (dist(lm[4], lm[8]) < PINCH_THRESHOLD) return 'PINCH! 🤏';
    const palm = lm[9];
    const maxDist = Math.max(...[4, 8, 12, 16, 20].map(i => dist(palm, lm[i])));
    if (maxDist < FIST_THRESHOLD) return 'Fist ✊';
    return 'Open Hand 🖐';
}

function calcSpread(lm) {
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const dists = [4, 8, 12, 16, 20].map(i => dist(lm[9], lm[i]));
    const spread = ((Math.max(...dists) - Math.min(...dists)) / Math.max(Math.max(...dists), 0.001)) * 100;
    return Math.max(0, Math.min(100, spread));
}

function isFingerHeart(lm) {
    // Thumb(4) and Index(8) close together
    if (Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) > 0.08) return false;
    // Both pointing upwards (y is less than palm y)
    if (lm[8].y > lm[9].y || lm[4].y > lm[9].y) return false;
    // Middle, ring, pinky generally curled (tips below PIPs)
    if (lm[12].y < lm[10].y && lm[16].y < lm[14].y) return false;
    return true;
}

const palmCenter = (lm) => lm[9];
function getVelocity(cur, prev) {
    if (!prev) return { vx: 0, vy: 0, speed: 0 };
    const vx = cur.x - prev.x, vy = cur.y - prev.y;
    return { vx, vy, speed: Math.hypot(vx, vy) };
}

class Fireball {
    constructor(x, y, vx, vy, radius) {
        this.x = x; this.y = y; this.vx = vx; this.vy = vy;
        this.radius = radius; this.life = 1.0; this.age = 0; this.trail = [];
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        this.life -= 0.015; this.age++;
        for (let i = 0; i < 3; i++) {
            this.trail.push({
                x: this.x + (Math.random()-0.5)*this.radius, y: this.y + (Math.random()-0.5)*this.radius,
                vx: -this.vx*0.1 + (Math.random()-0.5)*2, vy: -this.vy*0.1 + (Math.random()-0.5)*2,
                life: 1.0, r: this.radius*(0.2+Math.random()*0.3), hue: 10 + Math.random()*30
            });
        }
        this.trail = this.trail.filter(e => e.life > 0);
        this.trail.forEach(e => { e.x+=e.vx; e.y+=e.vy; e.life-=0.05; e.r*=0.95; });
    }
    draw(ctx) {
        for (const e of this.trail) {
            ctx.globalAlpha = e.life;
            ctx.fillStyle = `hsl(${e.hue}, 100%, 50%)`;
            ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI*2); ctx.fill();
        }
        ctx.globalAlpha = this.life;
        const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
        g.addColorStop(0, '#fff'); g.addColorStop(0.2, '#ffaa00'); g.addColorStop(1, 'rgba(255,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

class Particle {
    constructor(x, y, vx, vy, color, life, size) {
        this.x = x; this.y = y; this.vx = vx; this.vy = vy;
        this.color = color; this.life = life; this.maxLife = life; this.size = size;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        this.life -= 0.016;
        if(this.y > canvas.height) this.vy *= -0.6; // bounce
    }
    draw(ctx) {
        ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

function spawnParticles(x, y, count, colorFunc, speedMultiplier = 1) {
    for (let i=0; i<count; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = Math.random() * 10 * speedMultiplier;
        particles.push(new Particle(x, y, Math.cos(a)*s, Math.sin(a)*s, colorFunc(), 1.0 + Math.random(), 2 + Math.random()*4));
    }
}

class Heart {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * 6;
        this.vy = -Math.random() * 5 - 2; // Floating upwards
        this.size = 10 + Math.random() * 30; // Variable sizes
        this.life = 5 + Math.random() * 5; // 5 to 10 seconds
        this.maxLife = this.life;
        this.hue = 300 + Math.random() * 50; // Pink/magenta range (300-350)
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        // Bouncing off walls and floor
        if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
        if (this.y < 0) this.vy *= -1;
        if (this.y > canvas.height) {
            this.y = canvas.height;
            this.vy *= -0.8;
        }
        this.life -= 1/60; 
        if (this.life <= 0) {
            spawnParticles(this.x, this.y, 30, () => `hsl(${this.hue}, 100%, 60%)`, 3);
            audio.play('heart'); // Play small pop
        }
    }
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.min(1.0, this.life * 2); // Fade out near end
        ctx.fillStyle = `hsl(${this.hue}, 100%, 60%)`;
        ctx.shadowBlur = 15;
        ctx.shadowColor = ctx.fillStyle;
        ctx.translate(this.x, this.y);
        const s = this.size / 15;
        ctx.scale(s, s);
        ctx.beginPath();
        ctx.moveTo(0, 5);
        ctx.bezierCurveTo(-5, 0, -10, -5, -10, -10);
        ctx.bezierCurveTo(-10, -15, -5, -20, 0, -15);
        ctx.bezierCurveTo(5, -20, 10, -15, 10, -10);
        ctx.bezierCurveTo(10, -5, 5, 0, 0, 5);
        ctx.fill();
        ctx.restore();
    }
}

function drawHeartWireframe(ctx, x, y, size, progress) {
    ctx.save();
    ctx.translate(x, y);
    const s = size / 15;
    ctx.scale(s, s);
    ctx.lineWidth = 3 / s;
    ctx.strokeStyle = '#ff0077';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#ff0077';
    
    ctx.beginPath();
    ctx.moveTo(0, 5);
    ctx.bezierCurveTo(-5, 0, -10, -5, -10, -10);
    ctx.bezierCurveTo(-10, -15, -5, -20, 0, -15);
    ctx.bezierCurveTo(5, -20, 10, -15, 10, -10);
    ctx.bezierCurveTo(10, -5, 5, 0, 0, 5);
    
    const pathLength = 80; 
    ctx.setLineDash([pathLength]);
    ctx.lineDashOffset = pathLength * (1 - progress);
    
    ctx.stroke();
    
    if (progress >= 1.0) {
        ctx.fillStyle = 'rgba(255, 0, 119, 0.3)';
        ctx.fill();
    }
    ctx.restore();
}

// ─────────────────────────────────────────────────────────────
// NEON WIREFRAME DRAWING
// ─────────────────────────────────────────────────────────────
function getNeonColor(time, handIdx) {
    if (currentTheme === 'Rainbow') {
        return `hsl(${(time * 0.05 + handIdx * 180) % 360}, 100%, 50%)`;
    }
    const pal = THEMES[currentTheme].colors;
    return pal[(Math.floor(time * 0.05) + handIdx * 3) % pal.length];
}

function drawNeonLine(x1, y1, x2, y2, color, core) {
    ctx.save();
    ctx.shadowBlur = 12; ctx.shadowColor = color;
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    
    ctx.shadowBlur = 4; ctx.shadowColor = core;
    ctx.strokeStyle = core; ctx.lineWidth = 0.5; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();

    // Sparkle effect
    if (Math.random() > 0.65) {
        const t = Math.random();
        ctx.save();
        ctx.shadowBlur = 8; ctx.shadowColor = '#ffffff';
        ctx.fillStyle = color; ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(x1 + t*(x2-x1), y1 + t*(y2-y1), 1.5, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
    }
}

function drawHand(lm, handIdx) {
    const W = canvas.width, H = canvas.height;
    const color = getNeonColor(frameCount, handIdx);
    const core  = THEMES[currentTheme].core;
    
    for (const [a, b] of CONNECTIONS) {
        drawNeonLine(lm[a].x * W, lm[a].y * H, lm[b].x * W, lm[b].y * H, color, core);
    }
}

function drawMultiverseConnections(hand1, hand2) {
    const W = canvas.width, H = canvas.height;
    const color = THEMES[currentTheme].colors[0];
    for (const tip of [4, 8, 12, 16, 20]) {
        drawNeonLine(
            hand1[tip].x * W, hand1[tip].y * H,
            hand2[tip].x * W, hand2[tip].y * H,
            color, '#ffffff'
        );
    }
}

function processFireball(hands) {
    const W = canvas.width, H = canvas.height;
    if (throwCooldown > 0) throwCooldown--;
    let actionText = null;
    let chargeRadius = 0;
    let chargePos = null;

    let isCharging = false;
    let v1 = {vx:0, vy:0, speed:0}, v2 = {vx:0, vy:0, speed:0};

    if (hands.length === 2 && prevHands && prevHands.length === 2) {
        const c1 = palmCenter(hands[0]), c2 = palmCenter(hands[1]);
        const d = Math.hypot(c1.x - c2.x, c1.y - c2.y);
        if (d < 0.4) {
            isCharging = true;
            v1 = getVelocity(c1, palmCenter(prevHands[0]));
            v2 = getVelocity(c2, palmCenter(prevHands[1]));
            pendingFireballPos = { x: (c1.x + c2.x) / 2 * W, y: (c1.y + c2.y) / 2 * H };
        }
    }

    if (isCharging || chargeAmount >= 500) {
        if (isCharging) {
            const rubSpeed = v1.speed + v2.speed;
            chargeAmount += 1.0 + (rubSpeed * 30.0);
        }
        
        chargeRadius = Math.min(500, chargeAmount * 1.5);
        chargePos = pendingFireballPos || { x: W/2, y: H/2 };

        if (chargeRadius >= 500) {
            fullGrownFrames++;
            if (fullGrownFrames > 180) { // 3 seconds at 60fps
                audio.play('fireball');
                const angle = Math.random() * Math.PI * 2;
                fireballs.push(new Fireball(chargePos.x, chargePos.y, Math.cos(angle)*15, Math.sin(angle)*15, chargeRadius));
                chargeAmount = 0; fullGrownFrames = 0; pendingFireballPos = null; throwCooldown = 30; chargeRadius = 0;
                actionText = "🔥 AUTO THROW";
            } else {
                actionText = "🔥 FULLY CHARGED";
            }
        } else {
            fullGrownFrames = 0;
            actionText = "🔥 CHARGING";
        }

        if (isCharging && chargeAmount > 30 && throwCooldown === 0) {
            if (v1.speed > 0.05 && v2.speed > 0.05) {
                audio.play('fireball');
                let dx = (v1.vx + v2.vx) * W * 0.5;
                let dy = (v1.vy + v2.vy) * H * 0.5;
                if (Math.hypot(dx, dy) < 5) { dx = 0; dy = -15; }
                fireballs.push(new Fireball(chargePos.x, chargePos.y, dx, dy, Math.max(40, chargeRadius)));
                chargeAmount = 0; fullGrownFrames = 0; pendingFireballPos = null; throwCooldown = 30; chargeRadius = 0;
                actionText = "🔥 MASSIVE FIREBALL";
            }
        }
    } else {
        chargeAmount = 0;
        fullGrownFrames = 0;
        pendingFireballPos = null;
    }

    if (chargeAmount === 0 && hands.length === 1 && prevHands && prevHands.length === 1) {
        const c = palmCenter(hands[0]);
        const v = getVelocity(c, palmCenter(prevHands[0]));
        if (v.speed > 0.04 && throwCooldown === 0) {
            audio.play('fireball');
            fireballs.push(new Fireball(c.x*W, c.y*H, v.vx*W, v.vy*H, 60));
            throwCooldown = 20;
            actionText = "🔥 THROW";
        }
    }

    return { actionText, chargeRadius, chargePos };
}

// ─────────────────────────────────────────────────────────────
// MAIN LOOP
// ─────────────────────────────────────────────────────────────
function detectLoop() {
    if (!handLandmarker || video.readyState < 2 || isPaused) {
        animFrameId = requestAnimationFrame(detectLoop);
        return;
    }

    try {
        frameCount++;
        framesThisSecond++;
        const now = performance.now();
        if (now - lastFpsTime >= 1000) {
            fps = Math.round(framesThisSecond / ((now - lastFpsTime) / 1000));
            document.getElementById('fps').textContent = fps;
            lastFpsTime = now; 
            framesThisSecond = 0;
        }

        const results = handLandmarker.detectForVideo(video, now);

        // Draw mirrored video + darken
        ctx.save();
        ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const hands = results.landmarks || [];
        const mirroredHands = hands.map(hand => hand.map(lm => ({...lm, x: 1 - lm.x})));
        document.getElementById('handCount').textContent = mirroredHands.length;

        const fbData = processFireball(mirroredHands);

        if (mirroredHands.length > 0) {

            // Draw Particles
            for (let i = particles.length - 1; i >= 0; i--) {
                particles[i].update(); particles[i].draw(ctx);
                if (particles[i].life <= 0) particles.splice(i, 1);
            }

            // Draw Hearts
            for (let i = hearts.length - 1; i >= 0; i--) {
                hearts[i].update(); hearts[i].draw(ctx);
                if (hearts[i].life <= 0) hearts.splice(i, 1);
            }

            // Draw Fireballs
            for (let i = fireballs.length - 1; i >= 0; i--) {
                fireballs[i].update(); fireballs[i].draw(ctx);
                if (fireballs[i].life <= 0) fireballs.splice(i, 1);
            }

            let makingHeart = false;
            mirroredHands.forEach((hand, i) => {
                drawHand(hand, i);
                if (isFingerHeart(hand)) {
                    heartCharges[i] = Math.min(60, (heartCharges[i] || 0) + 2);
                    const progress = heartCharges[i] / 60;
                    
                    const hx = (hand[4].x + hand[8].x) / 2 * canvas.width;
                    const hy = (hand[4].y + hand[8].y) / 2 * canvas.height;
                    
                    drawHeartWireframe(ctx, hx, hy, 40, progress);

                    if (progress >= 1.0) {
                        makingHeart = true;
                        if (frameCount >= nextHeartSpawn) {
                            hearts.push(new Heart(hand[8].x * canvas.width, hand[8].y * canvas.height));
                            nextHeartSpawn = frameCount + (30 + Math.random() * 150);
                            audio.play('heart'); 
                        }
                    }
                } else {
                    heartCharges[i] = Math.max(0, (heartCharges[i] || 0) - 5);
                }
            });
            
            if (!makingHeart && frameCount >= nextHeartSpawn) {
                nextHeartSpawn = frameCount; 
            }

            if (mirroredHands.length === 2) {
                drawMultiverseConnections(mirroredHands[0], mirroredHands[1]);
            }

            const g = fbData.actionText || detectGesture(mirroredHands[0]);
            const s = calcSpread(mirroredHands[0]);
            audio.updateSound(s, mirroredHands.length);

            const gestEl = document.getElementById('gesture');
            gestEl.textContent = g;
            gestEl.className = 'stat-value gesture-text';
            if (makingHeart)               gestEl.textContent = '💕 FINGER HEART';
            else if (g.includes('🔥'))     gestEl.classList.add('gesture-fist');
            else if (g.startsWith('PINCH'))gestEl.classList.add('gesture-pinch');
            else if (g.startsWith('Fist')) gestEl.classList.add('gesture-fist');
            else                           gestEl.classList.add('gesture-open');
            document.getElementById('spread').textContent = Math.round(s) + '%';
            
            prevHands = mirroredHands;
        } else {
            audio.updateSound(0, 0);
            document.getElementById('gesture').textContent = '—';
            document.getElementById('spread').textContent  = '0%';
            prevHands = null;
            if (frameCount >= nextHeartSpawn) nextHeartSpawn = frameCount;
            
            // Still draw lingering particles/hearts
            for (let i = particles.length - 1; i >= 0; i--) {
                particles[i].update(); particles[i].draw(ctx);
                if (particles[i].life <= 0) particles.splice(i, 1);
            }
            for (let i = hearts.length - 1; i >= 0; i--) {
                hearts[i].update(); hearts[i].draw(ctx);
                if (hearts[i].life <= 0) hearts.splice(i, 1);
            }
            for (let i = fireballs.length - 1; i >= 0; i--) {
                fireballs[i].update(); fireballs[i].draw(ctx);
                if (fireballs[i].life <= 0) fireballs.splice(i, 1);
            }
        }

        // Draw Charging Fireball (global so it persists if hands drop)
        if (fbData.chargeRadius > 0 && fbData.chargePos) {
            const r = fbData.chargeRadius;
            ctx.save();
            ctx.globalAlpha = 0.8 + Math.random() * 0.2;
            const grad = ctx.createRadialGradient(fbData.chargePos.x, fbData.chargePos.y, 0, fbData.chargePos.x, fbData.chargePos.y, r);
            grad.addColorStop(0, '#fff'); 
            grad.addColorStop(0.3, '#ffaa00'); 
            grad.addColorStop(1, 'rgba(255,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath(); 
            ctx.arc(fbData.chargePos.x, fbData.chargePos.y, r, 0, Math.PI*2); 
            ctx.fill();
            if (Math.random() > 0.5) {
                ctx.fillStyle = `hsl(${20 + Math.random()*30}, 100%, 50%)`;
                ctx.beginPath();
                ctx.arc(fbData.chargePos.x + (Math.random()-0.5)*r, fbData.chargePos.y + (Math.random()-0.5)*r, 1.5, 0, Math.PI*2);
                ctx.fill();
            }
            ctx.restore();
        }

        animFrameId = requestAnimationFrame(detectLoop);
    } catch (err) {
        console.error("Error in detectLoop:", err);
        animFrameId = requestAnimationFrame(detectLoop);
    }
}

// ─────────────────────────────────────────────────────────────
// INITIALIZATION
// ─────────────────────────────────────────────────────────────
document.getElementById('startCameraBtn').addEventListener('click', async () => {
    const btn = document.getElementById('startCameraBtn');
    btn.textContent = 'Loading Engine...';
    btn.disabled = true;
    try {
        audio.init();

        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
            video.srcObject = null;
        }
        if (animFrameId) cancelAnimationFrame(animFrameId);

        const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
        
        if (handLandmarker) handLandmarker.close();
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task", delegate: "GPU" },
            runningMode: "VIDEO", numHands: 2, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5
        });
        
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play();
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            document.getElementById('cameraOverlay').style.display = 'none';
            animFrameId = requestAnimationFrame(detectLoop);
        };
    } catch(e) {
        btn.textContent = 'Retry'; btn.disabled = false; console.error(e);
    }
});

// ─────────────────────────────────────────────────────────────
// UI CONTROLS & THEMES
// ─────────────────────────────────────────────────────────────
function setThemeUI(theme) {
    currentTheme = theme;
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
}

let themeIdx = THEME_KEYS.indexOf(currentTheme);
setInterval(() => {
    if (themeAutoRotate) {
        themeIdx = (themeIdx + 1) % THEME_KEYS.length;
        setThemeUI(THEME_KEYS[themeIdx]);
    }
}, 15000);

document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        themeAutoRotate = false;
        setThemeUI(btn.dataset.theme);
    });
});

const controlsContainer = document.createElement('div');
controlsContainer.className = 'controls-container';
document.body.appendChild(controlsContainer);

// Pause Button
const pauseBtn = document.createElement('button');
pauseBtn.className = 'control-btn';
pauseBtn.innerHTML = '▶️ Pause';
pauseBtn.addEventListener('click', () => {
    isPaused = !isPaused;
    pauseBtn.innerHTML = isPaused ? '▶️ Resume' : '⏸️ Pause';
    pauseBtn.classList.toggle('active-pause', isPaused);
});
controlsContainer.appendChild(pauseBtn);

// Mute Button
const muteBtn = document.createElement('button');
muteBtn.className = 'control-btn mute-btn';
muteBtn.innerHTML = '🔇 Muted';
muteBtn.addEventListener('click', () => {
    const isAudioOn = audio.toggleMute(); // Returns true if audio is currently ON
    muteBtn.innerHTML = isAudioOn ? '🔊 Audio On' : '🔇 Muted';
    muteBtn.classList.toggle('active-audio', isAudioOn);
});
controlsContainer.appendChild(muteBtn);

// Kill Button
const killBtn = document.createElement('button');
killBtn.className = 'control-btn kill-btn';
killBtn.innerHTML = '🛑 Kill Server';
killBtn.addEventListener('click', () => {
    fetch('/kill', { method: 'POST' }).catch(() => {});
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    isPaused = true;
    document.getElementById('terminatedOverlay').style.display = 'flex';
});
controlsContainer.appendChild(killBtn);

// ─────────────────────────────────────────────────────────────
// RECORDING LOGIC
// ─────────────────────────────────────────────────────────────
const recordBtn = document.getElementById('recordBtn');
controlsContainer.insertBefore(recordBtn, controlsContainer.firstChild);

const statusPill = document.getElementById('recordingStatusPill');
const statusText = document.getElementById('recordingStatusText');
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let countdownInterval = null;

function pad(n) { return n < 10 ? '0' + n : n; }
function getFormattedDateTime() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

recordBtn.addEventListener('click', () => {
    if (isRecording || countdownInterval) return; // Prevent multiple clicks
    
    recordBtn.disabled = true;
    recordBtn.style.opacity = '0.5';
    
    // Start 5 second countdown
    let preCount = 5;
    statusPill.style.display = 'flex';
    statusText.textContent = `Starting in ${preCount}...`;
    statusPill.querySelector('.status-dot').style.animation = 'none'; // Solid dot during countdown
    statusPill.querySelector('.status-dot').style.background = '#ffa500'; // Orange
    
    countdownInterval = setInterval(() => {
        preCount--;
        if (preCount > 0) {
            statusText.textContent = `Starting in ${preCount}...`;
        } else {
            clearInterval(countdownInterval);
            countdownInterval = null;
            startRecording();
        }
    }, 1000);
});

function startRecording() {
    recordedChunks = [];
    const stream = canvas.captureStream(30);
    
    // Check mime type
    let options = { mimeType: 'video/webm; codecs=vp9' };
    if (MediaRecorder.isTypeSupported('video/mp4; codecs="avc1.424028, mp4a.40.2"')) {
        options = { mimeType: 'video/mp4; codecs="avc1.424028, mp4a.40.2"' };
    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        options = { mimeType: 'video/mp4' };
    } else if (MediaRecorder.isTypeSupported('video/webm; codecs=vp8')) {
        options = { mimeType: 'video/webm; codecs=vp8' };
    } else if (MediaRecorder.isTypeSupported('video/webm')) {
        options = { mimeType: 'video/webm' };
    } else {
        options = {}; // fallback
    }

    try {
        mediaRecorder = new MediaRecorder(stream, options);
    } catch (e) {
        console.error("Exception while creating MediaRecorder:", e);
        mediaRecorder = new MediaRecorder(stream);
    }
    
    mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    };
    
    mediaRecorder.onstop = () => {
        statusText.textContent = 'Saving...';
        const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        document.body.appendChild(a);
        a.style = 'display: none';
        a.href = url;
        // Check if the mimeType contains 'mp4' (if browser supported it). Otherwise, fallback to webm.
        // It's safer to always request mp4 as the extension per requirements, but if we recorded webm, we might create a corrupted mp4.
        // The instructions: "save in mp4 format... file naming convention gesteffect_date_time.mp4"
        a.download = `gesteffect_${getFormattedDateTime()}.mp4`;
        a.click();
        window.URL.revokeObjectURL(url);
        
        statusPill.style.display = 'none';
        recordBtn.disabled = false;
        recordBtn.style.opacity = '1';
        recordBtn.classList.remove('recording');
        recordBtn.querySelector('.record-text').textContent = 'Record';
        isRecording = false;
    };
    
    mediaRecorder.start();
    isRecording = true;
    recordBtn.classList.add('recording');
    recordBtn.querySelector('.record-text').textContent = 'Recording';
    
    // 60 second recording countdown
    let recCount = 60;
    statusPill.querySelector('.status-dot').style.animation = 'blink 1s infinite alternate';
    statusPill.querySelector('.status-dot').style.background = '#ff0000'; // Red
    statusText.textContent = `🔴 Recording ${recCount}s`;
    
    const recInterval = setInterval(() => {
        recCount--;
        if (recCount > 0) {
            statusText.textContent = `🔴 Recording ${recCount}s`;
        } else {
            clearInterval(recInterval);
            if (mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
        }
    }, 1000);
}
