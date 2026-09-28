"""Pin browser dependencies locally; the viewer needs no CDN at runtime."""
from pathlib import Path
from urllib.request import urlopen

root = Path(__file__).resolve().parents[1] / 'vendor'
files = {
    'three.module.js': 'https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.js',
    'OrbitControls.js': 'https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/controls/OrbitControls.js',
    'RoundedBoxGeometry.js': 'https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/geometries/RoundedBoxGeometry.js',
    'lucide.min.js': 'https://cdn.jsdelivr.net/npm/lucide@0.468.0/dist/umd/lucide.min.js',
    'bootstrap.min.css': 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
    'THREE-LICENSE.txt': 'https://cdn.jsdelivr.net/npm/three@0.166.1/LICENSE',
    'LUCIDE-LICENSE.txt': 'https://cdn.jsdelivr.net/npm/lucide@0.468.0/LICENSE',
    'BOOTSTRAP-LICENSE.txt': 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/LICENSE',
}
root.mkdir(exist_ok=True)
for name, url in files.items():
    path = root / name
    if not path.exists():
        with urlopen(url, timeout=40) as response:
            path.write_bytes(response.read())
    print(name, path.stat().st_size, flush=True)
