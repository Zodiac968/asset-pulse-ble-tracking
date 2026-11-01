"""Handler: api_lambda.lambda_handler. HTTP API v2 proxy integration."""
import json,uuid,math,statistics
from boto3.dynamodb.conditions import Key
from common import *
from localization_lambda import compute

def reply(status,data): return {'statusCode':status,'headers':{'Content-Type':'application/json'},'body':json.dumps(obj(data))}
def querypk(pk):
    out=[]; cursor=None
    while True:
        args={'KeyConditionExpression':Key('PK').eq(pk),'ConsistentRead':True}
        if cursor: args['ExclusiveStartKey']=cursor
        res=TABLE.query(**args); out+=res['Items']; cursor=res.get('LastEvaluatedKey')
        if not cursor: return out

def required_coords(body):
    cfg=config(); x=float(body['x']);y=float(body['y'])
    if not (0<=x<=float(cfg['width']) and 0<=y<=float(cfg['length'])): raise ValueError('Point outside room')
    return x,y

def latest_session(): return get('SYSTEM','CAL_SESSION')
def points(session_id): return sorted([x for x in querypk('CALPOINT#'+session_id)],key=lambda x:int(x['created_at']))

def fit_model(session_id):
    cfg=config(); pts=points(session_id)
    if len(pts)<3: raise ValueError('Collect at least three known positions')
    output={}
    for rid,anchor in cfg['receivers'].items():
        xs=[]; ys=[]; samples_by_point=[]
        for p in pts:
            batches=querypk('CAL#'+session_id+'#'+p['point_id']+'#'+rid)
            samples=[int(s) for batch in batches for s in batch.get('samples',[])]
            if len(samples)<8: continue
            distance=math.sqrt((float(p['x'])-float(anchor['x']))**2+(float(p['y'])-float(anchor['y']))**2+(float(cfg['asset_height'])-float(anchor.get('z',0)))**2)
            if distance<.25: continue
            xs.append(math.log10(distance));ys.append(statistics.median(samples));samples_by_point.append({'distance':round(distance,3),'count':len(samples),'median_rssi':statistics.median(samples)})
        if len(xs)<3 or max(xs)-min(xs)<.15:
            output[rid]={'accepted':False,'error':'Not enough measurements at sufficiently different distances'};continue
        xb=statistics.mean(xs);yb=statistics.mean(ys);den=sum((x-xb)**2 for x in xs)
        slope=sum((x-xb)*(y-yb) for x,y in zip(xs,ys))/den
        p0=yb-slope*xb;n=-slope/10
        rmse=math.sqrt(sum((y-(p0-10*n*x))**2 for x,y in zip(xs,ys))/len(xs))
        valid=math.isfinite(n) and math.isfinite(p0) and 1<=n<=6 and -110<=p0<=-20
        output[rid]={'accepted':False,'valid':valid,'p0':round(p0,3),'n':round(n,3),'rmse_db':round(rmse,3),'points':samples_by_point,'warning':None if valid else 'Model outside plausible range; gather more samples'}
    return output

