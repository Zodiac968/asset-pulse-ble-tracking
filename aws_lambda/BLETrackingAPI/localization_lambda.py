"""Handler: localization_lambda.lambda_handler. Invoke on EventBridge schedule (1 minute) OR via API GET /asset.
For 2-3 second updates, API GET /asset invokes the same position computation; frontend polling drives updates.
"""
from common import *

def estimate(readings_map,cfg,cal):
    usable=[]
    for rid,reading in readings_map.items():
        model=cal.get(rid)
        if not model or not model.get('accepted'): continue
        p0=float(model['p0']); n=float(model['n'])
        if n<=0: continue
        anchor=cfg['receivers'][rid]; r=float(reading['filtered_rssi'])
        d=max(.1,min(100.,10**((p0-r)/(10*n))))
        usable.append((rid,float(anchor['x']),float(anchor['y']),float(anchor.get('z',0)),d))
    if len(usable)<3:
        return {'status':'insufficient_data','x':None,'y':None,'current_zone':'Unknown','receivers_used':len(usable)}
    width=float(cfg['width']); length=float(cfg['length']); az=float(cfg.get('asset_height',0))
    # Bounded coarse-to-fine least-squares search, avoids SciPy dependency in Lambda.
    def loss(x,y):
        return sum((math.sqrt((x-a)**2+(y-b)**2+(az-z)**2)-d)**2 for _,a,b,z,d in usable)
    best=(float('inf'),0.,0.)
    for ix in range(31):
        for iy in range(31):
            x=width*ix/30; y=length*iy/30; v=loss(x,y)
            if v<best[0]: best=(v,x,y)
    _,x,y=best
    step=max(width,length)/10
    for _ in range(35):
        candidates=[(max(0,min(width,x+dx*step)),max(0,min(length,y+dy*step))) for dx,dy in ((0,0),(1,0),(-1,0),(0,1),(0,-1),(1,1),(-1,-1),(1,-1),(-1,1))]
        _,x,y=min((loss(a,b),a,b) for a,b in candidates)
        step*=.65
    rmse=math.sqrt(loss(x,y)/len(usable))
    nearest=min(usable,key=lambda u:(x-u[1])**2+(y-u[2])**2)[0]
    zone={'esp32-a':'Zone A','esp32-b':'Zone B','esp32-c':'Zone C'}[nearest]
    return {'status':'estimated','x':round(x,3),'y':round(y,3),'current_zone':zone,'nearest_receiver':nearest,'receivers_used':len(usable),'range_residual_rmse_m':round(rmse,3),'method':'bounded_range_least_squares'}

def compute():
    now=ms(); cfg=config(); live=readings(now); result=estimate(live,cfg,models()); result['updated_at']=now;result['beacon_id']=MAC;result['asset_id']=ASSET
    result['receivers']={r:obj(v) for r,v in live.items()}
    # Position is computed on demand and saved for optional inspection.
    TABLE.put_item(Item={'PK':ASSET,'SK':'POSITION',**{k:dec(v) if isinstance(v,float) else v for k,v in result.items() if k!='receivers'},'readings':{r:dec(v['filtered_rssi']) for r,v in live.items()}})
    return result

def lambda_handler(event,context): return compute()
