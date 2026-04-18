# Petpooja ERP Desktop

Electron wrapper for the Petpooja ERP React app.

## Development
```bash
npm install
npm run dev
```

## Build
```bash
# Build React frontend first
cd ../frontend && npm run build
cd ../desktop

# Test unpacked build
npm run pack

# macOS DMG installer
npm run build:mac

# Windows NSIS installer
npm run build:win
```

## Regenerate Icons
```bash
node scripts/generate-icons.js
```
