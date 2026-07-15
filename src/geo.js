import * as THREE from 'three';

// Gable-roof prism template: unit size (1x1x1), base at y=0, ridge along X.
function prismGeometry() {
  const x = 0.5, z = 0.5, h = 1;
  // prettier-ignore
  const pos = [
    // south slope
    -x, 0, z,  x, 0, z,  x, h, 0,   -x, 0, z,  x, h, 0,  -x, h, 0,
    // north slope
    x, 0, -z,  -x, 0, -z,  -x, h, 0,   x, 0, -z,  -x, h, 0,  x, h, 0,
    // east gable
    x, 0, z,  x, 0, -z,  x, h, 0,
    // west gable
    -x, 0, -z,  -x, 0, z,  -x, h, 0,
    // bottom
    -x, 0, -z,  x, 0, -z,  x, 0, z,   -x, 0, -z,  x, 0, z,  -x, 0, z,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

const TEMPLATES = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  cyl: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cylT: () => new THREE.CylinderGeometry(0.38, 0.5, 1, 8), // tapered (trunks, poles)
  cone: () => new THREE.ConeGeometry(0.5, 1, 7),
  // square pyramid, base vertices on the diagonals (roofs over square towers)
  pyr: () => new THREE.ConeGeometry(0.5, 1, 4, 1, false, Math.PI / 4),
  ico: () => new THREE.IcosahedronGeometry(0.5, 0),
  prism: prismGeometry,
};

// Batches primitives into a few InstancedMeshes (one per template) with
// per-instance colors. Fast to build even with tens of thousands of parts.
export class GeoBatch {
  constructor() {
    this.lists = {};
    for (const k of Object.keys(TEMPLATES)) this.lists[k] = [];
  }

  _p(kind, x, y, z, sx, sy, sz, ry, hex) {
    this.lists[kind].push(x, y, z, sx, sy, sz, ry, hex);
  }

  // Box centered at (cx, cy, cz).
  box(cx, cy, cz, sx, sy, sz, hex, ry = 0) {
    this._p('box', cx, cy, cz, sx, sy, sz, ry, hex);
  }

  // Box whose BASE sits at y.
  boxB(cx, y, cz, sx, sy, sz, hex, ry = 0) {
    this._p('box', cx, y + sy / 2, cz, sx, sy, sz, ry, hex);
  }

  // Gable roof prism, base at y, ridge along local X.
  prism(cx, y, cz, sx, sy, sz, hex, ry = 0) {
    this._p('prism', cx, y, cz, sx, sy, sz, ry, hex); // template base is y=0
  }

  // Cylinder, base at y (taper approximated when rTop < rBot).
  cyl(cx, y, cz, rTop, rBot, h, hex) {
    const kind = rTop < rBot ? 'cylT' : 'cyl';
    this._p(kind, cx, y + h / 2, cz, rBot * 2, h, rBot * 2, 0, hex);
  }

  // Cone, base at y (seg 4 = square pyramid aligned to the axes).
  cone(cx, y, cz, r, h, hex, seg = 7) {
    this._p(seg === 4 ? 'pyr' : 'cone', cx, y + h / 2, cz, r * 2, h, r * 2, 0, hex);
  }

  // Faceted sphere, centered at cy.
  ico(cx, cy, cz, r, hex) {
    this._p('ico', cx, cy, cz, r * 2, r * 2, r * 2, 0, hex);
  }

  build() {
    const group = new THREE.Group();
    const material = new THREE.MeshLambertMaterial({ flatShading: true });
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();

    for (const [kind, list] of Object.entries(this.lists)) {
      const n = list.length / 8;
      if (!n) continue;
      const mesh = new THREE.InstancedMesh(TEMPLATES[kind](), material, n);
      for (let i = 0; i < n; i++) {
        const o = i * 8;
        p.set(list[o], list[o + 1], list[o + 2]);
        s.set(list[o + 3], list[o + 4], list[o + 5]);
        q.setFromAxisAngle(up, list[o + 6]);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, color.setHex(list[o + 7]));
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // instances span the whole city
      group.add(mesh);
      this.lists[kind] = [];
    }
    return group;
  }
}
