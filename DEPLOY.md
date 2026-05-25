# GitHub Pages デプロイガイド

## 現在の安全な更新手順

このリポジトリは `main` に push すると GitHub Pages へ自動デプロイされる。データ消失事故に備え、push 前に本番Firestoreの `organizations/default` をローカルJSONとしてバックアップしてから、テスト・lint・ビルドを通す。

初回だけ、ローカルGitフックを有効化する。

```bash
npm run install:hooks
```

以後、`main` へ push する直前に次が自動実行される。

```bash
npm run predeploy:check
```

このコマンドは次を順に実行する。

1. `npm run backup:firestore`
2. `npm run test`
3. `npm run lint`
4. `npm run build`

バックアップJSONは `backups/firestore/` に保存される。このフォルダは `.gitignore` 済みなので、GitHubには載せない。アプリ利用者が触る場所ではなく、開発者の復旧用保管場所として扱う。

Firestore Rules だけを安全にデプロイしたい場合は次を使う。

```bash
npm run deploy:rules:safe
```

アプリ内の「当月を白紙に戻す」は、JSONを画面に出さず、削除前に Firestore の `organizations/default/backups` へ対象月バックアップを作る。バックアップに失敗した場合は削除を中止する。

---

## 前提条件
- GitHubアカウントを持っていること
- Git がインストールされていること

---

## 手順

### 1. GitHubでリポジトリを作成

1. [GitHub](https://github.com) にログイン
2. 右上の **+** → **New repository** をクリック
3. 設定:
   - **Repository name**: `shift-scheduler`（任意）
   - **Public** を選択（GitHub Pages無料利用のため）
4. **Create repository** をクリック

---

### 2. ローカルでGit初期化とプッシュ

ターミナルで以下を実行:

```bash
cd /Users/kentaro/Library/Mobile\ Documents/com~apple~CloudDocs/Antigravity/AI_Shift/shift-scheduler

# Git初期化
git init

# 全ファイルをステージング
git add .

# 初回コミット
git commit -m "Initial commit: Shift Scheduler App"

# メインブランチに変更
git branch -M main

# リモートリポジトリを追加（URLは作成したリポジトリのもの）
git remote add origin https://github.com/YOUR_USERNAME/shift-scheduler.git

# プッシュ
git push -u origin main
```

---

### 3. GitHub Pagesを有効化

1. GitHubでリポジトリを開く
2. **Settings** タブをクリック
3. 左メニューで **Pages** をクリック
4. **Source** で **GitHub Actions** を選択

---

### 4. 自動デプロイ確認

プッシュすると、自動的にビルド＆デプロイが実行されます。

1. **Actions** タブで進捗を確認
2. 完了後、**Settings** → **Pages** でURLを確認
3. URL例: `https://YOUR_USERNAME.github.io/shift-scheduler/`

---

## 更新方法

コードを変更したら:

```bash
git add .
git commit -m "更新内容の説明"
git push
```

自動的に再デプロイされます！

---

## 共有方法

相手に以下のURLを送るだけ:

```
https://YOUR_USERNAME.github.io/shift-scheduler/
```

ブラウザで開くだけで使えます！
