#!/bin/bash

# Distribution Script for aiexecode
# Build and publish to npm registry

echo "📦 Starting distribution process..."

# Check if we're in the project root
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root directory."
    exit 1
fi

# Build payload viewer
echo "🏗️  Building payload viewer..."
cd payload_viewer
npm i
npm run build
cd ..

# Publish to npm
echo "🚀 Publishing to npm..."
npm publish

echo "✅ Distribution complete!"
