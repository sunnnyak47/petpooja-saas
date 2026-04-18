#!/bin/bash
echo "🚀 Building Petpooja ERP Desktop"

# Step 1: Build frontend
echo "📦 Building frontend..."
cd frontend && npm run build
cd ..

# Step 2: Copy dist to electron resources
echo "📂 Copying to Electron..."
rm -rf desktop/frontend-dist
cp -r frontend/dist desktop/frontend-dist

# Step 3: Build Electron
echo "⚡ Building Electron app..."
cd desktop

if [ "$1" == "win" ]; then
  npm run build:win
elif [ "$1" == "mac" ]; then
  npm run build:mac
else
  npm run build:all
fi

echo "✅ Build complete!"
echo "📁 Output in: desktop/dist/"
ls dist/
