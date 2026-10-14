#!/usr/bin/env python3
"""Pixel-hosted note API. Python standard library only; no external DB required."""
import os, json, sqlite3, secrets, hashlib, hmac, time, re, threading
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

DATA = Path(os.environ.get('NOTE_DATA_DIR', str(Path.home() / '.local/share/toshiyuki-note')))
DATA.mkdir(parents=True, exist_ok=True)
os.chmod(DATA, 0o700)
DB = DATA / 'notes.sqlite3'
ORIGINS = set(os.environ.get('NOTE_ORIGINS', 'https://toshiyuki-note.vercel.app,https://localhost,http://localhost,capacitor://localhost').split(','))
MAX_BODY = 32 * 1024 * 1024
RATE = {}; RATE_LOCK = threading.Lock()

def connect():
    db = sqlite3.connect(DB, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    return db

def initialize():
    with connect() as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.executescript('''
        CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS notebooks(user_id TEXT NOT NULL REFERENCES users(id),id TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT,deleted INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,id));
        CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
        ''')
    DB.chmod(0o600)

def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    return salt + ':' + hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 600000).hex()

def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()

def validate_notebook(n, key):
    if not isinstance(n, dict) or n.get('id') != key or not isinstance(n.get('title'), str) or len(n['title']) > 1000:
        raise ValueError('ノートの形式が不正です')
    pages = n.get('pages')
    if not isinstance(pages, list) or not 1 <= len(pages) <= 10000:
        raise ValueError('ページ数が不正です')
    if not isinstance(n.get('currentPage'), int) or not 1 <= n['currentPage'] <= len(pages):
        raise ValueError('現在ページが不正です')
    for i, p in enumerate(pages):
        if not isinstance(p, dict) or p.get('pageNumber') != i+1 or not isinstance(p.get('content'), str):
            raise ValueError('ページの形式が不正です')
        for a in p.get('attachments', []):
            if not isinstance(a, dict) or a.get('type') not in ('image','file','location'):
                raise ValueError('添付の形式が不正です')
            if a['type'] != 'location' and (not isinstance(a.get('data'), str) or not a['data'].startswith('data:')):
                raise ValueError('添付データが不正です')

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Never log request bodies, passwords or authentication headers.
        pass
    def reply(self, status, body=None):
        data = b'' if status == 204 else json.dumps(body or {}, ensure_ascii=False).encode()
        self.send_response(status)
        origin = self.headers.get('Origin')
        if origin in ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
        self.send_header('Vary','Origin')
        self.send_header('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS')
        self.send_header('Access-Control-Allow-Headers','Authorization,Content-Type')
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(data)))
        self.end_headers(); self.wfile.write(data)
    def do_OPTIONS(self): self.reply(204)
    def do_GET(self): self.dispatch()
    def do_POST(self): self.dispatch()
    def do_PUT(self): self.dispatch()
    def do_DELETE(self): self.dispatch()
    def dispatch(self):
        try:
            origin = self.headers.get('Origin')
            if origin and origin not in ORIGINS: return self.reply(403, {'error':'許可されていない接続元です'})
            path = self.path.split('?')[0]
            if path == '/health' and self.command == 'GET': return self.reply(200, {'ok':True,'service':'toshiyuki-note','protocol':1})
            body = {}
            if self.command in ('POST','PUT','DELETE'):
                size = int(self.headers.get('Content-Length','0'))
                if size < 0 or size > MAX_BODY: return self.reply(413, {'error':'1冊の上限は32MBです'})
                body = json.loads(self.rfile.read(size) or b'{}')
                if not isinstance(body,dict): raise ValueError('JSONオブジェクトが必要です')
            with connect() as db:
                if path in ('/auth/login','/auth/register') and self.command == 'POST':
                    key = self.headers.get('CF-Connecting-IP') or self.client_address[0]
                    with RATE_LOCK:
                        now = time.time()
                        RATE[key] = [t for t in RATE.get(key,[]) if t > now-900]
                        if len(RATE[key]) >= 12: return self.reply(429, {'error':'しばらく待って再試行してください'})
                        RATE[key].append(now)
                    username = str(body.get('username','')).strip()
                    password = body.get('password','')
                    if not re.fullmatch(r'[\w.-]{2,40}',username) or not isinstance(password,str) or not 10 <= len(password) <= 256:
                        return self.reply(400, {'error':'ユーザー名（2〜40文字）と10文字以上のパスワードを入力してください'})
                    if path == '/auth/register':
                        if db.execute('SELECT count(*) FROM users').fetchone()[0] >= 100:
                            return self.reply(503, {'error':'登録上限に達しました'})
                        user_id = secrets.token_hex(16)
                        try: db.execute('INSERT INTO users VALUES(?,?,?,?)',(user_id,username,password_hash(password),int(time.time())))
                        except sqlite3.IntegrityError: return self.reply(409, {'error':'このユーザー名は登録済みです'})
                    else:
                        user = db.execute('SELECT * FROM users WHERE username=?',(username,)).fetchone()
                        salt = user['password'].split(':')[0] if user else '00'*16
                        computed = password_hash(password,salt)
                        if not user or not hmac.compare_digest(computed,user['password']): return self.reply(401, {'error':'ログイン情報が違います'})
                        user_id = user['id']
                    token = secrets.token_urlsafe(32)
                    db.execute('DELETE FROM sessions WHERE expires_at < ?', (int(time.time()),))
                    db.execute('INSERT INTO sessions VALUES(?,?,?)',(token_hash(token),user_id,int(time.time())+30*86400))
                    db.commit()
                    return self.reply(200, {'token':token,'user':{'id':user_id,'username':username}})
                token = self.headers.get('Authorization','').removeprefix('Bearer ')
                user = db.execute('SELECT users.id,users.username FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?',(token_hash(token),int(time.time()))).fetchone()
                if not user: return self.reply(401, {'error':'ログインしてください'})
                uid = user['id']
                if path == '/auth/me' and self.command == 'GET': return self.reply(200, {'user':dict(user)})
                if path == '/auth/logout' and self.command == 'POST':
                    db.execute('DELETE FROM sessions WHERE token_hash=?',(token_hash(token),));db.commit();return self.reply(200)
                if path == '/notebooks' and self.command == 'GET':
                    rows = db.execute('SELECT id,version,deleted,updated_at FROM notebooks WHERE user_id=?',(uid,)).fetchall()
                    return self.reply(200, {'notebooks':[dict(r) for r in rows]})
                match = re.fullmatch(r'/notebooks/([a-zA-Z0-9_-]{1,100})',path)
                if not match: return self.reply(404, {'error':'見つかりません'})
                key = match[1]
                if self.command in ('PUT','DELETE'): db.execute('BEGIN IMMEDIATE')
                row = db.execute('SELECT * FROM notebooks WHERE user_id=? AND id=?',(uid,key)).fetchone()
                if self.command == 'GET':
                    if not row or row['deleted']: return self.reply(404, {'error':'見つかりません'})
                    return self.reply(200, {'version':row['version'],'notebook':json.loads(row['payload'])})
                if self.command not in ('PUT','DELETE'): return self.reply(405)
                expected = body.get('version')
                version = row['version'] if row else 0
                if type(expected) is not int or expected != version:
                    return self.reply(409, {'error':'別の端末で更新されています','version':version})
                deleted = self.command == 'DELETE'
                payload = None
                if not deleted:
                    validate_notebook(body.get('notebook'),key)
                    payload = json.dumps(body['notebook'],ensure_ascii=False)
                    used = db.execute('SELECT coalesce(sum(length(CAST(payload AS BLOB))),0) FROM notebooks WHERE user_id=? AND id!=?',(uid,key)).fetchone()[0]
                    if used + len(payload.encode()) > 256*1024*1024: return self.reply(413, {'error':'クラウド容量（256MB）に達しました'})
                db.execute('INSERT INTO notebooks VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET version=excluded.version,payload=excluded.payload,deleted=excluded.deleted,updated_at=excluded.updated_at',(uid,key,version+1,payload,int(deleted),int(time.time())))
                db.commit();return self.reply(200, {'version':version+1})
        except (ValueError,TypeError,KeyError): self.reply(400, {'error':'リクエストの形式が不正です'})
        except Exception:
            self.reply(500, {'error':'サーバー処理に失敗しました'})

if __name__ == '__main__':
    initialize()
    server = ThreadingHTTPServer(('127.0.0.1',int(os.environ.get('NOTE_PORT','8420'))),Handler)
    server.daemon_threads = True
    server.serve_forever()
