# 個人スプレッドシート連携 + Googleログイン — 実装仕様

このドキュメントは、Orbit（Next.js 16 App Router / 静的エクスポート / GitHub Pagesでホスト）に
「各メンバーが自分のGoogleアカウントで、自分個人のスプレッドシートにタスクデータを同期できる」
機能と、その土台として必要になる「**実際のGoogleアカウントでのログイン**」（現状は完全にモック）を
追加するための仕様書です。別セッション・別LLMがこのファイルだけを読んで実装に着手できることを
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

### 3.1 「サイトログイン」と「個人シート連携」は同じ仕組み・別のスコープ要求として扱う

Google Cloud側のプロジェクト・OAuthクライアントID・読み込むGISスクリプトは **1つを共用** する
（3.2の手順は1回だけ行えばよい）。ただし **同意を求めるスコープと、要求するタイミングは分ける**：

- **サイトログイン**：ログイン時に毎回、最小スコープ（`openid email profile` 相当。
  Sheetsへの書き込み権限は含まない）だけを要求する。詳細は3.6。
- **個人シート連携**：メンバーが「アカウント設定」からこの機能を明示的にオンにした時だけ、
  追加で `spreadsheets`（必要なら`drive.file`）スコープを要求する（3.3〜3.5）。

分ける理由：この機能を使わないメンバーにまでSheets書き込み権限の同意画面を見せるのは
過剰な権限要求になるため。ログインとシート連携で同意ダイアログが2段階になる
（ログイン時は素のGoogle認証のみ、シート連携オン時に追加でSheetsアクセスを求める）UXになるが、
これは意図的な設計。

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

### 3.6 実際のGoogleログインの実装

現状の `components/orbit/login-screen.tsx` の「Googleでログイン」→「デモユーザーを選択」を、
実際のGoogleアカウントでのログインに置き換える。

**方式**：3.3と同じ Google Identity Services の **Token Client** を、スコープだけ変えて再利用する
（`openid email profile` — Sheetsへの権限は要求しない）。Googleが提供する「Sign In With Google」の
公式ボタン／One Tap（IDトークン方式）は、Googleの見た目・挙動の制約が強く、既存の
`GoogleGlyph()` を使ったカスタムデザインのボタンとは相性が悪いため、**このプロジェクトでは
Token Client方式（アクセストークンを取得し、userinfoエンドポイントに投げてメールアドレスを得る）を
推奨**する。理由：
- 見た目を今のボタンのまま維持できる（`onClick` から `initTokenClient().requestAccessToken()` を
  呼ぶだけで、Googleの埋め込みボタンを表示する必要がない）。
- 3.3で作るOAuth基盤（GISスクリプト読み込み、トークンクライアント初期化）をそのまま流用でき、
  実装が二重にならない。

**フロー**：

1. `handleGoogle()`（`login-screen.tsx`）を、`setTimeout` のモックから以下に置き換える：
   ```
   const client = google.accounts.oauth2.initTokenClient({
     client_id: NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID,
     scope: 'openid email profile',
     callback: async (resp) => {
       const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
         headers: { Authorization: `Bearer ${resp.access_token}` },
       }).then((r) => r.json())
       // info.email がGoogleアカウントのメールアドレス
       handleLoginResult(info.email)
     },
   })
   client.requestAccessToken()
   ```
2. `handleLoginResult(email)` で、`members` 配列を `member.email`（既存フィールド、
   カンマ区切りで複数登録可 — `lib/orbit/types.ts` の `Member.email` 参照）と
   大文字小文字を無視して照合する。ヒットしたら既存の `login(member.id)`
   （`lib/orbit/store.tsx`）をそのまま呼ぶ — ログイン後のセッション保持・永続化の仕組みは
   一切変更不要（`currentUserId` は既にlocalStorageに保存される作りになっている）。
3. マッチしなかった場合の扱い（要決定・実装者への申し送り事項）：
   - 単純な案：「このGoogleアカウントは登録されていません。管理者にメールアドレスの登録を
     依頼してください」というエラーメッセージを表示するだけ。Admin → Membersで
     管理者が事前に各メンバーのメールアドレスを登録しておく運用が前提になる。
   - 移行期の保険として、既存の「デモユーザーを選択」モーダルを完全には削除せず、
     「（開発用）デモユーザーとしてログイン」のような目立たないリンクとして残す案もある
     （本番運用が安定したら削除）。
4. スコープからは意図的に外すが、実装者が判断に迷わないよう明記：**メールアドレスの逆引きだけで
   なりすまし対策として十分か**は、団体の管理体制次第。より厳密にしたい場合は、GoogleアカウントIDや
   Google Workspaceのドメイン（`hd` クレーム）で絞り込む、といった追加の検証を入れる余地がある。
   このドキュメントではv1として「登録メールアドレスとの一致」のみを仕様とする。

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
5. `components/orbit/login-screen.tsx` の `handleGoogle()` を3.6の実装に置き換える。
   `lib/orbit/store.tsx` の `login`/`logout` は変更不要（そのまま使う）。
6. `pnpm add xlsx` は既に入っているので流用不要。新規追加パッケージは無し（GISはscriptタグ経由、
   Sheets APIはfetch直叩きのため、npmパッケージの追加は不要）。
7. `next/script` でGISのスクリプトタグを `app/layout.tsx` に追加する
   （ログイン画面・アカウント設定の両方で使うため、person-detail.tsx限定ではなく全体で
   読み込むのが妥当）。
8. README（`gas/README.md` もしくは新規 `docs/`）に、この機能を使うための管理者向けセットアップ手順
   （OAuthクライアントID発行手順、`.env` への追記、GitHub Secretsへの登録、各メンバーの
   メールアドレス登録がログインの前提になる旨）を追記する。

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

- Google Picker APIによるファイル選択UI（v1はID/URL貼り付けで十分という判断）。
- 自動同期（タスク完了時など）のトリガー設計（v1は手動同期のみ）。
- ログイン未マッチ時のセルフサインアップ（新規メンバーとしての自動登録）。v1は
  「事前に管理者がメールアドレスを登録している」ことをログインの前提とする（3.6参照）。
- Google Workspaceドメイン制限など、なりすまし対策の追加検証（3.6の申し送り事項を参照）。
