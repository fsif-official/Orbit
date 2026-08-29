# 個人スプレッドシート連携 + Googleログイン — 実装仕様

このドキュメントは、Orbit（Next.js 16 App Router / 静的エクスポート / GitHub Pagesでホスト）に
「各メンバーが自分のGoogleアカウントで、自分個人のスプレッドシートにタスクデータを同期できる」
機能を追加するための仕様書です。別セッション・別LLMがこのファイルだけを読んで実装に着手できることを
目標に、現状のコードベースの構造・命名規則・制約を含めてまとめています。

## 1. 目的

- 各メンバーが、自分の担当タスク（や進捗）を、Orbitとは別に自分の個人Googleスプレッドシートにも
  書き出せるようにする。
- 団体の共有スプレッドシート（Members/Projects/Tasks/Settings、既存のGAS Web App経由）には、
  各メンバー個人のスプレッドシートのリンクや内容を一切保存しない。他の管理者から個人のファイルの
  存在・URLが見えてしまうのを避けるため（ユーザーからの明示的な要望）。

## 2. 現状のアーキテクチャ（重要な前提）

実装前に必ず把握しておくべき現状：

- **サイトの「Googleでログイン」ボタンは完全にモックです。実際のGoogle OAuthは一切行われていません。**
  `components/orbit/login-screen.tsx` の `handleGoogle()` は700msの `setTimeout` の後、
  ローカルのメンバー一覧から選ぶ「デモユーザーを選択」モーダルを開くだけです
  （`login(u.id)` は `lib/orbit/store.tsx` の `login` アクションで、ローカルのメンバーIDを
  現在ユーザーとして保存するだけの処理）。実在のGoogleアカウントとは何も紐付いていません。
- 既存の「本物のGoogle API連携」は、すべて **団体のGoogleアカウント** で動く
  Google Apps Script（GAS）経由です（`gas/Code.gs`、"Execute as: Me" でデプロイ）。
  これはメール送信（MailApp）、Googleドライブへのアバター画像アップロード
  （`DRIVE_FOLDER_ID` 配下、`uploadAvatar` アクション）、団体の共有スプレッドシートの読み書きに
  使われていますが、**すべて団体アカウントの権限で動いており、個々のメンバー自身のGoogleアカウントの
  データ（個人のDriveやSheet）には一切アクセスできません**。これは仕組み上の制約であり、
  GASのデプロイ方法を変えない限り変わりません。
- つまり「個人スプレッドシート連携」は、今ある仕組みの延長では作れず、
  **メンバー自身のブラウザで完結する、新しいクライアントサイドOAuth機構**を追加で作る必要があります。
- アプリはNext.jsの `output: 'export'` による完全な静的サイトで、GitHub Pagesにホストされています
  （独自のサーバーはありません）。環境変数は `NEXT_PUBLIC_` プレフィックスのものだけがビルド時に
  インライン化されます（`lib/orbit/remote.ts` 冒頭を参照）。この制約上、新機能も
  **サーバーを持たない・ブラウザ完結のOAuth**でなければなりません。

## 3. 提案する仕組み

### 3.1 「サイトログイン」と「個人シート連携」は別物として扱う

この2つを1つのOAuthに統合しない。理由：
- サイトログイン（誰がOrbitを使っているか）に、Google Sheetsへの書き込み権限を毎回要求するのは
  過剰な権限要求になる（この機能を使わないメンバーにも同意画面が出てしまう）。
- サイトログインは現状モックのままでも本機能は成立する。今回のスコープでは
  **サイトログインには手を付けず**、「個人シート連携」を独立した追加機能として、
  Account設定（後述）から任意にオンにできる形にする。
- 将来的にサイトログイン自体を本物のGoogle Sign-Inに置き換える場合も、
  この節で作るOAuthクライアントをそのまま流用できる設計にしておく（同じGoogle Cloud
  プロジェクト・同じOAuthクライアントIDを使い、スコープだけ絞る/広げるイメージ）。

### 3.2 Google Cloud側の準備（実装者が最初にやること）

1. Google Cloud Consoleで新規（または既存流用の）プロジェクトを用意し、
   「OAuth 同意画面」を設定する（外部/Internal は団体のGoogle Workspace有無で選択。
   個人Gmailメンバーが混在するなら「外部」＋テストユーザー登録、または公開）。
2. 「認証情報」→「OAuth クライアント ID」→ アプリケーションの種類は **ウェブ アプリケーション** で作成。
   - 承認済みJavaScript生成元に、GitHub PagesのオリジンURLを登録
     （例：`https://<org>.github.io`）。カスタムドメインを使っている場合はそちらも登録。
   - リダイレクトURIは、後述のGoogle Identity Services のトークンクライアント方式
     （Implicit/Token flow, ポップアップ）を使う場合は不要（このドキュメントではこちらを推奨）。
