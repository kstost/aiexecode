#!/bin/bash

# Production Payload Viewer Startup Script
# Run this from the payload_viewer directory

set -e

echo "🚀 Starting Payload Viewer (Production Mode)..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the payload_viewer directory."
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build Next.js application
echo "🏗️  Building Next.js application..."
npm run build

echo "🌐 Starting integrated server (Frontend + Backend)..."
echo "   Available at: http://localhost:3300"
echo ""

# Start the integrated server
node web_server.js