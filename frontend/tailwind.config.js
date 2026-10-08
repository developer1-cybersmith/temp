/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          50: "#FEFCF8",
          100: "#FAF6EE",
          200: "#F3EDE0",
        },
        ink: {
          50: "#8C8477",
          100: "#6B6459",
          200: "#4A453C",
          300: "#2D2A26",
          400: "#1A1816",
        },
        pastel: {
          lavender: "#E8E4F7",
          sage: "#DDE8DC",
          peach: "#F7E4DB",
          sky: "#DBE8F0",
          honey: "#F0EAD2",
          rose: "#F2DDE4",
          mint: "#D4EDE6",
          lilac: "#DDD6F3",
        },
        soft: {
          lavender: "#7B6FA0",
          sage: "#6B8A68",
          peach: "#B87A60",
          sky: "#5E85A0",
          honey: "#A09060",
          rose: "#A06878",
          mint: "#5A9485",
        },
        whatsapp: "#25d366",
        error: "#D94F4F",
        success: "#4A9D6E",
        warning: "#C8943E",
        /* Legacy aliases for existing pages — remove after Phase 14 */
        background: "#FEFCF8",
        foreground: "#2D2A26",
        card: "#FAF6EE",
        "card-foreground": "#2D2A26",
        primary: {
          DEFAULT: "#7B6FA0",
          foreground: "#FEFCF8",
        },
        secondary: {
          DEFAULT: "#E8E4F7",
          foreground: "#4A453C",
        },
        accent: {
          DEFAULT: "#DDD6F3",
          foreground: "#4A453C",
        },
        muted: {
          DEFAULT: "#F3EDE0",
          foreground: "#8C8477",
        },
        border: "#F3EDE0",
      },
      fontFamily: {
        sans: ['"Instrument Sans"', "sans-serif"],
        display: ["Satoshi", "sans-serif"],
      },
      borderRadius: {
        card: "20px",
        input: "16px",
        pill: "100px",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
}