def handler(method,path,body):
    if method=='GET' and path=='/health': return {'ok':True,'server_time':ms()}
    if method=='GET' and path=='/asset': return compute()
    if method=='GET' and path=='/config': return obj(config())
    if method=='PUT' and path=='/config':
        width=float(body['width']);length=float(body['length']);height=float(body.get('height',3));asset_height=float(body.get('asset_height',1)); anchors=body['receivers']
        if not (1<=width<=100 and 1<=length<=100 and 1<=height<=20 and 0<=asset_height<=height): raise ValueError('Invalid room dimensions')
        if set(anchors)!=set(RECEIVERS): raise ValueError('Expected exactly three receivers')
        clean={}
        for rid,p in anchors.items():
            x,y,z=float(p['x']),float(p['y']),float(p.get('z',1))
            if not (0<=x<=width and 0<=y<=length and 0<=z<=height): raise ValueError('Receiver outside room')
            clean[rid]={'x':dec(x),'y':dec(y),'z':dec(z)}
        item={'PK':'SYSTEM','SK':'ROOM','width':dec(width),'length':dec(length),'height':dec(height),'asset_height':dec(asset_height),'receivers':clean,'updated_at':ms()}
        TABLE.put_item(Item=item)
        return {'ok':True,'configuration':obj(item),'warning':'Recalibrate after moving receivers or changing their heights'}
    if method=='GET' and path=='/calibration/models': return obj(models())
    if method=='GET' and path=='/calibration/status':
        s=latest_session()
        if not s: return {'state':'none','points':[]}
        res={'session':obj(s),'points':[]}
        for p in points(s['session_id']):
            counts={rid:sum(len(b.get('samples',[])) for b in querypk('CAL#'+s['session_id']+'#'+p['point_id']+'#'+rid)) for rid in RECEIVERS}
            res['points'].append({'point_id':p['point_id'],'x':float(p['x']),'y':float(p['y']),'counts':counts})
        return res
    if method=='POST' and path=='/calibration/start':
        existing=get('SYSTEM','CAL_ACTIVE')
        if existing and existing.get('state')=='collecting' and int(existing.get('expires_at',0))>ms(): raise ValueError('Stop active calibration point first')
        session=uuid.uuid4().hex[:12];item={'PK':'SYSTEM','SK':'CAL_SESSION','session_id':session,'state':'ready','created_at':ms()}
        TABLE.put_item(Item=item);TABLE.delete_item(Key={'PK':'SYSTEM','SK':'CAL_ACTIVE'})
        return {'ok':True,'session_id':session,'state':'ready'}
    if method=='POST' and path=='/calibration/point':
        sess=latest_session()
        if not sess or sess['state'] not in ('ready','sampling'): raise ValueError('Start calibration session first')
        active=get('SYSTEM','CAL_ACTIVE')
        if active and active.get('state')=='collecting' and int(active.get('expires_at',0))>ms(): raise ValueError('Stop current point first')
        x,y=required_coords(body);sid=sess['session_id'];point=uuid.uuid4().hex[:10];now=ms()
        put('CALPOINT#'+sid,'POINT#'+point,point_id=point,x=dec(x),y=dec(y),created_at=now)
        put('SYSTEM','CAL_ACTIVE',session_id=sid,point_id=point,state='collecting',started_at=now,expires_at=now+120000)
        put('SYSTEM','CAL_SESSION',session_id=sid,state='sampling',created_at=sess['created_at'])
        return {'ok':True,'point_id':point,'expires_at':now+120000}
    if method=='POST' and path=='/calibration/stop':
        item=get('SYSTEM','CAL_ACTIVE')
        if item:
            item['state']='stopped';TABLE.put_item(Item=item)
        return {'ok':True}
    if method=='POST' and path=='/calibration/fit':
        active=get('SYSTEM','CAL_ACTIVE')
        if active and active.get('state')=='collecting' and int(active.get('expires_at',0))>ms(): raise ValueError('Stop collection before fitting')
        sess=latest_session()
        if not sess: raise ValueError('No session')
        result=fit_model(sess['session_id'])
        put('SYSTEM','CAL_RESULT',session_id=sess['session_id'],models={r:{k:dec(v) if isinstance(v,float) else v for k,v in data.items() if k!='points'} for r,data in result.items()},updated_at=ms())
        return {'session_id':sess['session_id'],'models':result}
    if method=='POST' and path=='/calibration/apply':
        result=get('SYSTEM','CAL_RESULT')
        if not result: raise ValueError('Fit calibration first')
        if str(body.get('session_id'))!=str(result['session_id']): raise ValueError('Session mismatch')
        if not all(v.get('valid') for v in result['models'].values()): raise ValueError('Not all models passed validation')
        for rid,data in result['models'].items():
            put('SYSTEM','MODEL#'+rid,p0=data['p0'],n=data['n'],rmse_db=data['rmse_db'],accepted=True,session_id=result['session_id'],updated_at=ms())
        TABLE.delete_item(Key={'PK':'SYSTEM','SK':'CAL_ACTIVE'})
        return {'ok':True,'applied':list(RECEIVERS)}
    raise ValueError('Unknown method or path')

def lambda_handler(event, context):
    method=event.get('requestContext',{}).get('http',{}).get('method','GET');path=event.get('rawPath','/')
    try:
        body=json.loads(event.get('body') or '{}')
        return reply(200,handler(method,path,body))
    except (ValueError,KeyError,TypeError) as error: return reply(400,{'error':str(error)})
    except Exception as error:
        print('Internal error',repr(error)); return reply(500,{'error':'Internal server error'})
