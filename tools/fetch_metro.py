"""Extract the actual OSM subway alignment for the requested seven stations."""
import json
import math
import sys
from fetch_geography import osm, DATA
sys.path.insert(0, str(DATA.parent / 'tools' / '.deps'))
import networkx as nx
from shapely.geometry import LineString, Point
from shapely.ops import substring

query = '[out:json][timeout:90];way[railway=subway](-12.04,-77.025,-11.94,-76.97);out body geom;'
result = osm(query, 'metro-subway.json')
print('Ways:',len(result['elements']),flush=True)
geo = json.loads((DATA/'sjl-geography.json').read_text(encoding='utf-8'))
sy,sx = geo['metersPerDegree']
origin = geo['origin']
def local(p):
    return ((p['lon']-origin[1])*sx, -(p['lat']-origin[0])*sy)
graph = nx.Graph()
positions = {}
for way in result['elements']:
    if way.get('tags',{}).get('service') in ['yard','siding','crossover']:
        continue
    nodes = way.get('nodes',[])
    points = [local(p) for p in way.get('geometry',[])]
    for node,point in zip(nodes,points):
        positions[node] = point
    for a,b,pa,pb in zip(nodes,nodes[1:],points,points[1:]):
        graph.add_edge(a,b,weight=math.dist(pa,pb),way=way['id'])
names = ['Bay\u00f3var','Santa Rosa','San Mart\u00edn','San Carlos','Los Postes','Los Jardines','Pir\u00e1mide del Sol']
stations = [next(p for p in geo['places'] if p['name']==name and p['type']=='station') for name in names]
component = max(nx.connected_components(graph),key=len)
def nearest(point):
    return min(component,key=lambda node:math.dist(positions[node],point))
# Route on the connected mainline, retaining geometry beyond both terminal platforms.
north = [stations[0]['point'][0]+150,stations[0]['point'][1]-190]
south = [stations[-1]['point'][0]-190,stations[-1]['point'][1]+220]
nodepath = nx.shortest_path(graph,nearest(north),nearest(south),weight='weight')
line = LineString([positions[n] for n in nodepath])
station_info = []
for station in stations:
    s = line.project(Point(station['point']))
    p = line.interpolate(s)
    station_info.append({'name':station['name'],'osmPoint':station['point'],'point':[round(p.x,2),round(p.y,2)],'distance':round(s,2),'offset':round(p.distance(Point(station['point'])),2)})
assert all(a['distance']<b['distance'] for a,b in zip(station_info,station_info[1:])), 'Station order mismatch'
assert max(s['offset'] for s in station_info)<40, 'Rail alignment is too far from stations'
out = {'name':'Linea 1: Bayovar - Piramide del Sol','source':{'name':'OpenStreetMap contributors','url':'https://www.openstreetmap.org/copyright','license':'ODbL-1.0','timestamp':result['osm3s']['timestamp_osm_base'],'officialStations':'https://www.lineauno.pe/horarios/'},'points':[[round(x,2),round(z,2)] for x,z in line.coords],'stations':station_info,'length':round(line.length,2),'wayIds':sorted({graph.edges[a,b]['way'] for a,b in zip(nodepath,nodepath[1:])})}
(DATA/'sjl-metro.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(json.dumps({'length':out['length'],'points':len(out['points']),'stations':station_info},ensure_ascii=True,indent=2))
