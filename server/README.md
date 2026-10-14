# 旧Pixelクラウド

Python 3標準ライブラリ + SQLite（WAL）。DBは `~/.local/share/toshiyuki-note/notes.sqlite3`。
`bash NoteCloud up|down|status|log` でAPIとCloudflare Quick Tunnelを管理します。
トンネルのURLは既存 `shimatoshi/project-urls` の `toshiyuki-note-api` に自動登録されます。
GitHub認証には端末内の既存 `~/.github_token` を使用し、アプリやリポジトリに含めません。

- 匿名利用：端末保存のみ。クラウドアクセスなし。
- ユーザー登録：ユーザー名2〜40文字（文字・数字・アンダースコア・`.`・`-`）、パスワード10〜256文字。
- パスワード：PBKDF2-HMAC-SHA256、600,000回、ランダムsalt。セッションは30日、有効なトークンのハッシュのみ保存。
- 全操作はログインユーザー所有のノートに限定。バージョン照合で同時上書きを拒否。
- 1冊32MB、1ユーザー256MB、登録100人まで。登録・ログインは15分12回まで。
- 許可Originは `NOTE_ORIGINS` でカンマ区切り指定。デフォルトは本番PWAとCapacitor。
- `NOTE_DATA_DIR`, `NOTE_PORT` でAPI保存先・待ち受けポートを指定可能（supervisorのトンネルは8420番）。
- SQLiteオンラインバックアップを1日1回作成し、7日分保持。API停止中も端末編集可能。

自動起動のOS設定は行いません。Quick Tunnelなので端末・トンネル稼働が必要です。

## 同期

ログイン後、端末保存の2.5秒後と回線復帰時に同期。メニューの「今すぐアップロード・同期」で他端末の変更を取得。
本体、全ページ、添付（data URI）、背景を1冊のJSONとして保存します。
同時編集時は端末側を「競合コピー」として端末に保存しアップロード後にクラウド側を取得。
削除にも版番号を照合。削除と編集が競合した場合は編集内容を復元。
匿名利用時のノートは最初のログインで同期。その後、別アカウントへ自動で送信しません。
ログアウト後も端末内のノートは残ります。

## 検証

`python3 -m unittest discover -s server -p 'test_*.py'`