3. 発行された **クライアントID**（シークレットは使わない。クライアントサイドの公開情報）を、
   新しい環境変数 `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` として、`deploy.yml`（GitHub Actions）と
   ローカルの `.env.local` に設定する。既存の `NEXT_PUBLIC_DRIVE_FOLDER_ID` などと同じ扱い方
   （`lib/orbit/remote.ts` 冒頭のパターンを踏襲）。
4. 有効化するAPI：「Google Sheets API」（と、新規シート作成もサポートするなら「Google Drive API」）。

### 3.3 クライアントサイドのOAuthフロー（実装の中心）

- ライブラリ不要。Googleが配布する `https://accounts.google.com/gsi/client` を
  `<script>` タグで読み込むだけ（`next/script` の `strategy="afterInteractive"` などで）。
- 使うのは **Google Identity Services の Token Client**（`google.accounts.oauth2.initTokenClient`）。
  これは「アクセストークンだけを取得する」軽量なポップアップ同意フローで、
  サーバー側の認可コード交換が不要 — 静的サイトにそのまま組み込める。
- 必要スコープ： `https://www.googleapis.com/auth/spreadsheets`
  （ユーザーが既に持っている/共有されているシートへの読み書き）。
  新規シートを「Orbit側から作成」もさせたい場合は追加で
  `https://www.googleapis.com/auth/drive.file`（Orbitが作成/開いたファイルにのみアクセス、
  ユーザーのDrive全体は見えない、最小権限で望ましい）。
- 取得したアクセストークンは **メモリ内 or `sessionStorage`** に保持するだけで十分
  （タブを閉じたら消えてよい）。トークンの有効期限は通常1時間。GISのToken Clientは
  リフレッシュトークンを返さないため、期限切れ後は再度同意ポップアップ（2回目以降は
  `prompt: ''` を指定すればユーザー操作なしで再取得できることが多い＝サイレント更新）。
- Sheets APIの呼び出しはすべてブラウザから直接 `fetch()` で行う（サーバー経由不要）。
  例：`https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{range}:append?valueInputOption=USER_ENTERED`
  に `Authorization: Bearer <access_token>` ヘッダーを付けてPOST。

### 3.4 「どのシートに繋ぐか」の指定とデータの持ち方

- **新規ファイル** `lib/orbit/google-sheet-sync.ts`（案）に、OAuthトークン取得・Sheets API呼び出しの
  ロジックをまとめる。既存の `lib/orbit/export-excel.ts`（クライアント側でExcel生成する既存機能）と
  同じ「UIから呼ばれるユーティリティ関数群」という位置づけ。
- UIは `components/orbit/people/person-detail.tsx` の「アカウント設定」ブロック
  （361行目付近、`isSelf` の中）に「個人スプレッドシート連携」セクションを追加するのが自然
  （通知メール設定のすぐ下）。内容案：
  1. 「連携する」ボタン → OAuth同意ポップアップ → 成功したらアクセストークンをメモリ保持
  2. スプレッドシートIDの入力欄（またはURLを貼り付けてIDを正規表現で抽出）
     - より丁寧にやるなら Google Picker API でファイル選択UIを出す（追加のAPI有効化・スクリプト読込が必要、
       v1ではスコープ外でよい。まずはURL/ID貼り付けで十分）
  3. 「このシートに書き込めるか確認」ボタン → 実際に軽いAPI呼び出し（例：スプレッドシートのメタ情報
     取得 `GET /v4/spreadsheets/{id}`）で疎通確認してからテキストで結果表示
  4. 「今すぐ同期」ボタン（詳細は3.5）
- **保存先はlocalStorageのみ。** 団体の共有スプレッドシート（Settings/Membersシート）には書き込まない。
  既存のこのアプリの命名規則に合わせ、ユーザーごとにスコープしたキーにする：
  ```
  orbit-personal-sheet-id-${userId}
  ```
  （参考：`components/orbit/input/input-screen.tsx` の `orbit-input-draft-${userId}`、
  `components/orbit/output/output-screen.tsx` の `orbit-target-order-${userId}` と同じパターン）
  → これにより「どのシートと連携しているか」はそのメンバー自身のブラウザにしか残らず、
  他の管理者や他のブラウザ・端末からは見えない（トレードオフ：別ブラウザ/端末では再設定が必要）。
- アクセストークン自体はlocalStorageに保存しない（漏洩リスク。sessionStorageかメモリのみ）。

### 3.5 同期のトリガーとデータ内容

