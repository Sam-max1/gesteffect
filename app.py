"""
GestEffect - Real-time AR Hand Tracking Web Application
Flask backend with MediaPipe hand detection, gesture recognition, and neon visual effects.
"""

import cv2
import mediapipe as mp
import numpy as np
import math
from flask import Flask, render_template, Response, jsonify, request
from threading import Lock
import time

# Initialize Flask app
app = Flask(__name__, template_folder='templates', static_folder='static')

# MediaPipe setup
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils
hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=2,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# Global variables
current_theme = "Cyberpunk"
theme_lock = Lock()

# Theme color palettes (BGR format for OpenCV)
THEME_COLORS = {
    "Rainbow": {
        "primary": [(255, 0, 0), (0, 255, 0), (0, 0, 255)],  # Will cycle
        "secondary": (200, 200, 200),
        "glow_core": (255, 255, 255)
    },
    "Cyberpunk": {
        "primary": [(147, 20, 255), (255, 255, 0)],  # Neon Pink, Cyan
        "secondary": (100, 100, 100),
        "glow_core": (255, 255, 255)
    },
    "Lava": {
        "primary": [(0, 0, 255), (0, 165, 255), (0, 255, 255)],  # Red, Orange, Yellow
        "secondary": (50, 50, 50),
        "glow_core": (255, 255, 255)
    },
    "Ocean": {
        "primary": [(200, 255, 0), (255, 200, 0)],  # Teal, Light Blue
        "secondary": (100, 100, 100),
        "glow_core": (255, 255, 255)
    },
    "Galaxy": {
        "primary": [(255, 0, 150), (255, 0, 255), (255, 255, 255)],  # Deep Purple, Magenta, White
        "secondary": (60, 20, 80),
        "glow_core": (255, 255, 255)
    }
}

# Gesture thresholds
PINCH_THRESHOLD = 50  # Distance in pixels between thumb and index for pinch
FIST_THRESHOLD = 80   # Max distance from palm to fingertips for fist


