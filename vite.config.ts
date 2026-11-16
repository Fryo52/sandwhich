import { defineConfig } from 'vite';

// GitHub Pages（https://<user>.github.io/<repo>/）でも動くように相対パスでビルドする
export default defineConfig({
  base: './',
});
