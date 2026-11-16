# SandWhich?

パンとパンがくっついている所を縦にスワイプして、サンドイッチを切り分けるバカゲー。

## ローカルで遊ぶ

```sh
npm install
npm run dev
```

Supabaseを設定していない場合、ランキングはブラウザ内（その端末だけ）に保存されます。

## Supabaseの設定（オンラインランキング）

1. Supabaseでプロジェクトを作る
2. SQL Editorで `supabase/schema.sql` を実行する
3. Project Settings → API から URL と anon（publishable）key をコピーする
4. `.env.example` を `.env.local` にコピーして値を入れる

## GitHub Pagesに公開する

1. GitHubにリポジトリを作り、`main` ブランチにpushする
2. リポジトリの Settings → Pages → Source を **GitHub Actions** にする
3. Settings → Secrets and variables → Actions に以下を登録する
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. pushすると `.github/workflows/deploy.yml` が自動でビルドして公開する

## ファイル構成

- `src/game.ts` … ゲーム本体（入力・判定・スコア・描画）
- `src/sandwich.ts` … サンドイッチ列の生成と具材の描画
- `src/audio.ts` … 効果音（Web Audioで合成）
- `src/ranking.ts` … ランキングの取得・投稿、名前チェック
- `src/main.ts` … 画面切り替え
- `supabase/schema.sql` … ランキング用テーブルと投稿関数
