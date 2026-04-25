#!/bin/bash

echo "🛠️  Fixing Tailwind CSS configuration for v4..."

# 1. Install dependencies
# Tailwind v4 requires @tailwindcss/postcss as a separate package for PostCSS integration
echo "📦 Installing @tailwindcss/postcss, tailwindcss, and autoprefixer..."
npm install -D tailwindcss @tailwindcss/postcss autoprefixer

# 2. Write postcss.config.js
# Updated to use @tailwindcss/postcss instead of tailwindcss
echo "⚙️  Writing postcss.config.js..."
cat <<EOF > postcss.config.js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
    'autoprefixer': {},
  },
}
EOF

# 3. Write tailwind.config.js
# Tailwind v4 often doesn't need this file for basic setups, but keeping it for content detection safety
echo "⚙️  Writing tailwind.config.js..."
cat <<EOF > tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
EOF

# 4. Overwrite src/index.css
# Tailwind v4 uses the modern @import syntax
echo "🎨 Overwriting src/index.css with v4 import..."
cat <<EOF > src/index.css
@import "tailwindcss";
EOF

# 5. Delete conflicting Vite CSS
echo "🧹 Removing Vite's default App.css..."
rm -f src/App.css

# 6. Overwrite src/main.jsx to ensure no App.css import
echo "📝 Cleaning src/main.jsx..."
cat <<EOF > src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
EOF

# 7. Remove any accidental App.css import from App.jsx (just in case)
echo "🔍 Checking src/App.jsx for rogue CSS imports..."
sed -i.bak '/import .*App\.css.*/d' src/App.jsx 2>/dev/null || true
rm -f src/App.jsx.bak

# 8. Commit and Deploy
echo "🚀 Committing fixes and deploying to GitHub Pages..."
git add .
git commit -m "Fix Tailwind v4 PostCSS configuration"
git push origin main

# Run the deploy script you added to package.json
npm run deploy

echo ""
echo "==================================================================="
echo "✅ Fix complete and deployment triggered!"
echo "==================================================================="
echo "CRITICAL LAST STEP:"
echo "Browsers aggressively cache CSS. When you open your live website,"
echo "you MUST press Ctrl + Shift + R (Windows/Linux) or Cmd + Shift + R (Mac)"
echo "to perform a Hard Refresh and force the new styles to load."
