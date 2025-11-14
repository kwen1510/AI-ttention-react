/** @type {import('tailwindcss').Config} */
export default {
  content: ["./client/index.html", "./client/src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // Enhanced responsive breakpoints for better tablet support
      screens: {
        'xs': '475px',    // Large phones
        'sm': '640px',    // Small tablets / Large phones (landscape)
        'md': '768px',    // iPad portrait - ENHANCED for tablet optimization
        'lg': '1024px',   // iPad landscape / Small laptops
        'xl': '1280px',   // Desktop
        '2xl': '1536px',  // Large desktop
      },
      colors: {
        'ai-primary': {
          start: '#22d3ee',
          mid: '#60a5fa',
          end: '#0ea5e9',
        },
        'ai-accent': {
          start: '#7C3AED',
          end: '#6366F1',
        },
        'ai-danger': {
          start: '#f87171',
          end: '#ef4444',
        },
        'ai-text': '#0f172a',
        'ai-text-muted': '#475569',
      },
      borderRadius: {
        'ai-lg': '20px',
        'ai-md': '16px',
        'ai-sm': '12px',
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
      },
      backdropBlur: {
        'ai': '18px',
      },
      boxShadow: {
        'soft': '0 18px 40px rgba(15, 23, 42, 0.12)',
        'strong': '0 32px 60px rgba(15, 23, 42, 0.18)',
      },
      // Responsive spacing utilities
      spacing: {
        'safe-x': 'clamp(1rem, 4vw, 2rem)',
        'safe-y': 'clamp(1.5rem, 5vh, 3rem)',
      },
      // Max-width constraints to prevent bleeding
      maxWidth: {
        'container': '1400px',  // Ultra-wide constraint
        'content': '1200px',    // Main content width
        'narrow': '800px',      // Forms, articles
      },
      minHeight: {
        'touch': '44px',
      },
      minWidth: {
        'touch': '44px',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
}
