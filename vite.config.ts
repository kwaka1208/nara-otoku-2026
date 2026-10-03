import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { type Plugin, defineConfig } from 'vite';

// 開発サーバーで /<slug>/data.geojson と /<slug>/config.json を dist/ から配信する。
// 先に npm run build:data -- <slug> を実行しておくこと。
const serveMapData = (): Plugin => ({
  name: 'serve-map-data',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const m = req.url?.match(/^\/([\w-]+)\/(data\.geojson|config\.json)$/);
      const file = m && path.resolve('dist', m[1], m[2]);
      if (!file || !existsSync(file)) return next();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      createReadStream(file).pipe(res);
    });
  },
});

export default defineConfig({
  // サイト内のどの階層に置いても動くように、相対パスで出力する
  base: './',
  publicDir: false,
  plugins: [serveMapData()],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    // 地図ライブラリ（MapLibre）だけで 500kB を超えるので、警告の基準を上げる
    chunkSizeWarningLimit: 1200,
  },
  // MapLibre のワーカーはモジュール形式
  worker: { format: 'es' },
});
