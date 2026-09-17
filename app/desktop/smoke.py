#!/usr/bin/env python3
"""Exercise the distributed Mac ZIP in an unrelated folder with no developer PATH."""
import json, os, pathlib, re, select, socket, subprocess, tempfile, urllib.request
ROOT=pathlib.Path(__file__).resolve().parent

def main():
    with tempfile.TemporaryDirectory(prefix='TAP portable check ') as folder:
        subprocess.run(['ditto','-x','-k',str(ROOT/'dist/TAP-0.1.10-macOS-universal.zip'),folder],check=True)
        app=pathlib.Path(folder)/'TAP.app'
        subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
        server=app/'Contents/Resources/tap-server'
        env={'PATH':'/usr/bin:/bin','TMPDIR':folder}
        process=subprocess.Popen([str(server),'--port','0','--no-open'],cwd=folder,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
        try:
            assert select.select([process.stdout],[],[],15)[0], 'server did not start'
            line=process.stdout.readline().strip(); assert line.startswith('TAP_URL='),line
            url=line.split('=',1)[1]
            def get(path):
                with urllib.request.urlopen(url+path,timeout=10) as r: return r.status,r.headers,r.read()
            assert json.loads(get('__tap/health')[2])['app']=='tap-desktop'
            assert b'TAP 0.1.10' in get('symbol-reference.html')[2]
            html=get('')[2].decode(); assert '<title>TAP' in html
            for asset in re.findall(r'(?:src|href)="(/[^\"]+)"',html): assert get(asset.lstrip('/'))[0]==200,asset
            for asset in ['areas/aeuli/dem.json','areas/aeuli/dem.bin','areas/aeuli/buildings.json','draco/draco_decoder.wasm','fonts/fonts.css','symbol-reference.html']:
                status,headers,data=get(asset); assert status==200 and data,asset
            fontcss=get('fonts/fonts.css')[2].decode()
            assert 'https://' not in fontcss
            for asset in re.findall(r'url\((/[^)]+)\)',fontcss): assert get(asset.lstrip('/'))[0]==200
            duplicate=subprocess.run([str(server),'--port',url.split(':')[-1].strip('/'),'--no-open'],env=env,cwd=folder,capture_output=True,text=True,timeout=5)
            assert duplicate.returncode==0 and 'TAP_REUSED=' in duplicate.stdout,duplicate.stdout
            print('PASS extracted standalone server, identity, HTML/assets/fonts/DEM/decoder and duplicate launch:',url)
        finally:
            process.terminate();process.wait(timeout=5)
        # Native launcher controls its own child and exits cleanly without a browser in smoke mode.
        p=subprocess.run([str(app/'Contents/MacOS/TAP')],cwd=folder,env=env|{'TAP_LAUNCHER_SMOKE':'1'},capture_output=True,text=True,timeout=25)
        assert p.returncode==0 and 'TAP_LAUNCHER_READY=' in p.stdout,(p.stdout,p.stderr)
        print('PASS extracted native launcher with minimal environment and clean shutdown')

if __name__=='__main__':main()
