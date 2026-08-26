# スプレッドシート連携セットアップ

Orbit は Members / Projects / Tasks の3シートを「データベース」として使います。
読み取りはシートのCSV公開URL、書き込みはこのフォルダの `Code.gs` を貼り付けた
Apps Script Web App 経由で行います（アルファ版設計ドキュメント §2参照）。

## 1. シートの列構成

`database.xlsx`（リポジトリのサンプル）と同じ列名・順序にしてください。列名は
1行目のヘッダーで判定するので、位置がずれても動きますが、列名は完全一致が必要です。

### Members
| 列 | 内容 |
|---|---|
| id | メンバーID |
| name | 氏名 |
| role | 代表 / 班長 / 一般 |
| project_ids | 班長が担当するプロジェクトID（複数可、カンマ区切り） |
| will_tags | 本人入力の得意分野・希望タスク（カンマ区切り） |
| judgment_tags | 管理者入力の評価タグ（カンマ区切り） |

### Projects
| 列 | 内容 |
|---|---|
| id | プロジェクトID |
| name | プロジェクト名 |
| description | 概要 |

### Tasks
設計ドキュメント §4 の基本列に加え、UIが使う追加列（`department` 以降）があります。

| 列 | 内容 |
|---|---|
| id | タスクID |
| project_id | 所属プロジェクトID |
| title | タスク名 |
| description | 詳細 |
| status | 未着手 / 進行中 / サポート必要 / 確認待ち / 修正中 / 完了 |
| assign_type | open_bid / manager_assign / request / personal |
| assignee_id | 担当者ID（空欄可） |
| creator_id | 作成者ID |
| accepted_at | request方式の承諾日時（未使用） |
| deliverable_url | 成果物リンク（未使用） |
| feedback_comment | 完了時FB（未使用） |
| created_at | 作成日 |
| due_date | 期限（YYYY-MM-DD） |
| visibility | 全員 / 班長以上 |
| department | 部門タグ |
| category | カテゴリ（タレントマッチングにも使用） |
| skills | 必要スキル（カンマ区切り） |
| difficulty | 新人歓迎 / 少し経験必要 / 経験者向け |
| priority | 高 / 中 / 低 |
| completed_date | 完了日 |
| last_activity | 最終更新日（放置検知に使用） |
| progress_note | 直近の進捗メモ |
| original_input_id | 生成元の自然文入力ID |

> `accepted_at` / `deliverable_url` / `feedback_comment` は現状のUIからは未使用です（次フェーズ）。列として残しておいて構いません。

## 2. Apps Script のデプロイ

1. スプレッドシートを開き、拡張機能 → Apps Script
2. デフォルトの `Code.gs` の中身をこのフォルダの `Code.gs` の内容で置き換える
3. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
   - 実行するユーザー: **自分**
   - アクセスできるユーザー: **全員**
4. デプロイ後に表示される `/exec` で終わるURLをコピー

## 3. シートのCSV公開

各シート（Members / Projects / Tasks）ごとに:

1. ファイル → 共有 → ウェブに公開
2. 公開する範囲でそのシート名を選択、形式は「カンマ区切りの値(.csv)」
3. 発行して表示されるURLをコピー

## 4. GitHub Secrets

リポジトリの Settings → Secrets and variables → Actions に以下を設定します（すでに設定済み）。

| Secret名 | 値 |
|---|---|
| `MEMBERS_CSV` | Membersシートの公開CSV URL |
| `PROJECTS_CSV` | Projectsシートの公開CSV URL |
| `TASKS_CSV` | Tasksシートの公開CSV URL |
| `CSV_GAS` | 手順2でコピーしたApps Web AppのURL |

`.github/workflows/deploy.yml` がビルド時にこれらを `NEXT_PUBLIC_*` 環境変数として
埋め込みます。**注意**: これは静的サイトなので、埋め込んだ後はビルド成果物
（＝公開サイトのJavaScript）を見れば誰でもこれらのURLを読み取れます。設計ドキュメント
§3の通り、なりすまし防止をしない内輪利用・デモ用途を前提とした構成です。機密情報を
含むデータはこのスプレッドシートに置かないでください。

## 5. 動作確認

secrets未設定のままだと従来通りローカルのモックデータで動きます。4つの secrets が
揃うと、次回のデプロイ以降は自動でスプレッドシートからの読み込み・書き込みに切り替わります。

## 既知の制約

- 班長ロールは現状 UI 上では代表と同じ「管理者」として扱われます。設計ドキュメント §3
  が定める「自分の project_ids の範囲に限定」というスコープ制限はまだ実装していません。
- ステータス「サポート必要」はこのUIの5列カンバン（未着手/進行中/確認待ち/修正中/完了）
  には無いため、読み込み時は「進行中」として表示されます。
- 「ウェブに公開」のCSVはGoogle側のキャッシュにより反映まで数分かかることがあります。
  書き込みはその場でシートに反映されますが、読み込み側（他の人の画面）への反映には
  ラグがあります。
