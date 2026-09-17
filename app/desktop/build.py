#!/usr/bin/env python3
"""Build standalone macOS Universal and Windows x64/ARM64 browser apps on a Mac."""
import argparse, hashlib, json, os, pathlib, plistlib, re, shutil, subprocess, sys, zipfile
ROOT = pathlib.Path(__file__).resolve().parent
WEB = ROOT.parent / 'web'
VERSION = '0.1.10'
BUILD = ROOT / 'build'
DIST = ROOT / 'dist'
GO = os.environ.get('TAP_GO') or shutil.which('go') or str(ROOT / '.tools/go/bin/go')

def run(args, cwd=ROOT, env=None):
    print('›', ' '.join(map(str,args)), flush=True)
    subprocess.run(list(map(str,args)), cwd=cwd, env=env, check=True)

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--skip-web', action='store_true'); args=parser.parse_args()
    BUILD.mkdir(exist_ok=True); DIST.mkdir(exist_ok=True)
    if not args.skip_web:
        run(['pnpm','--dir',WEB,'test']); run(['pnpm','--dir',WEB,'build'])
    assert (WEB/'dist/index.html').exists(), 'Build the web app first'
    shutil.rmtree(ROOT/'server/web',ignore_errors=True)
    shutil.copytree(WEB/'dist',ROOT/'server/web')
    # License notices travel with the shareable package, not only the source tree.
    notices=['TAP '+VERSION+' — THIRD-PARTY NOTICES\n']
    for p in sorted(set((WEB/'node_modules/.pnpm').glob('*/node_modules/*/LICENSE*')) | set((WEB/'node_modules/.pnpm').glob('*/node_modules/@*/*/LICENSE*'))):
        if p.is_file(): notices.append('\n--- '+str(p.relative_to(WEB/'node_modules/.pnpm'))+' ---\n'+p.read_text(errors='replace'))
    for p in [*sorted((WEB/'public/fonts').glob('*OFL.txt')), WEB/'public/draco/LICENSE.txt']: notices.append('\n--- '+p.name+' ---\n'+p.read_text())
    go_root=subprocess.check_output([GO,'env','GOROOT'],text=True).strip()
    notices.append('\n--- Go runtime ---\n'+(pathlib.Path(go_root)/'LICENSE').read_text())
    notice='\n'.join(notices); (DIST/'THIRD-PARTY-NOTICES.txt').write_text(notice)
    (ROOT/'server/web/THIRD-PARTY-NOTICES.txt').write_text(notice)
    run([GO,'test','./...'],cwd=ROOT/'server')
    iconset=BUILD/'TAP.iconset';iconset.mkdir(exist_ok=True)
    for n in [16,32,128,256,512]:
        for mult in [1,2]:
            name=f'icon_{n}x{n}'+('@2x' if mult==2 else '')+'.png'
            subprocess.run(['sips','-z',str(n*mult),str(n*mult),str(ROOT/'assets/tap-icon.png'),'--out',str(iconset/name)],check=True,stdout=subprocess.DEVNULL)
    run(['iconutil','-c','icns',iconset,'-o',BUILD/'TAP.icns'])
    env=os.environ.copy();env['CGO_ENABLED']='0'
    for arch in ['arm64','amd64']:
        e=env|{'GOOS':'darwin','GOARCH':arch}
        run([GO,'build','-trimpath','-ldflags',f'-s -w -X main.version={VERSION}','-o',BUILD/f'server-{arch}','.'],cwd=ROOT/'server',env=e)
        swift_arch='x86_64' if arch=='amd64' else 'arm64'
        run(['swiftc','-O','-target',f'{swift_arch}-apple-macos13.0','-framework','AppKit',ROOT/'Launcher.swift','-o',BUILD/f'launcher-{arch}'])
    app=DIST/'TAP.app';shutil.rmtree(app,ignore_errors=True)
    mac=app/'Contents/MacOS';res=app/'Contents/Resources';mac.mkdir(parents=True);res.mkdir()
    run(['lipo','-create',BUILD/'launcher-arm64',BUILD/'launcher-amd64','-output',mac/'TAP'])
    run(['lipo','-create',BUILD/'server-arm64',BUILD/'server-amd64','-output',res/'tap-server'])
    shutil.copy2(BUILD/'TAP.icns',res/'TAP.icns');shutil.copy2(ROOT/'assets/tap-icon.png',res/'AppIcon.png')
    (res/'THIRD-PARTY-NOTICES.txt').write_text(notice)
    info={'CFBundleName':'TAP','CFBundleDisplayName':'TAP','CFBundleIdentifier':'org.local.tap','CFBundleExecutable':'TAP','CFBundlePackageType':'APPL','CFBundleIconFile':'TAP','CFBundleShortVersionString':VERSION,'CFBundleVersion':'1','LSMinimumSystemVersion':'13.0','NSHighResolutionCapable':True,'NSPrincipalClass':'NSApplication','NSHumanReadableCopyright':'TAP · 2026'}
    (app/'Contents/Info.plist').write_bytes(plistlib.dumps(info))
    run(['codesign','--force','--sign','-',res/'tap-server'])
    run(['codesign','--force','--sign','-',app])
    run(['codesign','--verify','--deep','--strict',app])
    shutil.copy2(ROOT/'README.txt',DIST/'README.txt')
    # Keep the .app's signatures and executable modes intact inside the ZIP.
    maczip=DIST/f'TAP-{VERSION}-macOS-universal.zip'
    if maczip.exists(): maczip.unlink()
    run(['ditto','-c','-k','--keepParent',app,maczip])
    with zipfile.ZipFile(maczip,'a',zipfile.ZIP_DEFLATED) as z: z.write(ROOT/'README.txt','README.txt')
    run([GO,'run','github.com/tc-hib/go-winres@v0.3.3','make','--arch','amd64,arm64','--in',ROOT/'winres.json'],cwd=ROOT/'server')
    for arch in ['amd64','arm64']:
        label='x64' if arch=='amd64' else 'arm64'
        exe=DIST/f'TAP-Windows-{label}.exe'
        run([GO,'build','-trimpath','-ldflags',f'-s -w -X main.version={VERSION}','-o',exe,'.'],cwd=ROOT/'server',env=env|{'GOOS':'windows','GOARCH':arch})
        with zipfile.ZipFile(DIST/f'TAP-{VERSION}-Windows-{label}.zip','w',zipfile.ZIP_DEFLATED) as z:
            z.write(exe,'TAP.exe');z.write(ROOT/'README.txt','README.txt');z.write(DIST/'THIRD-PARTY-NOTICES.txt','THIRD-PARTY-NOTICES.txt')
    # Validate the new release before removing only recognized, obsolete distributions.
    run([sys.executable, ROOT/'smoke.py'])
    current={f'TAP-{VERSION}-{platform}.zip' for platform in ['macOS-universal','Windows-x64','Windows-arm64']}
    for old in DIST.iterdir():
        obsolete_zip=re.fullmatch(r'(?:TAP|Azim)-[0-9]+\.[0-9]+\.[0-9]+-(?:macOS-universal|Windows-x64|Windows-arm64)\.zip',old.name) and old.name not in current
        legacy=old.name in {'Azim.app','Azim-Windows-x64.exe','Azim-Windows-arm64.exe'}
        if obsolete_zip or legacy:
            print('Removing previous release:',old.name,flush=True)
            if old.is_dir() and not old.is_symlink(): shutil.rmtree(old)
            else: old.unlink()
    lines=[f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}' for p in sorted(DIST.glob('TAP-*.zip'))]
    (DIST/'SHA256SUMS.txt').write_text('\n'.join(lines)+'\n')
    print('Ready:',DIST)

if __name__=='__main__': main()
