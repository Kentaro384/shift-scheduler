# GitHub Pages デプロイガイド

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
