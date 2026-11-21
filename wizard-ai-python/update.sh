#!/bin/bash
# ============================================
# Wizard.AI SDK - macOS Release Script
# Run from: ~/Development/wizard-ai-python
# ============================================

set -e

# Get current directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🧙 Wizard.AI SDK Release Script (macOS)"
echo "📁 Current directory: $(pwd)"
echo ""

# ============================================
# 1. Get version
# ============================================
CURRENT_VERSION=$(grep -oP 'version = "\K[^"]+' pyproject.toml || echo "unknown")
echo "📦 Current version: $CURRENT_VERSION"
read -p "Enter new version (e.g., 0.1.5): " NEW_VERSION

if [ -z "$NEW_VERSION" ]; then
    echo "❌ No version entered. Exiting."
    exit 1
fi

echo "🚀 Releasing version: $NEW_VERSION"

# ============================================
# 2. Update version in files
# ============================================
echo "📝 Updating version in files..."

# Update pyproject.toml
sed -i '' "s/version = \".*\"/version = \"$NEW_VERSION\"/" pyproject.toml
echo "   ✅ Updated pyproject.toml"

# Update __init__.py
INIT_FILE="src/wizard/__init__.py"
if [ -f "$INIT_FILE" ]; then
    sed -i '' "s/__version__ = \".*\"/__version__ = \"$NEW_VERSION\"/" "$INIT_FILE"
    echo "   ✅ Updated __init__.py"
fi

# ============================================
# 3. Clean old builds
# ============================================
echo "🧹 Cleaning old builds..."
rm -rf dist build src/wizard.egg-info
echo "   ✅ Clean complete"

# ============================================
# 4. Build package
# ============================================
echo "🔨 Building package..."
python3 -m build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi
echo "   ✅ Build successful"

# ============================================
# 5. Show built files
# ============================================
echo "📁 Built files:"
ls -la dist/

# ============================================
# 6. Confirm upload
# ============================================
read -p "🚀 Upload v$NEW_VERSION to PyPI? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ]; then
    echo "❌ Upload cancelled."
    exit 0
fi

# ============================================
# 7. Upload to PyPI
# ============================================
echo "📤 Uploading to PyPI..."

# Set PyPI token
export TWINE_USERNAME="__token__"
export TWINE_PASSWORD="pypi-AgEIcHlwaS5vcmcCJDY2OTNkYTM1LTM3MjktNDMyMC1hZGRjLTM3ZDI0M2NkMGU4YQACKlszLCI3Y2VmMmY0NS0zNjA1LTQ4YmEtOTZjNC0wNzMxOTg2ZjQyNmUiXQAABiACh0GBVsHc_x-FeN3mYshx9ICZnZyzHn0Kiy67KSZONA"

python3 -m twine upload dist/*

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ SUCCESS! Version $NEW_VERSION published to PyPI!"
    echo "🔗 https://pypi.org/project/wizard-ai-pro/$NEW_VERSION/"
    
    # ============================================
    # 8. Optional test
    # ============================================
    read -p "🧪 Test installation? (y/n): " TEST_INSTALL
    if [ "$TEST_INSTALL" = "y" ]; then
        echo "📦 Testing installation..."
        pip uninstall wizard-ai-pro -y 2>/dev/null || true
        pip install wizard-ai-pro==$NEW_VERSION
        
        echo ""
        echo "🧪 Testing import..."
        python3 -c "from wizard import Wizard; print('✅ SDK imported successfully!')"
    fi
else
    echo "❌ Upload failed!"
    echo "   Try: python3 -m twine upload dist/* --verbose"
fi

echo ""
echo "✨ Release complete!"
echo "📁 Location: $(pwd)"