"""Handler: telemetry_lambda.lambda_handler. IoT rule invokes this Lambda."""
import json, uuid
from botocore.exceptions import ClientError
from common import *

def lambda_handler(event, context):
    rid=event.get('receiver_id')
    if rid not in RECEIVERS or str(event.get('beacon_id','')).upper()!=MAC:
        return {'ignored':'unrecognized receiver or beacon'}
    try:
        raw=int(event['rssi']); filt=float(event['filtered_rssi'])
        if not (-127 <= raw <= 0 and -127 <= filt <= 0): raise ValueError('Invalid RSSI')
        samples=event.get('samples',[])
        if not isinstance(samples,list) or len(samples)>100: raise ValueError('samples must be an array of <=100 RSSI values')
        samples=[int(x) for x in samples]
        if any(x < -127 or x > 0 for x in samples): raise ValueError('Invalid sample')
        now=ms(); packet_id=str(event.get('message_id') or uuid.uuid4().hex)[:80]
        # A message ID should be unique per receiver per publish. Source timestamp helps
        # reject reordering. Rule-provided received_at is a server-side timestamp.
        stamped=int(event.get('received_at') or now)
        if abs(stamped-now)>120000: stamped=now
        try:
            TABLE.update_item(Key={'PK':ASSET,'SK':'RX#'+rid}, UpdateExpression='SET receiver_id=:r, beacon_id=:b, rssi=:raw, filtered_rssi=:f, packets=:p, updated_at=:t', ConditionExpression='attribute_not_exists(updated_at) OR updated_at <= :t',ExpressionAttributeValues={':r':rid,':b':MAC,':raw':raw,':f':dec(filt),':p':int(event.get('packets',0)),':t':stamped})
        except ClientError as e:
            if e.response['Error']['Code']!='ConditionalCheckFailedException': raise
        active=get('SYSTEM','CAL_ACTIVE')
        if active and active.get('state')=='collecting' and samples:
            start=int(active['started_at']); end=int(active.get('expires_at',start+120000))
            if start <= stamped <= end:
                # Batch item keyed by session, point, receiver and unique message ID.
                pk='CAL#'+str(active['session_id'])+'#'+str(active['point_id'])+'#'+rid
                TABLE.put_item(Item={'PK':pk,'SK':'BATCH#'+packet_id, 'samples':samples,'received_at':stamped,'ttl':int(now/1000)+86400},ConditionExpression='attribute_not_exists(PK)')
        return {'ok':True,'receiver':rid}
    except (ValueError,TypeError,KeyError) as e:
        print('Invalid payload',str(e)); return {'error':str(e)}
