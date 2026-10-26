"""Project-only operations: read account/metrics, private D1 backup, local restore drill.
Never restores remote D1, creates resources, changes subscriptions or prints credentials.
"""
import argparse,datetime,hashlib,json,os,re,sqlite3,subprocess,tempfile,time,urllib.request,urllib.error
from pathlib import Path
ACCOUNT='7b6e2804bf324dfdd8eec5e62887eef1'
DATABASE='9b434dcb-2166-478c-b1ec-afa5f24506f5'
ROOT=Path(__file__).resolve().parents[1]
class OperationError(Exception):pass

def cf(path,payload=None):
 if os.environ.get('CLOUDFLARE_ACCOUNT_ID')!=ACCOUNT or not os.environ.get('CLOUDFLARE_API_TOKEN'):
  raise OperationError('Use the project Cloudflare account/token via environment Secrets.')
 req=urllib.request.Request('https://api.cloudflare.com/client/v4'+path,data=None if payload is None else json.dumps(payload).encode(),headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'],'Content-Type':'application/json','User-Agent':'Mozilla/5.0'})
 try:
  with urllib.request.urlopen(req,timeout=45) as r:result=json.load(r)
 except urllib.error.HTTPError as e:raise OperationError(f'Cloudflare HTTP {e.code}; verify read/export permissions.') from None
 if result.get('success') is False:raise OperationError('Cloudflare rejected operation; codes '+','.join(str(x.get('code')) for x in result.get('errors',[])))
 return result

def fingerprint(connection):
 tables=[x[0] for x in connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name")]
 output={}
 for table in tables:
  if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*',table):raise OperationError('Unexpected table name.')
  rows=[json.dumps(tuple(v.hex() if isinstance(v,bytes) else v for v in row),ensure_ascii=False,separators=(',',':')) for row in connection.execute('SELECT * FROM "'+table+'"')]
  digest=hashlib.sha256('\n'.join(sorted(rows)).encode()).hexdigest()
  output[table]={'rows':len(rows),'sha256':digest}
 return output

def restore_memory(path):
 connection=sqlite3.connect(':memory:')
 connection.set_authorizer(lambda action,a,b,*rest:sqlite3.SQLITE_DENY if action in (sqlite3.SQLITE_ATTACH,sqlite3.SQLITE_DETACH) or (action==sqlite3.SQLITE_FUNCTION and b in ('load_extension','readfile','writefile')) else sqlite3.SQLITE_OK)
 connection.executescript(path.read_text())
 if connection.execute('PRAGMA integrity_check').fetchall()!=[('ok',)] or connection.execute('PRAGMA foreign_key_check').fetchall():raise OperationError('Restore integrity/foreign key check failed.')
 return connection

def private_dir(path):
 path.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(path,0o700)
 return path

def backup(directory):
 directory=private_dir(directory.resolve())
 if directory==ROOT or ROOT in directory.parents:raise OperationError('Keep production backups outside the Git repository.')
 filename='d1-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S')+'.sql'
 target=directory/filename
 if target.exists():raise OperationError('Backup already exists; nothing overwritten.')
 bookmark=None;result=None
 for _ in range(60):
  payload={'output_format':'polling','dump_options':{}}
  if bookmark is not None:payload['current_bookmark']=bookmark
  response=cf(f'/accounts/{ACCOUNT}/d1/database/{DATABASE}/export',payload)['result']
  if response.get('status')=='error' or response.get('success') is False:raise OperationError('D1 export failed.')
  if response.get('status')=='complete':result=response;break
  bookmark=response.get('at_bookmark');time.sleep(1)
 if result is None:raise OperationError('D1 export still pending; retry later.')
 # Signed download URLs are secrets. Do not log the response or pass Authorization to storage.
 url=result['result']['signed_url']
 if not url.startswith('https://'):raise OperationError('Export download must use HTTPS.')
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=60) as stream:
  descriptor=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
  with os.fdopen(descriptor,'wb') as out:
   while chunk:=stream.read(1024*1024):out.write(chunk)
 connection=restore_memory(target);tables=fingerprint(connection);connection.close()
 manifest={'database':DATABASE,'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sql_sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'tables':tables}
 manifest_path=target.with_suffix('.manifest.json');descriptor=os.open(manifest_path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(descriptor,'w') as out:json.dump(manifest,out,indent=2)
 print(json.dumps({'backup':str(target),'manifest':str(manifest_path),'integrity':'ok','tables':len(tables),'mode':'0600'},indent=2))

def drill(path):
 path=path.resolve();manifest=json.loads(path.with_suffix('.manifest.json').read_text())
 if manifest['database']!=DATABASE or hashlib.sha256(path.read_bytes()).hexdigest()!=manifest['sql_sha256']:raise OperationError('Backup identity/checksum mismatch.')
 restored=restore_memory(path)
 if fingerprint(restored)!=manifest['tables']:raise OperationError('Restored content differs from manifest.')
 restored.close()
 with tempfile.TemporaryDirectory(prefix='cho-sach-restore-',dir='/tmp') as temporary:
  os.chmod(temporary,0o700);state=Path(temporary)/'state'
  env={**os.environ,'XDG_CONFIG_HOME':str(Path(temporary)/'config'),'WRANGLER_SEND_METRICS':'false'}
  command=['node',str(ROOT/'apps/api/node_modules/wrangler/bin/wrangler.js'),'d1','execute','cho-sach-cu-db','--local','--persist-to',str(state),'--json']
  try:
   subprocess.run(command+['--file',str(path)],cwd=ROOT/'apps/api',env=env,capture_output=True,text=True,check=True,timeout=120)
  except subprocess.SubprocessError:raise OperationError('Local D1 import failed; output suppressed to protect backup contents.') from None
  databases=list(state.rglob('*.sqlite'))
  matched=False
  for database in databases:
   connection=sqlite3.connect(database)
   tables=fingerprint(connection)
   if all(tables.get(name)==expected for name,expected in manifest['tables'].items()):
    if connection.execute('PRAGMA integrity_check').fetchall()!=[('ok',)] or connection.execute('PRAGMA foreign_key_check').fetchall():raise OperationError('Local D1 integrity check failed.')
    matched=True
   connection.close()
  if not matched:raise OperationError('Local D1 content differs from backup.')
 print('PASS: checksum, SQLite restore, local Wrangler D1 import, all table content fingerprints, integrity and foreign keys; remote D1 untouched.')

def account_check():
 subscriptions=cf(f'/accounts/{ACCOUNT}/subscriptions')['result']
 products=[x.get('rate_plan',{}).get('public_name','unknown') for x in subscriptions]
 r2=next((x for x in subscriptions if 'r2' in x.get('rate_plan',{}).get('public_name','').lower()),None)
 database=cf(f'/accounts/{ACCOUNT}/d1/database/{DATABASE}')['result']
 bucket=cf(f'/accounts/{ACCOUNT}/r2/buckets/cho-sach-cu-images')['result']
 print(json.dumps({'subscriptions':products,'d1':{'name':database.get('name'),'bytes':database.get('file_size'),'version':database.get('version')},'r2':{'name':bucket.get('name'),'storage_class':bucket.get('storage_class'),'current_period_start':r2.get('current_period_start') if r2 else None,'current_period_end':r2.get('current_period_end') if r2 else None},'changed_resources':False},indent=2))
 if any('r2' not in x.lower() and 'free' not in x.lower() for x in products):raise OperationError('Unexpected subscription. Stop deployment and inspect account plan.')

def metrics():
 now=datetime.datetime.now(datetime.timezone.utc);day=now.replace(hour=0,minute=0,second=0,microsecond=0)
 start,end=day.isoformat(),now.isoformat()
 subscriptions=cf(f'/accounts/{ACCOUNT}/subscriptions')['result']
 r2=next((x for x in subscriptions if 'r2' in x.get('rate_plan',{}).get('public_name','').lower()),None)
 month_start=r2.get('current_period_start') if r2 else None
 if not month_start:raise OperationError('R2 subscription period unavailable; check Dashboard Metrics instead of assuming a calendar month.')
 query='''query($account:string,$day:Time,$month:Time,$end:Time){viewer{accounts(filter:{accountTag:$account}){
  workersInvocationsAdaptive(limit:10000,filter:{datetime_geq:$day,datetime_leq:$end}){sum{requests errors} quantiles{cpuTimeP50 cpuTimeP99} dimensions{scriptName status}}
  d1AnalyticsAdaptiveGroups(limit:1000,filter:{datetime_geq:$day,datetime_leq:$end}){sum{readQueries writeQueries rowsRead rowsWritten} dimensions{databaseId}}
  r2OperationsAdaptiveGroups(limit:1000,filter:{datetime_geq:$month,datetime_leq:$end}){sum{requests} dimensions{bucketName actionType storageClass}}
  r2StorageAdaptiveGroups(limit:1000,filter:{datetime_geq:$day,datetime_leq:$end}){max{objectCount payloadSize metadataSize} dimensions{bucketName storageClass}}
 }}}'''
 result=cf('/graphql',{'query':query,'variables':{'account':ACCOUNT,'day':start,'month':month_start,'end':end}})
 if result.get('errors'):raise OperationError('Cloudflare analytics unavailable; verify Analytics Read or use Dashboard Metrics. Do not upgrade.')
 account_rows=result['data']['viewer']['accounts'][0]
 workers=account_rows['workersInvocationsAdaptive'];d1=account_rows['d1AnalyticsAdaptiveGroups'];r2ops=account_rows['r2OperationsAdaptiveGroups'];r2storage=account_rows['r2StorageAdaptiveGroups']
 if max(len(workers),len(d1),len(r2ops),len(r2storage)) in (1000,10000):raise OperationError('Analytics group limit reached; results could be incomplete. Use Dashboard Metrics.')
 sum_fields=lambda rows,field:sum((row.get('sum') or {}).get(field) or 0 for row in rows)
 project_worker=[row for row in workers if 'cho-sach-cu' in (row['dimensions']['scriptName'] or '')]
 project_d1=[row for row in d1 if row['dimensions']['databaseId']==DATABASE]
 project_r2=[row for row in r2ops if row['dimensions']['bucketName']=='cho-sach-cu-images']
 project_storage=[row for row in r2storage if row['dimensions']['bucketName']=='cho-sach-cu-images' and row['dimensions']['storageClass']=='Standard']
 class_a={'ListBuckets','PutBucket','ListObjects','PutObject','CopyObject','CompleteMultipartUpload','CreateMultipartUpload','LifecycleStorageTierTransition','ListMultipartUploads','UploadPart','UploadPartCopy','ListParts','PutBucketEncryption','PutBucketCors','PutBucketLifecycleConfiguration'}
 class_b={'HeadBucket','HeadObject','GetObject','UsageSummary','GetBucketEncryption','GetBucketLocation','GetBucketCors','GetBucketLifecycleConfiguration'}
 project_a=sum((row.get('sum') or {}).get('requests') or 0 for row in project_r2 if row['dimensions']['actionType'] in class_a)
 project_b=sum((row.get('sum') or {}).get('requests') or 0 for row in project_r2 if row['dimensions']['actionType'] in class_b)
 project_delete=sum((row.get('sum') or {}).get('requests') or 0 for row in project_r2 if row['dimensions']['actionType']=='DeleteObject')
 account_a=sum((row.get('sum') or {}).get('requests') or 0 for row in r2ops if row['dimensions']['actionType'] in class_a)
 account_b=sum((row.get('sum') or {}).get('requests') or 0 for row in r2ops if row['dimensions']['actionType'] in class_b)
 account_storage=sum((row.get('max') or {}).get('payloadSize') or 0 for row in r2storage if row['dimensions']['storageClass']=='Standard')
 peak=max((row.get('max') or {}).get('payloadSize') or 0 for row in project_storage)
 objects=max((row.get('max') or {}).get('objectCount') or 0 for row in project_storage)
 d1_project={'read_queries':sum_fields(project_d1,'readQueries'),'write_queries':sum_fields(project_d1,'writeQueries'),'rows_read':sum_fields(project_d1,'rowsRead'),'rows_written':sum_fields(project_d1,'rowsWritten')}
 d1_account={'rows_read':sum_fields(d1,'rowsRead'),'rows_written':sum_fields(d1,'rowsWritten')}
 advisories=[]
 if not workers:advisories.append('No Workers analytics groups returned for this UTC day; zero is not a confirmed usage total.')
 if not d1:advisories.append('No D1 analytics groups returned for this UTC day; zero is not a confirmed usage total.')
 if any((row['quantiles'].get('cpuTimeP99') or 0)>10000 for row in project_worker):advisories.append('Observed project CPU p99 is above the documented 10 ms Free limit; validate the unit and invocation detail in Dashboard. No automatic plan change or mitigation is performed.')
 output={
  'sampled_windows_utc':{'d1_workers_day_start':start,'r2_subscription_period_start':month_start,'r2_subscription_period_end':r2.get('current_period_end'),'end':end},
  'workers':{'groups_returned':len(workers),'account_requests_sampled':sum_fields(workers,'requests'),'account_errors_sampled':sum_fields(workers,'errors'),'free_daily_requests':100000,'free_cpu_us_per_invocation':10000,'project':[{ 'script':row['dimensions']['scriptName'],'status':row['dimensions']['status'],'requests':row['sum']['requests'],'errors':row['sum']['errors'],'cpu_p50_us':row['quantiles']['cpuTimeP50'],'cpu_p99_us':row['quantiles']['cpuTimeP99']} for row in project_worker]},
  'd1':{'groups_returned':len(d1),'account_daily_rows':d1_account,'project_daily':d1_project,'free_daily_rows':{'read':5000000,'written':100000},'free_storage_account_bytes':5*1024**3,'free_database_bytes':500*1024**2},
  'r2':{'operation_groups_returned':len(r2ops),'storage_groups_returned':len(r2storage),'account_monthly_operations':{'class_a':account_a,'class_b':account_b},'account_standard_daily_peak_bytes_sampled':account_storage,'project_monthly':{'class_a_operations':project_a,'class_b_operations':project_b,'delete_object_operations_free':project_delete},'project_standard_daily_peak':{'payload_bytes':peak,'objects':objects},'free_monthly':{'standard_storage_gb_month':10,'class_a_operations':1000000,'class_b_operations':10000000},'overage_prices_usd':{'standard_storage_per_gb_month':0.015,'class_a_per_million':4.50,'class_b_per_million':0.36}},
  'advisories':advisories,
  'notes':['Adaptive analytics are sampled operational signals, not an exact quota meter, bill, alert or hard cap.','Account-wide D1/Workers allowances may be shared with other workloads.','R2 charges can exceed the free allowance under the approved R2 subscription.','Pages build count and exact billable usage remain available in Cloudflare Dashboard; this command does not configure alerts.']}
 print(json.dumps(output,indent=2))

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);commands=parser.add_subparsers(dest='command',required=True)
 commands.add_parser('account');commands.add_parser('metrics')
 b=commands.add_parser('backup');b.add_argument('--directory',type=Path,default=Path('/workspace/.private-backups/cho-sach-cu'))
 d=commands.add_parser('restore-drill');d.add_argument('sql',type=Path)
 args=parser.parse_args()
 try:
  if args.command=='backup':backup(args.directory)
  elif args.command=='restore-drill':drill(args.sql)
  elif args.command=='account':account_check()
  else:metrics()
 except (OperationError,urllib.error.URLError,KeyError,sqlite3.Error) as e:
  # No URLs, headers, SQL rows or credentials in failure output.
  print('ERROR:',str(e) if isinstance(e,OperationError) else type(e).__name__);raise SystemExit(1)
