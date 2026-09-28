"""Build a reproducible, attributed geographic snapshot for the SJL viewer."""
import argparse
import io
import json
import math
from pathlib import Path
import time
import urllib.parse
import urllib.request
from collections import Counter

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
CACHE = DATA / 'source'
DATA.mkdir(exist_ok=True)
CACHE.mkdir(exist_ok=True)
ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']
HEADERS = {'User-Agent': 'SJL-Accesible3D-AcademicPrototype/1.0'}

def osm(query, filename):
    path = CACHE / filename
    if path.exists():
        return json.loads(path.read_text(encoding='utf-8'))
    errors = []
    for endpoint in ENDPOINTS:
        try:
            print('Fetching', filename, endpoint, flush=True)
            req = urllib.request.Request(endpoint, data=urllib.parse.urlencode({'data': query}).encode(), headers=HEADERS)
            with urllib.request.urlopen(req, timeout=160) as response:
                raw = response.read()
            data = json.loads(raw)
            if 'remark' in data:
                raise RuntimeError(data['remark'])
            path.write_bytes(raw)
            return data
        except Exception as error:
            errors.append(str(error))
            print(type(error).__name__, str(error)[:160], flush=True)
    raise RuntimeError('; '.join(errors))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--stage', choices=['roads', 'all'], default='roads')
    args = parser.parse_args()
    roads = osm('[out:json][timeout:90];way[highway][name~"Wies|Canto Grande",i](-12.07,-77.05,-11.86,-76.93);out tags geom;', 'avenues.json')
    coords = [p for e in roads['elements'] for p in e.get('geometry', [])]
    extent = [min(p['lat'] for p in coords), min(p['lon'] for p in coords), max(p['lat'] for p in coords), max(p['lon'] for p in coords)]
    print(json.dumps({'avenue_ways': len(roads['elements']), 'names': list(Counter(e.get('tags',{}).get('name') for e in roads['elements']).items()), 'extent': extent}), flush=True)
    if args.stage == 'roads':
        return
    s,w,n,e = extent
    bbox = [round(s-.008,6), round(w-.012,6), round(n+.008,6), round(e+.012,6)]
    elements = {}
    timestamp = None
    for row in range(4):
        for column in range(2):
            tile_bounds = [bbox[0]+(bbox[2]-bbox[0])*row/4, bbox[1]+(bbox[3]-bbox[1])*column/2, bbox[0]+(bbox[2]-bbox[0])*(row+1)/4, bbox[1]+(bbox[3]-bbox[1])*(column+1)/2]
            bounds = ','.join(str(round(x,6)) for x in tile_bounds)
            query = f'[out:json][timeout:80];(way[highway]({bounds});way[building]({bounds});way[railway~"rail|light_rail"]({bounds});way[leisure~"park|pitch|garden"]({bounds});way[landuse~"residential|commercial|industrial|cemetery|grass"]({bounds});node[railway=station]({bounds});node[place~"suburb|neighbourhood"]({bounds}););out tags geom;'
            part = osm(query, f'features-{row}-{column}.json')
            for element in part['elements']:
                elements[(element['type'],element['id'])] = element
            timestamp = part.get('osm3s',{}).get('timestamp_osm_base')
            print('Sector',row,column,'elements',len(part['elements']),flush=True)
    features = {'elements':list(elements.values()),'osm3s':{'timestamp_osm_base':timestamp}}
    origin = [(s+n)/2, (w+e)/2]
    sy = 111132.0
    sx = 111320.0 * math.cos(math.radians(origin[0]))
    def point(p):
        return [round((p['lon']-origin[1])*sx,1), round(-(p['lat']-origin[0])*sy,1)]
    avenue_ids = {x['id'] for x in roads['elements']}
    out = {'origin': origin, 'metersPerDegree': [sy,sx], 'bbox': bbox, 'source': {'name':'OpenStreetMap contributors','url':'https://www.openstreetmap.org/copyright','license':'ODbL-1.0','timestamp':features.get('osm3s',{}).get('timestamp_osm_base')}, 'roads':[], 'buildings':[], 'areas':[], 'rails':[], 'places':[]}
    kept_tags = ['name','height','building:levels','building','highway','lanes','width','surface','oneway','bridge','layer','leisure','landuse','railway']
    for item in features['elements']:
        tags = item.get('tags',{})
        entry = {'id':item['id'], 'tags': {k:tags[k] for k in kept_tags if k in tags}}
        if item['type'] == 'node':
            out['places'].append({'id':item['id'],'name':tags.get('name',''),'type':tags.get('railway',tags.get('place')),'point':point(item)})
            continue
        geometry = item.get('geometry',[])
        if len(geometry)<2:
            continue
        entry['points'] = [point(p) for p in geometry]
        if 'building' in tags:
            out['buildings'].append(entry)
        elif 'highway' in tags:
            entry['corridor'] = item['id'] in avenue_ids
            out['roads'].append(entry)
        elif 'railway' in tags:
            out['rails'].append(entry)
        else:
            out['areas'].append(entry)
    terrain_bounds = [bbox[0]-.018,bbox[1]-.021,bbox[2]+.018,bbox[3]+.021]
    out['terrain'] = terrain(terrain_bounds, origin, sy, sx)
    out['summary'] = {key:len(out[key]) for key in ['roads','buildings','areas','rails','places']}
    (DATA/'sjl-geography.json').write_text(json.dumps(out,separators=(',',':'),ensure_ascii=False),encoding='utf-8')
    print('RESULT',json.dumps(out['summary']), 'bytes',(DATA/'sjl-geography.json').stat().st_size,flush=True)

def terrain(bounds,origin,sy,sx):
    from PIL import Image
    south,west,north,east = bounds
    zoom=12
    scale=2**zoom
    def tile(lon,lat):
        return ((lon+180)/360*scale,(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*scale)
    tiles={}
    x0,y0=tile(west,north); x1,y1=tile(east,south)
    for y in range(math.floor(y0),math.floor(y1)+1):
        for x in range(math.floor(x0),math.floor(x1)+1):
            name=f'terrarium-{zoom}-{x}-{y}.png'
            path=CACHE/name
            if not path.exists():
                url=f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{zoom}/{x}/{y}.png'
                print('Terrain',x,y,flush=True)
                with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=30) as response:
                    path.write_bytes(response.read())
            tiles[(x,y)]=Image.open(path).convert('RGB')
    columns=220; rows=300
    heights=[]
    for j in range(rows+1):
        lat=north+(south-north)*j/rows
        for i in range(columns+1):
            lon=west+(east-west)*i/columns
            x,y=tile(lon,lat)
            r,g,b=tiles[(int(x),int(y))].getpixel((min(255,int((x%1)*256)),min(255,int((y%1)*256))))
            heights.append(round(r*256+g+b/256-32768,1))
    return {'columns':columns,'rows':rows,'bounds':[round((west-origin[1])*sx,1),round(-(north-origin[0])*sy,1),round((east-origin[1])*sx,1),round(-(south-origin[0])*sy,1)],'heights':heights,'source':'Mapzen/AWS Terrain Tiles (Terrarium)','sourceUrl':'https://registry.opendata.aws/terrain-tiles/'}

if __name__=='__main__':
    main()
