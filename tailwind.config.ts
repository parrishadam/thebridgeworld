import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ["var(--font-playfair)", "Georgia", "serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      colors: {
        // Magazine brand palette
        brand: {
          50:  "#fdf8f0",
          100: "#faefd9",
          200: "#f4dab0",
          300: "#ecc07e",
          400: "#e29f4a",
          500: "#d4822a",
          600: "#b8641f",
          700: "#954d1b",
          800: "#793d1c",
          900: "#633419",
          950: "#371809",
        },
        // Card suit colors
        suit: {
          spade:   "#1e293b",
          heart:   "#dc2626",
          diamond: "#dc2626",
          club:    "#1e293b",
        },
      },
      typography: {
        DEFAULT: {
          css: {
            fontFamily: "var(--font-inter)",
            h1: { fontFamily: "var(--font-playfair)" },
            h2: { fontFamily: "var(--font-playfair)" },
            h3: { fontFamily: "var(--font-playfair)" },
          },
        },
      },
    },
  },
  plugins: [],
};

export default config;
