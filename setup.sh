#!/bin/bash
# GestEffect - Setup and Verification Script
# Run this script to verify your GestEffect installation

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          GestEffect - Setup & Verification Script             ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counter
CHECKS=0
PASSED=0
FAILED=0

check_item() {
    local name=$1
    local command=$2
    CHECKS=$((CHECKS+1))
    
    echo -n "[$CHECKS] $name ... "
    
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        PASSED=$((PASSED+1))
    else
        echo -e "${RED}✗${NC}"
        FAILED=$((FAILED+1))
    fi
}

# Check Python version
check_item "Python 3.8+" "python --version && python -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)'"

# Check required files
check_item "app.py exists" "test -f app.py"
check_item "requirements.txt exists" "test -f requirements.txt"
check_item "templates/index.html exists" "test -f templates/index.html"
check_item "static/style.css exists" "test -f static/style.css"
check_item "README.md exists" "test -f README.md"

# Check Python imports
echo ""
echo "Checking Python dependencies..."
IMPORT_CHECKS=0
IMPORT_PASSED=0

check_python_import() {
    local module=$1
    local name=$2
    IMPORT_CHECKS=$((IMPORT_CHECKS+1))
    
    echo -n "  - $name ... "
    if python -c "import $module" 2>/dev/null; then
        echo -e "${GREEN}✓${NC}"
        IMPORT_PASSED=$((IMPORT_PASSED+1))
    else
        echo -e "${RED}✗${NC} (install: pip install -r requirements.txt)"
    fi
}

check_python_import "cv2" "OpenCV"
check_python_import "mediapipe" "MediaPipe"
check_python_import "flask" "Flask"
check_python_import "numpy" "NumPy"

# Python syntax check
echo ""
echo "Checking Python syntax..."
echo -n "  - app.py ... "
if python -m py_compile app.py 2>/dev/null; then
    echo -e "${GREEN}✓${NC}"
    CHECKS=$((CHECKS+1))
    PASSED=$((PASSED+1))
else
    echo -e "${RED}✗${NC}"
    CHECKS=$((CHECKS+1))
    FAILED=$((FAILED+1))
fi

# Webcam check (Linux)
echo ""
echo "Checking hardware..."
echo -n "  - Webcam device ... "
if [ -e /dev/video0 ] || [ -e /dev/video1 ] || [ -e /dev/video2 ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}? (not found on Linux, might work on other systems)${NC}"
fi

# Summary
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                        SUMMARY                                 ║"
echo "╠════════════════════════════════════════════════════════════════╣"
echo "║  Total Checks: $CHECKS"
echo "║  Passed:       ${GREEN}$PASSED${NC}"
echo "║  Failed:       ${RED}$FAILED${NC}"
if [ $FAILED -eq 0 ]; then
    echo "║                                                                ║"
    echo "║  ${GREEN}✓ All checks passed! Ready to run.${NC}                        ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Next steps:"
    echo "  1. Run: python app.py"
    echo "  2. Open: http://localhost:5000"
    echo "  3. Allow webcam access when prompted"
    echo ""
    exit 0
else
    echo "║                                                                ║"
    echo "║  ${RED}✗ Some checks failed. See above for details.${NC}               ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "To fix:"
    echo "  1. Install Python 3.8+: https://python.org"
    echo "  2. Install dependencies: pip install -r requirements.txt"
    echo "  3. Check webcam connection"
    echo "  4. Try again: bash setup.sh"
    echo ""
    exit 1
fi
