import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-outfit)", "system-ui", "sans-serif"],
        display: ["var(--font-outfit)", "system-ui", "sans-serif"],
      },
      colors: {
        canvas: "#f4f1fb",
        paper: "#ffffff",
        navy: "#1c1636",
        ink: "#1c1636",
        gold: {
          50: "#f4efff",
          100: "#e4d9ff",
          400: "#8b6cf6",
          500: "#6d4aff",
          600: "#5a38e6",
          700: "#4c2ed4",
          800: "#3b22a8",
        },
      },
      boxShadow: {
        card: "0 16px 40px -28px rgba(28, 22, 54, 0.45)",
        soft: "0 10px 24px -18px rgba(28, 22, 54, 0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
