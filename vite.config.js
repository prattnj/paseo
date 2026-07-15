import { defineConfig } from 'vite';

const allowedHosts = ['noahpratt.com', 'www.noahpratt.com', 'paseo.noahpratt.com'];

export default defineConfig({
  server: { allowedHosts },
  preview: { allowedHosts },
});