- v1は **手動同期のみ**（「今すぐ同期」ボタン）を推奨。タスク完了時などに自動で書き込む方式は、
  トークン切れ・ネットワークエラー時にユーザーが気づけないまま失敗し続けるリスクがあるため、
  まず手動運用で様子を見て、安定したら自動化を検討する。
- 同期するデータは、既存の `lib/orbit/export-excel.ts` の `exportTasksToExcel` が使っている
  列構成（タスク名・プロジェクト・部門・担当・ステータス・優先度・難易度・カテゴリ・必要スキル・
  開始日・期限・完了日・進捗・説明）をベースに、「そのメンバーが担当しているタスクのみ」
  （`useOrbit()` の `tasks.filter(t => t.assigneeIds.includes(currentUser.id))` 相当）に絞るのが
  妥当な初期案。書き込みは `values:append`（毎回末尾に追記）または
  `values:update`（決まった範囲を洗い替え）のどちらにするかは要件次第 — 「ログを溜めたい」なら
  append、「常に最新の担当タスク一覧を表示したい」ならupdateで全洗い替えが良い。

## 4. 実装ステップ（チェックリスト）

1. Google Cloud ConsoleでOAuthクライアントIDを発行し、`NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` として
   `deploy.yml` / `.env.local` に設定。
2. `lib/orbit/google-sheet-sync.ts` を新規作成：
   - GISスクリプトの読み込み待ち処理
   - `requestAccessToken(): Promise<string>`（トークンクライアント初期化＋同意ポップアップ）
   - `verifySheetAccess(spreadsheetId, accessToken): Promise<{ ok: boolean; title?: string; error?: string }>`
   - `syncTasksToSheet(spreadsheetId, accessToken, rows): Promise<void>`
3. `lib/orbit/store.tsx` に、localStorage読み書き用の薄いヘルパー（他の `orbit-*-${userId}` 系と
   同じパターン）を追加。既存の `loadOrgNotificationEmails` などの実装を参考にする。
   これは団体設定ではなく個人ローカル設定なので、Settingsシート同期（`isSettingsConfigured`）とは
   別系統にする。
4. `components/orbit/people/person-detail.tsx` の「アカウント設定」ブロックにUIを追加。
5. `pnpm add xlsx` は既に入っているので流用不要。新規追加パッケージは無し（GISはscriptタグ経由、
   Sheets APIはfetch直叩きのため、npmパッケージの追加は不要）。
6. `next/script` でGISのスクリプトタグをレイアウト（`app/layout.tsx`）か、
   利用箇所（person-detail.tsx）にだけ動的に挿入するかは実装者の判断。使う画面でだけ読み込む方が
   静的サイト全体の初期ロードに影響しないので望ましい。
7. README（`gas/README.md` もしくは新規 `docs/`）に、この機能を使うための管理者向けセットアップ手順
   （OAuthクライアントID発行手順、`.env` への追記、GitHub Secretsへの登録）を追記する。

## 5. 制約・注意点

- GitHub Pagesの静的ホスティングでは秘密情報を隠せない。クライアントIDは元々公開情報なので問題ないが、
  クライアントシークレットは絶対に使わない（Token Client方式ならそもそも発行不要）。
- OAuth同意画面が「Google未確認のアプリ」として警告表示される可能性がある
  （テストユーザー登録内であれば警告は出るが機能はする）。団体外に公開する場合は
  Google側の審査（確認）が必要になる場合がある点は運用上の注意として明記しておく。
- アクセストークンは最短1時間で失効する。ユーザーが「連携する」ボタンを押してから
  同期操作をするまでの間隔が空くと再同意が必要になりうる — UI上、同期ボタン押下時に
  トークン切れなら自動的に裏で `prompt: ''` の再取得を試み、それでも失敗したら
  再度明示的なポップアップを促す、というフォールバックを入れると体験が良い。
- Sheets APIには利用上限（quota）がある。個人利用規模なら通常問題にならないが、
  大量メンバーが同時に手動同期を連打するような使い方は想定していない。
- 本機能は「団体の共有データベース（GAS/CSV経由の仕組み）」には一切触れない、完全に独立した
  追加レイヤーとして設計すること。既存の `isRemoteConfigured` などのフラグとは無関係。

## 6. スコープ外（このドキュメントでは扱わない）

- サイトの「Googleでログイン」を本物のGoogle Sign-Inに置き換える作業そのもの
  （3.1の通り、意図的に別スコープとしている）。
- Google Picker APIによるファイル選択UI（v1はID/URL貼り付けで十分という判断）。
- 自動同期（タスク完了時など）のトリガー設計（v1は手動同期のみ）。
