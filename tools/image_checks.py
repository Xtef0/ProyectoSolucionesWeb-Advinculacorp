"""Check rendered canvas screenshots, not a cleared WebGL drawing buffer."""
import json
from pathlib import Path
from PIL import Image, ImageStat, ImageChops

root = Path(__file__).resolve().parents[1] / 'qa'
results = {}
for name in ['metro-desktop.png', 'metro-mobile-390.png', 'metro-mobile-320.png', 'motion-a.png', 'motion-b.png']:
    image = Image.open(root / name).convert('RGB')
    sample = image.resize((200,200))
    stat = ImageStat.Stat(sample)
    colors = sample.getcolors(40001)
    largest_flat_fraction = max(count for count,_ in colors) / 40000
    assert min(stat.stddev) > 12, (name, 'Low pixel variance', stat.stddev)
    assert largest_flat_fraction < .6, (name, 'Mostly blank', largest_flat_fraction)
    assert len(colors) > 3000, (name, 'Insufficient rendered detail', len(colors))
    results[name] = {'dimensions':image.size,'channelStddev':stat.stddev,'uniqueSampleColors':len(colors),'largestFlatFraction':largest_flat_fraction,'nonblank':True}
before = Image.open(root / 'motion-a.png').convert('RGB')
after = Image.open(root / 'motion-b.png').convert('RGB')
diff = ImageChops.difference(before, after).convert('L')
histogram = diff.histogram()
changed = sum(histogram[15:]) / (diff.width * diff.height)
assert changed > .005, ('No visible motion', changed)
results['motion'] = {'changedPixelFraction':changed,'visible':True}
(root/'pixel-checks.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps(results,indent=2))
