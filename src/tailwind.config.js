/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./digipath-radar/digipath-radar/src/**/*.{js,ts,jsx,tsx}", // Scans nested paths if present
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}