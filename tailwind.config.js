/** @type {import('tailwindcss').Config} */
export default {
  content: {
    relative: true,
    files: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  },
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
