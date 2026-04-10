/** @type {import('tailwindcss').Config} */
export default {
  content: ["./client/index.html", "./client/src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      screens: {
        xs: '475px',
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1536px',
      },
      colors: {
        canvas: '#f4f5f7',
        surface: '#ffffff',
        muted: '#edf1f4',
        line: '#d7dde5',
        ink: '#16181d',
        subtext: '#626b77',
        primary: '#1e7a6d',
        accent: '#8e5a78',
        success: '#2f7d57',
        warning: '#b98524',
        danger: '#b94c5d',
      },
      borderRadius: {
        ai: '8px',
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(22, 24, 29, 0.06)',
        medium: '0 10px 30px rgba(22, 24, 29, 0.06)',
        strong: '0 24px 50px rgba(22, 24, 29, 0.08)',
      },
      spacing: {
        'safe-x': 'clamp(1rem, 4vw, 2rem)',
        'safe-y': 'clamp(1.5rem, 5vh, 3rem)',
      },
      maxWidth: {
        container: '1400px',
        content: '1200px',
        narrow: '800px',
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