class FrameProcessor:
    """Handles video frame processing and hand tracking."""
    
    def __init__(self):
        self.frame_count = 0
        self.fps_start_time = time.time()
        self.fps = 0
        self.hand_count = 0
        self.gestures = ["Unknown", "Unknown"]
        self.spreads = [0, 0]
        
    def calculate_distance(self, point1, point2):
        """Calculate Euclidean distance between two points."""
        return math.sqrt((point1[0] - point2[0])**2 + (point1[1] - point2[1])**2)
    
    def calculate_hand_spread(self, landmarks, frame_width, frame_height):
        """Calculate hand spread percentage."""
        if not landmarks:
            return 0
        
        # Convert normalized landmarks to pixel coordinates
        points = [(int(lm.x * frame_width), int(lm.y * frame_height)) for lm in landmarks]
        
        # Calculate distances from palm center (landmark 9) to fingertips (4, 8, 12, 16, 20)
        palm_center = points[9]
        fingertip_indices = [4, 8, 12, 16, 20]
        distances = [self.calculate_distance(palm_center, points[i]) for i in fingertip_indices]
        
        # Normalize to 0-100%
        max_distance = max(distances) if distances else 1
        min_distance = min(distances) if distances else 0
        spread = ((max_distance - min_distance) / max(max_distance, 1)) * 100
        
        return max(0, min(100, spread))
    
    def detect_gesture(self, landmarks, frame_width, frame_height):
        """Detect gesture from hand landmarks."""
        if not landmarks:
            return "Unknown"
        
        # Convert normalized landmarks to pixel coordinates
        points = [(int(lm.x * frame_width), int(lm.y * frame_height)) for lm in landmarks]
        
        # Pinch detection: distance between thumb (4) and index (8)
        thumb_index_distance = self.calculate_distance(points[4], points[8])
        if thumb_index_distance < PINCH_THRESHOLD:
            return "PINCH!"
        
        # Fist detection: all fingertips close to palm
        palm_center = points[9]
        fingertip_indices = [4, 8, 12, 16, 20]
        distances = [self.calculate_distance(palm_center, points[i]) for i in fingertip_indices]
        max_fingertip_distance = max(distances)
        
        if max_fingertip_distance < FIST_THRESHOLD:
            return "Fist"
        
        # Default to Open Hand
        return "Open Hand"
    
    def get_neon_color(self, frame_index):
        """Get neon color based on theme."""
        with theme_lock:
            theme = current_theme
        
        colors = THEME_COLORS[theme]["primary"]
        
        if theme == "Rainbow":
            color_index = (frame_index // 5) % len(colors)
            return colors[color_index]
        else:
            color_index = frame_index % len(colors)
            return colors[color_index]
    
    def draw_neon_line(self, frame, pt1, pt2, color, thickness=3):
        """Draw a neon glowing line."""
        # Draw outer glow (thicker, darker)
        glow_color = tuple(int(c * 0.3) for c in color)
        cv2.line(frame, pt1, pt2, glow_color, thickness + 4)
        
        # Draw main line
        cv2.line(frame, pt1, pt2, color, thickness)
        
        # Draw bright core
        core_color = THEME_COLORS[current_theme]["glow_core"]
        cv2.line(frame, pt1, pt2, core_color, 1)
    
    def draw_hand_landmarks(self, frame, hand_landmarks, handedness, hand_index):
        """Draw hand landmarks with neon effect."""
        frame_height, frame_width = frame.shape[:2]
        
        # Get gesture and spread for this hand
        gesture = self.detect_gesture(hand_landmarks.landmark, frame_width, frame_height)
        spread = self.calculate_hand_spread(hand_landmarks.landmark, frame_width, frame_height)
        
        self.gestures[hand_index] = gesture
        self.spreads[hand_index] = spread
        
        # Convert landmarks to pixel coordinates
        h, w = frame.shape[:2]
        points = []
        for lm in hand_landmarks.landmark:
            x = int(lm.x * w)
            y = int(lm.y * h)
            points.append((x, y))
        
        # Get theme color
        color = self.get_neon_color(self.frame_count + hand_index * 10)
        
        # Draw hand landmarks and connections
        connections = mp_hands.HAND_CONNECTIONS
        
        # Draw connections
        for connection in connections:
            start_idx, end_idx = connection
            start_point = points[start_idx]
            end_point = points[end_idx]
            self.draw_neon_line(frame, start_point, end_point, color, thickness=2)
        
        # Draw landmark points
        for point in points:
            cv2.circle(frame, point, 3, color, -1)
            # Add glow effect
            glow_color = tuple(int(c * 0.3) for c in color)
            cv2.circle(frame, point, 5, glow_color, 1)
    
    def draw_multiverse_connections(self, frame, results):
        """Draw lines connecting corresponding fingertips between two hands."""
        if len(results.multi_hand_landmarks) < 2:
            return
        
        h, w = frame.shape[:2]
        
        # Fingertip landmark indices: 4=Thumb, 8=Index, 12=Middle, 16=Ring, 20=Pinky
        fingertip_indices = [4, 8, 12, 16, 20]
        
        # Get landmarks for both hands
        hand1_landmarks = results.multi_hand_landmarks[0]
        hand2_landmarks = results.multi_hand_landmarks[1]
        
        # Use a connection color from the secondary theme color
        connection_color = THEME_COLORS[current_theme]["primary"][0]
        
        # Draw lines between corresponding fingertips
        for fingertip_idx in fingertip_indices:
            pt1 = hand1_landmarks.landmark[fingertip_idx]
            pt2 = hand2_landmarks.landmark[fingertip_idx]
            
            p1 = (int(pt1.x * w), int(pt1.y * h))
            p2 = (int(pt2.x * w), int(pt2.y * h))
            
            self.draw_neon_line(frame, p1, p2, connection_color, thickness=2)
    
    def update_fps(self):
        """Update FPS counter."""
        self.frame_count += 1
        
        current_time = time.time()
        elapsed_time = current_time - self.fps_start_time
        
        if elapsed_time >= 1.0:
            self.fps = self.frame_count / elapsed_time
            self.frame_count = 0
            self.fps_start_time = current_time
    
    def process_frame(self, frame):
        """Process a single frame."""
        self.update_fps()
        
        h, frame_width = frame.shape[:2]
        h, frame_height = frame.shape[:2]
        
        # Flip frame horizontally for selfie view
        frame = cv2.flip(frame, 1)
        
        # Darken background to make neon pop
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, 0), (frame_width, frame_height), (0, 0, 0), -1)
        frame = cv2.addWeighted(frame, 0.6, overlay, 0.4, 0)
        
        # Process with MediaPipe
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = hands.process(rgb_frame)
        
        # Reset hand count and gestures
        self.hand_count = 0
        self.gestures = ["Unknown", "Unknown"]
        self.spreads = [0, 0]
        
        # Draw hand landmarks
        if results.multi_hand_landmarks:
            self.hand_count = len(results.multi_hand_landmarks)
            
            for hand_index, hand_landmarks in enumerate(results.multi_hand_landmarks):
                self.draw_hand_landmarks(frame, hand_landmarks, 
                                        results.multi_handedness[hand_index] if results.multi_handedness else None,
                                        hand_index)
            
            # Draw multiverse connections if 2 hands detected
            if self.hand_count == 2:
                self.draw_multiverse_connections(frame, results)
        
        # Draw overlay text (stats)
        self.draw_overlay(frame)
        
        return frame
    
    def draw_overlay(self, frame):
        """Draw text overlay with stats."""
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.7
        font_color = (0, 255, 255)  # Cyan
        thickness = 2
        
        # FPS
        cv2.putText(frame, f"FPS: {int(self.fps)}", (10, 30), font, font_scale, font_color, thickness)
        
        # Hand count
        cv2.putText(frame, f"Hands: {self.hand_count}", (10, 60), font, font_scale, font_color, thickness)
        
        # Gestures
        if self.hand_count > 0:
            for i in range(self.hand_count):
                y_offset = 90 + i * 30
                cv2.putText(frame, f"Hand {i+1}: {self.gestures[i]}", (10, y_offset), 
                          font, font_scale, font_color, thickness)
                cv2.putText(frame, f"Spread: {self.spreads[i]:.1f}%", (10, y_offset + 25), 
                          font, font_scale, font_color, thickness)


