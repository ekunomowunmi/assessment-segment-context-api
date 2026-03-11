#!/bin/bash

# Setup script for Segment-to-Context Service

set -e

echo "🚀 Setting up Segment-to-Context Service..."

# Check Node.js version
echo "📋 Checking Node.js version..."
node --version || { echo "❌ Node.js 18+ is required"; exit 1; }
npm --version || { echo "❌ npm is required"; exit 1; }

# Install backend dependencies
echo "📥 Installing backend dependencies..."
npm install

# Note: Frontend is a separate project
echo "ℹ️  Frontend is a separate project. See ../frontend/README.md for setup."

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "⚠️  Please update .env with your configuration"
fi

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update .env with your configuration"
echo "2. Start services: docker-compose up -d"
echo "3. Run migrations: npm run migrate"
echo "4. Start backend: npm run dev"
echo "5. Start worker (in another terminal): npm run worker"
echo ""
echo "To start the frontend (separate project):"
echo "  cd ../frontend && npm install && npm run dev"
