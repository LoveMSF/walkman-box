/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: { colors: { ink: '#101112', panel: '#181a1b', acid: '#c3f36b' }, fontFamily: { display: ['Space Grotesk', 'sans-serif'], mono: ['DM Mono', 'monospace'] } } },
  plugins: [],
}
