#!/usr/bin/env python3
"""API + quick tunnel supervision; publish changed HTTPS URL to url-board registry."""
import subprocess, time, os, json, re, urllib.request, base64, sqlite3, signal
from pathlib import Path
ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('NOTE_DATA_DIR', str(Path.home() / '.local/share/toshiyuki-note')))
DATA.mkdir(parents=True,exist_ok=True)
TERMUX = Path('/data/data/com.termux/files')
api = tunnel = None
stopping = False

def stop(*_):
    global stopping
    stopping=True
    for p in (api,tunnel):
        if p and p.poll() is None: p.terminate()
for sig in (signal.SIGTERM, signal.SIGINT): signal.signal(sig,stop)

def publish(url):
    credential = TERMUX / 'home/.github_token'
    if not credential.exists(): raise RuntimeError('URL registry credential is missing')
    token = credential.read_text().strip()
    endpoint = 'https://api.github.com/repos/shimatoshi/project-urls/contents/urls.json'
    headers = {'Authorization':'Bearer '+token,'User-Agent':'toshiyuki-note-cloud','Accept':'application/vnd.github+json'}
    for attempt in range(3):
        with urllib.request.urlopen(urllib.request.Request(endpoint,headers=headers),timeout=20) as r: current=json.load(r)
        data=json.loads(base64.b64decode(current['content']))
        if data.get('projects',{}).get('toshiyuki-note-api',{}).get('url')==url:return
        data.setdefault('projects',{})['toshiyuki-note-api']={'url':url,'description':'としゆきノート：旧Pixel SQLite同期API','host':'old-pixel5','updated':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
        body={'message':'update toshiyuki-note-api URL','sha':current['sha'],'content':base64.b64encode(json.dumps(data,ensure_ascii=False,indent=2).encode()).decode(),'branch':'main'}
        try:
            with urllib.request.urlopen(urllib.request.Request(endpoint,data=json.dumps(body).encode(),headers=headers,method='PUT'),timeout=20):pass
            return
        except urllib.error.HTTPError as e:
            if e.code != 409 or attempt == 2:raise

def backup():
    path=DATA/'notes.sqlite3'
    if not path.exists():return
    dest=DATA/'backups';dest.mkdir(exist_ok=True);dest.chmod(0o700)
    filename=dest/(time.strftime('%Y-%m-%d')+'.sqlite3')
    with sqlite3.connect(path) as source, sqlite3.connect(filename) as target:source.backup(target)
    filename.chmod(0o600)
    for old in sorted(dest.glob('*.sqlite3'))[:-7]:old.unlink()

(DATA/'supervisor.pid').write_text(str(os.getpid()))
last_backup=0
published=''
try:
    while not stopping:
        if api is None or api.poll() is not None:
            api=subprocess.Popen(['python3',str(ROOT/'app.py')],stdout=open(DATA/'api.log','a'),stderr=subprocess.STDOUT)
        if tunnel is None or tunnel.poll() is not None:
            log=DATA/'tunnel.log';log.write_text('')
            tunnel=subprocess.Popen([str(TERMUX/'usr/bin/cloudflared'),'tunnel','--no-autoupdate','--protocol','http2','--url','http://127.0.0.1:8420'],stdout=log.open('a'),stderr=subprocess.STDOUT,env={**os.environ,'GODEBUG':'netdns=go'})
            published=''
        matches=re.findall(r'https://[a-z0-9-]+\.trycloudflare\.com',(DATA/'tunnel.log').read_text())
        if matches and matches[-1]!=published:
            try:
                publish(matches[-1]);published=matches[-1];(DATA/'endpoint').write_text(published)
                print('Cloud API registered',flush=True)
            except Exception as e:print('Registry update failed:',type(e).__name__,flush=True)
        if time.time()-last_backup>86400:
            try:backup();last_backup=time.time()
            except Exception as e:print('Backup failed:',type(e).__name__,flush=True)
        time.sleep(5)
finally:
    stop()
    for p in (api,tunnel):
        if p:
            try:p.wait(timeout=10)
            except subprocess.TimeoutExpired:p.kill()
    (DATA/'supervisor.pid').unlink(missing_ok=True)
