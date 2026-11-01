import os, time, json, math
from decimal import Decimal
import boto3
from botocore.exceptions import ClientError
TABLE = boto3.resource('dynamodb').Table(os.getenv('TABLE_NAME', 'AssetTracking'))
ASSET = 'ASSET#01'
RECEIVERS = ('esp32-a', 'esp32-b', 'esp32-c')
MAC = 'B4:A7:24:16:BA:8A'
STALE_MS = int(os.getenv('STALE_MS', '20000'))
def ms(): return int(time.time()*1000)
def dec(x): return Decimal(str(x))
def obj(item):
    if isinstance(item, Decimal): return float(item)
    if isinstance(item, dict): return {k:obj(v) for k,v in item.items()}
    if isinstance(item, list): return [obj(v) for v in item]
    return item
def get(pk, sk): return TABLE.get_item(Key={'PK':pk,'SK':sk}, ConsistentRead=True).get('Item')
def put(pk,sk,**attrs): TABLE.put_item(Item={'PK':pk,'SK':sk,**attrs})
def config():
    return get('SYSTEM','ROOM') or {'PK':'SYSTEM','SK':'ROOM','width':Decimal('6'),'length':Decimal('4'),'height':Decimal('3'),'asset_height':Decimal('1'), 'receivers':{'esp32-a':{'x':Decimal('.5'),'y':Decimal('.5'),'z':Decimal('1')},'esp32-b':{'x':Decimal('5.5'),'y':Decimal('.5'),'z':Decimal('1')},'esp32-c':{'x':Decimal('3'),'y':Decimal('3.5'),'z':Decimal('1')}}}
def models():
    return {r:get('SYSTEM','MODEL#'+r) for r in RECEIVERS}
def readings(now=None):
    now = ms() if now is None else now
    values={}
    for r in RECEIVERS:
        v=get(ASSET,'RX#'+r)
        if v and 0 <= now-int(v.get('updated_at',0)) <= STALE_MS:
            values[r]=v
    return values
