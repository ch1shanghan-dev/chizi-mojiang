from pathlib import Path
import argparse,hashlib,json,re,tempfile,zipfile

parser=argparse.ArgumentParser(description='Build a verified runtime-only extension ZIP from catalog.js.')
parser.add_argument('--out',type=Path)
args=parser.parse_args()
root=Path(__file__).resolve().parent.parent
info=json.loads((root/'info.json').read_text(encoding='utf8'))
text=(root/'catalog.js').read_text(encoding='utf8')
match=re.search(r'window\.extension\s*=\s*(\{.*\});',text,re.S)
if not match: raise ValueError('catalog.js assignment missing')
catalog=json.loads(match.group(1))[info['name']]
if catalog['version']!=info['version']: raise ValueError('catalog version mismatch; run tools/release.js first')
files=catalog['files']
if len(set(files))!=len(files): raise ValueError('duplicate catalog entries')
for file in files:
    path=(root/file).resolve()
    if not path.is_relative_to(root) or not path.is_file(): raise ValueError('unsafe or missing catalog entry')
archive=args.out or Path(tempfile.mkdtemp(prefix='chizi-release-'))/('chizi-mojiang_v'+info['version']+'.zip')
archive.parent.mkdir(parents=True,exist_ok=True)
manifest=[]
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for file in files:
        data=(root/file).read_bytes()
        manifest.append({'file':file,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
        z.write(root/file,file)
with zipfile.ZipFile(archive) as z:
    if len(z.namelist())!=len(files) or 'extension.js' not in files or 'info.json' not in files: raise ValueError('ZIP root mismatch')
    for item in manifest:
        if hashlib.sha256(z.read(item['file'])).hexdigest()!=item['sha256']: raise ValueError('ZIP content mismatch: '+item['file'])
result={'version':info['version'],'files':len(files),'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'allFilesMatch':True}
archive.with_suffix('.verification.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
archive.with_suffix('.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
print(json.dumps(result,indent=2))
