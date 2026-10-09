# mh_rules.py — the converter's pure rules, with no Blender import, so tests can run them with plain
# python3 (tests/nora-model-rules.test.mjs). mh_to_vrm.py imports everything here.


def hex_rgb(h):
    """'#rrggbb' as three 0..1 floats (sRGB, as written)."""
    h = h.lstrip('#')
    if len(h) != 6:
        raise ValueError('a colour is #rrggbb, not ' + h)
    return [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def nearest_kept(name, parents, keep):
    """The nearest ancestor of `name` (or itself) that is kept, or None. `parents` maps a bone to its
    parent; a cycle in it ends the walk instead of hanging."""
    seen = set()
    n = name
    while n is not None and n not in seen:
        if n in keep:
            return n
        seen.add(n)
        n = parents.get(n)
    return None


def part_budgets(counts, weights, target):
    """Triangles per mesh so the total is about `target`: each mesh is cut in proportion to its weight
    (a heavier weight keeps more), none grows, and a kept-whole mesh (weight None) is not cut."""
    fixed = sum(c for c, w in zip(counts, weights) if w is None)
    room = max(0, target - fixed)
    cut = [(c, w) for c, w in zip(counts, weights) if w is not None]
    if not cut:
        return list(counts)
    lo, hi = 0.0, 1.0 / min(w for _, w in cut)
    for _ in range(60):
        k = (lo + hi) / 2
        got = sum(min(c, k * w * c) for c, w in cut)
        lo, hi = (k, hi) if got < room else (lo, k)
    k = (lo + hi) / 2
    return [c if w is None else int(min(c, k * w * c)) for c, w in zip(counts, weights)]


def barycentric(p, a, b, c):
    """Barycentric weights of `p` in triangle abc (3-tuples), clamped into the triangle and summing to 1.
    A degenerate triangle gives all the weight to `a`."""
    v0 = [b[i] - a[i] for i in range(3)]
    v1 = [c[i] - a[i] for i in range(3)]
    v2 = [p[i] - a[i] for i in range(3)]
    dot = lambda x, y: x[0] * y[0] + x[1] * y[1] + x[2] * y[2]
    d00, d01, d11 = dot(v0, v0), dot(v0, v1), dot(v1, v1)
    d20, d21 = dot(v2, v0), dot(v2, v1)
    den = d00 * d11 - d01 * d01
    if abs(den) < 1e-20:
        return (1.0, 0.0, 0.0)
    v = (d11 * d20 - d01 * d21) / den
    w = (d00 * d21 - d01 * d20) / den
    u = 1.0 - v - w
    u, v, w = max(0.0, u), max(0.0, v), max(0.0, w)
    s = (u + v + w) or 1.0
    return (u / s, v / s, w / s)


# ⚠ CARD COVERAGE IS SOFT, SO THE CUT IS LOW. Measured on a sample's atlases (raw values): of the
# texels a hair card covers at all, about 40% reach 0.5, and of an eyebrow's 0.2%. A 0.5 alpha test
# left the sample bald and browless; the pipeline's own viewer draws partial coverage with MSAA.
# These are the coverage values a texel must reach to be drawn.
CARD_CUTOFF = {'hair': 0.18, 'brow': 0.1, 'lash': 0.1}


def card_cutoff(kind, name):
    n = (name or '').lower()
    if 'brow' in n:
        return CARD_CUTOFF['brow']
    if 'lash' in n or kind == 'face_accessory':
        return CARD_CUTOFF['lash']
    return CARD_CUTOFF['hair']


def card_alpha(coverage, cutoff):
    """The alpha written for a coverage value: the exporter's MASK test is at 0.5 (a ROUND node), so
    coverage is scaled to put `cutoff` exactly there."""
    a = coverage * (0.5 / max(1e-3, cutoff))
    return 0.0 if a < 0 else 1.0 if a > 1 else a


# How much each part of her is worth in triangles: the face is what a close-up holds; the body is
# mostly under the clothes; hair cards lose their silhouette fast. Brow, lash and facial-hair cards
# are never cut.
IMPORTANCE = (('FaceMesh', 1.0), ('Hair', 0.75), ('Outfit', 0.55), ('BodyMesh', 0.4))
KEEP_WHOLE = ('Eyebrows', 'Eyelashes', 'Lash', 'Beard', 'Mustache')
OUTFIT_WEIGHT = 0.55
DEFAULT_WEIGHT = 0.6


def importance(name, is_outfit):
    if any(k in name for k in KEEP_WHOLE):
        return None
    if is_outfit:
        return OUTFIT_WEIGHT
    for k, w in IMPORTANCE:
        if k in name:
            return w
    return DEFAULT_WEIGHT


def vrm_attr(vrm_bone):
    """VRM humanoid bone name → the VRM add-on's property name ('leftUpperArm' → 'left_upper_arm')."""
    return ''.join('_' + ch.lower() if ch.isupper() else ch for ch in vrm_bone)
