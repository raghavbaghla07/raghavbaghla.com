import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://raghavbaghla.com',
  output: 'server',
  adapter: vercel(),
});
