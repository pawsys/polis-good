// Opinion math for Span. Ported in spirit from polis (math/src/polismath/math):
// PCA projection of the participant x statement vote matrix and k-means grouping.
// The bridging score lives in core.js.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function normalize(v) {
  const n = Math.sqrt(dot(v, v));
  if (n < 1e-12) return false;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return true;
}

// rows: array of arrays with 1 / -1 / 0 / null (null = not voted).
// Returns { points: [[x, y], ...], components, means }.
function pca2(rows) {
  const n = rows.length;
  const m = n ? rows[0].length : 0;
  if (n === 0 || m === 0) return { points: rows.map(() => [0, 0]), components: [], means: [] };

  // Column means over seen votes, used to impute missing votes (as polis does).
  const means = new Array(m).fill(0);
  for (let j = 0; j < m; j++) {
    let s = 0, c = 0;
    for (let i = 0; i < n; i++) if (rows[i][j] !== null) { s += rows[i][j]; c++; }
    means[j] = c ? s / c : 0;
  }
  let X = rows.map((r) => r.map((v, j) => (v === null ? 0 : v - means[j])));

  const rand = mulberry32(42);
  const components = [];
  for (let c = 0; c < 2; c++) {
    let v = Array.from({ length: m }, () => rand() - 0.5);
    if (!normalize(v)) break;
    let ok = true;
    for (let iter = 0; iter < 100; iter++) {
      const Xv = X.map((r) => dot(r, v));
      const next = new Array(m).fill(0);
      for (let i = 0; i < n; i++) {
        const w = Xv[i];
        if (w === 0) continue;
        const r = X[i];
        for (let j = 0; j < m; j++) next[j] += r[j] * w;
      }
      if (!normalize(next)) { ok = false; break; }
      let diff = 0;
      for (let j = 0; j < m; j++) diff += Math.abs(next[j] - v[j]);
      v = next;
      if (diff < 1e-9) break;
    }
    if (!ok) { components.push(new Array(m).fill(0)); continue; }
    // Stable sign: largest-magnitude loading is positive.
    let big = 0;
    for (let j = 1; j < m; j++) if (Math.abs(v[j]) > Math.abs(v[big])) big = j;
    if (v[big] < 0) v = v.map((x) => -x);
    components.push(v);
    // Deflate.
    X = X.map((r) => {
      const w = dot(r, v);
      return r.map((x, j) => x - w * v[j]);
    });
  }
  while (components.length < 2) components.push(new Array(m).fill(0));

  // Project. Sparse voters are pushed outward by sqrt(m / seen), like polis,
  // so people who voted on little do not all pile up in the center.
  const points = rows.map((r) => {
    let seen = 0;
    const centered = r.map((v, j) => {
      if (v === null) return 0;
      seen++;
      return v - means[j];
    });
    const scale = seen ? Math.sqrt(m / seen) : 0;
    return [dot(centered, components[0]) * scale, dot(centered, components[1]) * scale];
  });
  return { points, components, means };
}

function dist2(a, b) {
  const dx = a[0] - b[0], dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function kmeans(points, k) {
  // Farthest-first init: deterministic and well spread.
  const centers = [points[0].slice()];
  while (centers.length < k) {
    let best = 0, bestD = -1;
    for (let i = 0; i < points.length; i++) {
      let d = Infinity;
      for (const c of centers) d = Math.min(d, dist2(points[i], c));
      if (d > bestD) { bestD = d; best = i; }
    }
    centers.push(points[best].slice());
  }
  let labels = new Array(points.length).fill(0);
  for (let iter = 0; iter < 50; iter++) {
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      let b = 0, bd = Infinity;
      for (let c = 0; c < k; c++) {
        const d = dist2(points[i], centers[c]);
        if (d < bd) { bd = d; b = c; }
      }
      if (labels[i] !== b) { labels[i] = b; changed = true; }
    }
    const sums = Array.from({ length: k }, () => [0, 0, 0]);
    for (let i = 0; i < points.length; i++) {
      const s = sums[labels[i]];
      s[0] += points[i][0]; s[1] += points[i][1]; s[2]++;
    }
    for (let c = 0; c < k; c++) if (sums[c][2]) centers[c] = [sums[c][0] / sums[c][2], sums[c][1] / sums[c][2]];
    if (!changed && iter > 0) break;
  }
  return { labels, centers };
}

function silhouette(points, labels, k) {
  const n = points.length;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const sum = new Array(k).fill(0), cnt = new Array(k).fill(0);
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      sum[labels[j]] += Math.sqrt(dist2(points[i], points[j]));
      cnt[labels[j]]++;
    }
    const own = labels[i];
    if (!cnt[own]) continue; // singleton contributes 0
    const a = sum[own] / cnt[own];
    let b = Infinity;
    for (let c = 0; c < k; c++) if (c !== own && cnt[c]) b = Math.min(b, sum[c] / cnt[c]);
    if (b === Infinity) continue;
    total += (b - a) / Math.max(a, b);
  }
  return total / n;
}

// Picks k in 2..maxK by silhouette. Returns labels relabelled so group 0 is the
// leftmost centroid, which keeps group colors reasonably stable between runs.
function cluster(points, maxK = 5) {
  const n = points.length;
  if (n < 6) return { labels: new Array(n).fill(0), k: n ? 1 : 0 };
  // Silhouette is O(n^2); sample for big polls.
  let sampleIdx = null;
  if (n > 600) {
    const rand = mulberry32(7);
    sampleIdx = [];
    for (let i = 0; i < n; i++) if (rand() < 600 / n) sampleIdx.push(i);
  }
  let best = null;
  for (let k = 2; k <= Math.min(maxK, Math.floor(n / 3)); k++) {
    const { labels, centers } = kmeans(points, k);
    const sizes = new Array(k).fill(0);
    labels.forEach((l) => sizes[l]++);
    if (sizes.some((s) => s < 2)) continue;
    const pts = sampleIdx ? sampleIdx.map((i) => points[i]) : points;
    const lbs = sampleIdx ? sampleIdx.map((i) => labels[i]) : labels;
    const score = silhouette(pts, lbs, k);
    // Prefer fewer groups unless more groups are clearly better.
    if (!best || score > best.score + 0.02) best = { labels, centers, k, score };
  }
  if (!best) return { labels: new Array(n).fill(0), k: 1 };
  const order = best.centers.map((c, i) => [c[0], i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const remap = new Array(best.k);
  order.forEach((old, idx) => { remap[old] = idx; });
  return { labels: best.labels.map((l) => remap[l]), k: best.k, silhouette: best.score };
}

function convexHull(pts) {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

module.exports = { pca2, kmeans, cluster, convexHull, mulberry32 };
