#!/bin/bash

echo "🎤 Simple Voice App Setup"
echo "========================"
echo ""

if [ -z "$DEEPGRAM_API_KEY" ]; then
    echo "⚠️  Deepgram API key not found in environment"
    echo ""
    echo "📋 To get your API key:"
    echo "   1. Go to https://deepgram.com"
    echo "   2. Sign up for free account"
    echo "   3. Get your API key from dashboard"
    echo ""
    echo "🔧 To set your API key:"
    echo "   export DEEPGRAM_API_KEY=\"your-api-key-here\""
    echo ""
    echo "💡 Or add to your ~/.zshrc or ~/.bashrc:"
    echo "   echo 'export DEEPGRAM_API_KEY=\"your-api-key-here\"' >> ~/.zshrc"
    echo ""
    echo "🧪 To test without Deepgram:"
    echo "   node test-simple.js"
    echo ""
else
    echo "✅ Deepgram API key found"
    echo "🚀 Starting app..."
    yarn start
fi 