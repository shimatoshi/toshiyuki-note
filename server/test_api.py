import unittest, tempfile, subprocess, os, socket, time, json, urllib.request, urllib.error, secrets

class API(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        sock=socket.socket();sock.bind(('127.0.0.1',0));cls.port=sock.getsockname()[1];sock.close()
        cls.proc=subprocess.Popen(['python3','server/app.py'],env={**os.environ,'NOTE_DATA_DIR':cls.temp.name,'NOTE_PORT':str(cls.port)})
        for _ in range(100):
            try:cls.req('/health');break
            except OSError:time.sleep(.05)
    @classmethod
    def tearDownClass(cls):cls.proc.terminate();cls.proc.wait();cls.temp.cleanup()
    @classmethod
    def req(cls,path,method='GET',body=None,token=None,origin=None):
        headers={'Content-Type':'application/json'}
        if token:headers['Authorization']='Bearer '+token
        if origin:headers['Origin']=origin
        req=urllib.request.Request(f'http://127.0.0.1:{cls.port}'+path,data=json.dumps(body).encode() if body is not None else None,headers=headers,method=method)
        try:
            with urllib.request.urlopen(req,timeout=5) as r:return r.status,json.load(r)
        except urllib.error.HTTPError as e:return e.code,json.load(e)
    def test_auth_ownership_versions_attachments_delete_logout(self):
        name='test'+secrets.token_hex(4)
        status,a=self.req('/auth/register','POST',{'username':name,'password':'test-password-123'})
        self.assertEqual(status,200);token=a['token'];self.assertEqual(a['user']['username'],name)
        status,b=self.req('/auth/register','POST',{'username':name+'b','password':'test-password-456'})
        self.assertEqual(status,200)
        self.assertEqual(self.req('/notebooks')[0],401)
        self.assertEqual(self.req('/auth/login','POST',{'username':name,'password':'wrong-password'})[0],401)
        self.assertEqual(self.req('/auth/login','POST',{'username':name,'password':'test-password-123'})[0],200)
        nb={'id':'note1','title':'検証','createdAt':'2026-10-14','currentPage':1,'pages':[{'pageNumber':1,'content':'本文','lastModified':'2026-10-14','attachments':[{'id':'image','type':'image','data':'data:image/png;base64,aGVsbG8=','createdAt':'2026-10-14'},{'id':'gps','type':'location','data':{'latitude':35.7},'createdAt':'2026-10-14'}]}]}
        self.assertEqual(self.req('/notebooks/note1','PUT',{'version':0,'notebook':nb},token)[0],200)
        self.assertEqual(self.req('/notebooks/note1',token=b['token'])[0],404)
        self.assertEqual(self.req('/notebooks',token=b['token'])[1]['notebooks'],[])
        self.assertEqual(self.req('/notebooks/note1',token=token)[1]['notebook'],nb)
        self.assertEqual(self.req('/notebooks/note1','PUT',{'version':0,'notebook':nb},token)[0],409)
        self.assertEqual(self.req('/notebooks/note1','DELETE',{'version':0},token)[0],409)
        self.assertEqual(self.req('/notebooks/note1','DELETE',{'version':1},token)[0],200)
        self.assertEqual(self.req('/notebooks/note1',token=token)[0],404)
        self.assertEqual(self.req('/notebooks',token=token)[1]['notebooks'][0]['deleted'],1)
        self.assertEqual(self.req('/auth/logout','POST',{},token)[0],200)
        self.assertEqual(self.req('/notebooks',token=token)[0],401)
    def test_cors_and_body_validation(self):
        self.assertEqual(self.req('/health',origin='https://evil.example')[0],403)
        self.assertEqual(self.req('/health',origin='https://toshiyuki-note.vercel.app')[0],200)
        self.assertEqual(self.req('/auth/register','POST',{'username':'a','password':'short'})[0],400)

if __name__=='__main__':unittest.main()