# Initialize frame processor
processor = FrameProcessor()


def generate_frames():
    """Generator function to continuously capture and process frames."""
    cap = cv2.VideoCapture(0)
    
    # Set camera resolution for better performance
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    cap.set(cv2.CAP_PROP_FPS, 30)
    
    try:
        while True:
            success, frame = cap.read()
            
            if not success:
                break
            
            # Process frame
            processed_frame = processor.process_frame(frame)
            
            # Encode frame to JPEG
            ret, buffer = cv2.imencode('.jpg', processed_frame)
            frame_bytes = buffer.tobytes()
            
            # Yield frame as multipart response
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n'
                   b'Content-Length: ' + str(len(frame_bytes)).encode() + b'\r\n\r\n' +
                   frame_bytes + b'\r\n')
            
    finally:
        cap.release()


@app.route('/')
def index():
    """Render the main page."""
    return render_template('index.html')


@app.route('/video_feed')
def video_feed():
    """Stream video feed."""
    return Response(generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')


@app.route('/update_theme', methods=['POST'])
def update_theme():
    """Update the current theme."""
    global current_theme
    
    data = request.get_json()
    theme = data.get('theme', 'Cyberpunk')
    
    if theme in THEME_COLORS:
        with theme_lock:
            current_theme = theme
        return jsonify({'status': 'success', 'theme': current_theme})
    
    return jsonify({'status': 'error', 'message': 'Invalid theme'}), 400


@app.route('/get_theme', methods=['GET'])
def get_theme():
    """Get the current theme."""
    with theme_lock:
        theme = current_theme
    
    return jsonify({'theme': theme, 'available_themes': list(THEME_COLORS.keys())})


@app.route('/get_stats', methods=['GET'])
def get_stats():
    """Get current statistics."""
    return jsonify({
        'fps': int(processor.fps),
        'hand_count': processor.hand_count,
        'gestures': processor.gestures,
        'spreads': processor.spreads
    })


if __name__ == '__main__':
    print("Starting GestEffect application...")
    print("Available themes:", list(THEME_COLORS.keys()))
    app.run(debug=False, threaded=True, host='0.0.0.0', port=5000)
