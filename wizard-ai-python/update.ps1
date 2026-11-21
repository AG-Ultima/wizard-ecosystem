# ============================================
# Wizard.AI SDK - Windows Release Script
# Automatically navigates to SDK folder
# ============================================

param(
    [string]$NewVersion = ""
)

$ErrorActionPreference = "Stop"

# ============================================
# 0. Navigate to SDK directory
# ============================================
$SDKPath = "E:\Arnav\Development\wizard-ai-python"

if (Test-Path $SDKPath) {
    Write-Host "📁 Changing to SDK directory: $SDKPath" -ForegroundColor Yellow
    Set-Location $SDKPath
} else {
    Write-Host "❌ SDK directory not found: $SDKPath" -ForegroundColor Red
    Write-Host "   Please update the path in the script." -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host "🧙 Wizard.AI SDK Release Script (Windows)" -ForegroundColor Cyan
Write-Host "📁 Current directory: $(Get-Location)" -ForegroundColor Green
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "pyproject.toml")) {
    Write-Host "❌ No pyproject.toml found! Are you sure this is the SDK folder?" -ForegroundColor Red
    pause
    exit 1
}

# ============================================
# 1. Get version
# ============================================
if (-not $NewVersion) {
    $currentVersion = (Select-String -Path "pyproject.toml" -Pattern 'version = "(.*)"').Matches.Groups[1].Value
    Write-Host "📦 Current version: $currentVersion" -ForegroundColor Yellow
    $NewVersion = Read-Host "Enter new version (e.g., 0.1.5)"
}

if (-not $NewVersion) {
    Write-Host "❌ No version entered. Exiting." -ForegroundColor Red
    pause
    exit 1
}

Write-Host "🚀 Releasing version: $NewVersion" -ForegroundColor Green

# ============================================
# 2. Update version in files
# ============================================
Write-Host "📝 Updating version in files..." -ForegroundColor Cyan

# Update pyproject.toml
(Get-Content pyproject.toml) -replace 'version = ".*"', "version = `"$NewVersion`"" | Set-Content pyproject.toml
Write-Host "   ✅ Updated pyproject.toml" -ForegroundColor Green

# Update __init__.py
$initFile = "src\wizard\__init__.py"
if (Test-Path $initFile) {
    (Get-Content $initFile) -replace '__version__ = ".*"', "__version__ = `"$NewVersion`"" | Set-Content $initFile
    Write-Host "   ✅ Updated __init__.py" -ForegroundColor Green
}

# ============================================
# 3. Clean old builds
# ============================================
Write-Host "🧹 Cleaning old builds..." -ForegroundColor Cyan
Remove-Item -Path dist, build, src\wizard.egg-info -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "   ✅ Clean complete" -ForegroundColor Green

# ============================================
# 4. Build package
# ============================================
Write-Host "🔨 Building package..." -ForegroundColor Cyan
python -m build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    pause
    exit 1
}
Write-Host "   ✅ Build successful" -ForegroundColor Green

# ============================================
# 5. Show built files
# ============================================
Write-Host "📁 Built files:" -ForegroundColor Cyan
Get-ChildItem -Path dist | ForEach-Object {
    $sizeKB = [math]::Round($_.Length/1024, 2)
    Write-Host "   📦 $($_.Name) - $sizeKB KB"
}

# ============================================
# 6. Confirm upload
# ============================================
$confirm = Read-Host "`n🚀 Upload v$NewVersion to PyPI? (y/n)"
if ($confirm -ne 'y') {
    Write-Host "❌ Upload cancelled." -ForegroundColor Red
    pause
    exit 0
}

# ============================================
# 7. Upload to PyPI
# ============================================
Write-Host "📤 Uploading to PyPI..." -ForegroundColor Cyan

# Set PyPI token
$env:TWINE_USERNAME = "__token__"
$env:TWINE_PASSWORD = "pypi-AgEIcHlwaS5vcmcCJDY2OTNkYTM1LTM3MjktNDMyMC1hZGRjLTM3ZDI0M2NkMGU4YQACKlszLCI3Y2VmMmY0NS0zNjA1LTQ4YmEtOTZjNC0wNzMxOTg2ZjQyNmUiXQAABiACh0GBVsHc_x-FeN3mYshx9ICZnZyzHn0Kiy67KSZONA"

python -m twine upload dist/*

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ SUCCESS! Version $NewVersion published to PyPI!" -ForegroundColor Green
    Write-Host "🔗 https://pypi.org/project/wizard-ai-pro/$NewVersion/" -ForegroundColor Cyan
    
    # ============================================
    # 8. Optional test
    # ============================================
    $testInstall = Read-Host "`n🧪 Test installation? (y/n)"
    if ($testInstall -eq 'y') {
        Write-Host "📦 Testing installation..." -ForegroundColor Cyan
        pip uninstall wizard-ai-pro -y 2>$null
        pip install wizard-ai-pro==$NewVersion
        
        Write-Host "`n🧪 Testing import..." -ForegroundColor Cyan
        python -c "from wizard import Wizard; print('✅ SDK imported successfully!')"
    }
} else {
    Write-Host "❌ Upload failed!" -ForegroundColor Red
    Write-Host "   Try: python -m twine upload dist/* --verbose" -ForegroundColor Yellow
}

Write-Host "`n✨ Release complete!" -ForegroundColor Magenta
pause