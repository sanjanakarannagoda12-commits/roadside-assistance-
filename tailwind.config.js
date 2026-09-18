// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./screens/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
  dark: "#1C1C1E",
  darkElevated: "#2A2A2D",
  primary: "#DE6627",
  secondary: "#FDE1C2",
  primaryLight: "#FDE1C2",
  surface: "#F7F7F8",
  textSecondary: "#6B7280",
},
    },
  },
  plugins: [],
};
