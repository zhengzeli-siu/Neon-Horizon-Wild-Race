
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Sets the base path for assets. './' ensures assets are loaded relatively,
  // making the app work in subdirectories (like GitHub Pages).
  base: './', 
})
