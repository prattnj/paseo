// Static-world mesh merger.
//
// The city's batched geometry already funnels through GeoBatch (src/geo.js) into
// a handful of InstancedMeshes, and traffic.js bakes every car into a single
// merged mesh — because the frame's real bottleneck is node count (per-object
// matrix + frustum + draw-call cost), not raw triangles. But the hand-authored
// landmarks (shipwreck, manor, arena, …) and the island terrain still add ~1600
// individual `THREE.Mesh` nodes straight to the scene, and each one is its own
// draw call in BOTH the main pass and the sun's shadow pass.
//
// mergeStatic() generalises the per-car merge to the whole static world: after
// every static builder has run — and BEFORE any actor or animated object is
// added — it bakes those loose meshes into one merged BufferGeometry per material
// (splitting only on shadow-casting), collapsing ~1600 nodes to a few dozen with
// pixel-identical output. Only opaque, untextured Lambert/Basic meshes are
// touched; transparent (water), textured, multi-material, and instanced meshes are
// left exactly as they are, as is anything tagged `mesh.userData.noMerge`.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Reduce a source geometry to a world-space, non-indexed geometry carrying only
// the attributes the merge needs (position, normal, and color iff the material
// is vertex-coloured). Uniform attribute layout per bucket is what lets
// mergeGeometries stitch them in one pass.
function bake(geom, worldMatrix, wantColor) {
  let g = geom.index ? geom.toNonIndexed() : geom.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.attributes.position.clone());
  out.setAttribute('normal', g.attributes.normal.clone());
  if (wantColor) {
    if (g.attributes.color) {
      out.setAttribute('color', g.attributes.color.clone());
    } else {
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3).fill(1); // untinted → white
      out.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
  }
  g.dispose();
  out.applyMatrix4(worldMatrix); // positions + normals into world space
  return out;
}

function mergeable(o) {
  if (!o.isMesh || o.isInstancedMesh) return false;
  if (o.userData && o.userData.noMerge) return false;
  const m = o.material;
  if (!m || Array.isArray(m)) return false;
  if (m.transparent || m.map || m.alphaMap || m.emissiveMap) return false;
  if (!(m.isMeshLambertMaterial || m.isMeshBasicMaterial)) return false;
  const g = o.geometry;
  return !!(g && g.attributes && g.attributes.position);
}

// Merged meshes are bucketed per material AND per coarse spatial CELL so each one
// stays regional (a compact bounding sphere the main-pass frustum can still cull)
// instead of a single map-spanning mesh that would draw every frame regardless of
// view. The shadow pass sees the whole island anyway, so it reaps the node-count
// win either way.
const CELL = 200;

// Merge every eligible static mesh under `root` in place. Returns a small stats
// object for logging.
export function mergeStatic(root) {
  root.updateMatrixWorld(true);

  const buckets = new Map();
  const remove = [];
  const box = new THREE.Box3();
  const center = new THREE.Vector3();
  root.traverse((o) => {
    if (!mergeable(o)) return;
    const m = o.material;
    const wantColor = !!m.vertexColors;
    const baked = bake(o.geometry, o.matrixWorld, wantColor);
    // spatial cell from the world-space geometry centre
    baked.computeBoundingBox();
    baked.boundingBox.getCenter(center);
    const cx = Math.round(center.x / CELL), cz = Math.round(center.z / CELL);
    const key = m.uuid + '|' + (o.castShadow ? 1 : 0) + '|' + cx + ',' + cz;
    let b = buckets.get(key);
    if (!b) { b = { mat: m, cast: o.castShadow, geos: [] }; buckets.set(key, b); }
    b.geos.push(baked);
    remove.push(o);
  });

  if (!buckets.size) return { before: 0, after: 0 };

  // detach the originals (and free their now-unused GPU geometry)
  for (const o of remove) {
    if (o.parent) o.parent.remove(o);
    o.geometry.dispose();
  }

  let after = 0;
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    for (const g of b.geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = true;
    root.add(mesh);
    after++;
  }

  // prune groups left empty by the merge, so the graph stays tidy
  const empties = [];
  root.traverse((o) => {
    if (o !== root && o.isGroup && o.children.length === 0) empties.push(o);
  });
  for (const o of empties) if (o.parent) o.parent.remove(o);

  return { before: remove.length, after };
}
