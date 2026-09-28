"""Estimated urban massing inside blocks bounded by actual OSM roads.

These are NOT surveyed buildings. Existing footprints and mapped open spaces
are excluded. The separate output and viewer layer preserve that distinction.
"""
import json
import math
from pathlib import Path
import random
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools' / '.deps'))
from shapely.geometry import LineString, Polygon, Point, box
from shapely.ops import unary_union, polygonize
from shapely.affinity import rotate
from shapely.strtree import STRtree

d = json.loads((ROOT/'data/sjl-geography.json').read_text(encoding='utf-8'))
roads = [r for r in d['roads'] if r['tags'].get('highway') not in ['steps','footway','path','cycleway','proposed','construction']]
network = unary_union([LineString(r['points']) for r in roads])
blocks = [p for p in polygonize(network) if 450 < p.area < 85000 and p.area/p.length > 7]
exclusions = []
for item in d['buildings'] + d['areas']:
    tags = item['tags']
    if tags.get('landuse') in ['residential','commercial','industrial']:
        continue
    if len(item['points']) < 4:
        continue
    poly = Polygon(item['points']).buffer(0)
    if not poly.is_empty:
        exclusions.append(poly.buffer(1.8))
tree = STRtree(exclusions)
terrain = d['terrain']
x0,z0,x1,z1 = terrain['bounds']
cols, rows = terrain['columns'], terrain['rows']
def elevation(x,z):
    i = min(cols,max(0,round((x-x0)/(x1-x0)*cols)))
    j = min(rows,max(0,round((z-z0)/(z1-z0)*rows)))
    return terrain['heights'][j*(cols+1)+i]

rng = random.Random(11010)
result = []
for block in blocks:
    inside = block.buffer(-7)
    if inside.is_empty:
        continue
    nearby = tree.query(block, predicate='intersects')
    if len(nearby):
        inside = inside.difference(unary_union([exclusions[i] for i in nearby]))
    if inside.is_empty:
        continue
    rect = list(block.minimum_rotated_rectangle.exterior.coords)
    a,b = max(zip(rect,rect[1:]),key=lambda ab:math.dist(*ab))
    angle = math.degrees(math.atan2(b[1]-a[1],b[0]-a[0]))
    center = block.centroid
    aligned = rotate(inside,-angle,origin=center)
    loX,loZ,hiX,hiZ = aligned.bounds
    # Approximate 9-13 m frontages and 13-18 m depths, with small party-wall gaps.
    dx,dz = rng.uniform(9,13),rng.uniform(13,18)
    x = loX
    while x+dx < hiX:
        z = loZ
        while z+dz < hiZ:
            cell = box(x+.35,z+.4,x+dx-.35,z+dz-.4)
            if aligned.contains(cell):
                parcel = rotate(cell,angle,origin=center)
                cx,cz = parcel.centroid.coords[0]
                # Avoid artificial massing on steep bare hillsides.
                slope = max(abs(elevation(cx+22,cz)-elevation(cx-22,cz)),abs(elevation(cx,cz+22)-elevation(cx,cz-22)))
                if slope < 20:
                    floors = rng.choices([1,2,3,4,5],[12,30,35,20,3])[0]
                    result.append([round(cx,1),round(cz,1),round(dx-.7,1),round(dz-.8,1),round(math.radians(-angle),4),round(floors*2.9+rng.uniform(.2,.8),1),rng.randrange(16)])
            z += dz
        x += dx
out = {'description':'Estimated massing inside OSM street blocks, not surveyed footprints','source':'Derived from OpenStreetMap (ODbL-1.0)','blocks':len(blocks),'surfaces':[[[round(x,1),round(z,1)] for x,z in p.exterior.coords] for p in blocks], 'instances':result}
(ROOT/'data/sjl-massing.json').write_text(json.dumps(out,separators=(',',':')),encoding='utf-8')
print('Blocks',len(blocks),'estimated volumes',len(result),flush=True)
