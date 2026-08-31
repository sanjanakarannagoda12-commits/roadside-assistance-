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
        primary: "#F97316",
        primaryLight: "#FDEAE0",
        textSecondary: "#6B7280",
      },
    },
  },
  plugins: [],
};
