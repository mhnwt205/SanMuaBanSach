"""Measure static JavaScript dependencies of Vite's entry; dynamic routes are excluded."""
import argparse, gzip, json
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--dist',default='apps/web/dist');parser.add_argument('--baseline');parser.add_argument('--output',required=True)
args=parser.parse_args();dist=Path(args.dist);manifest=json.loads((dist/'.vite/manifest.json').read_text());seen=set();files=[]
def visit(key):
 if key in seen:return
 seen.add(key);entry=manifest[key]
 if entry['file'].endswith('.js'):
  p=dist/entry['file'];files.append({'file':entry['file'],'bytes':p.stat().st_size,'gzip':len(gzip.compress(p.read_bytes()))})
 for dependency in entry.get('imports',[]):visit(dependency)
visit('index.html')
result={'initial_js':files,'initial_js_bytes':sum(x['bytes'] for x in files),'initial_js_gzip':sum(x['gzip'] for x in files),'deferred_routes':[k for k,v in manifest.items() if v.get('isDynamicEntry')]}
if args.baseline:
 before=json.loads(Path(args.baseline).read_text());result['before_initial_js_gzip']=before['initial_js_gzip'];result['gzip_reduction_percent']=round((1-result['initial_js_gzip']/before['initial_js_gzip'])*100,1)
Path(args.output).write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
