// 3D Mode: the same match, played as a stickman walking around on the board.
// app.js still owns the rules; this file only draws the board and turns shovel and flag swings into reveal/flag calls.
(() => {
  const blockHeight = 0.42;
  const floorHeight = 0.06;
  const reach = 5.2;
  const eyeHeight = 1.6;
  const hipHeight = 0.9;
  const digTime = 0.52;
  const digImpact = 0.27;
  const plantTime = 0.46;
  const plantImpact = 0.25;
  const helpKey = 'offline-minesweeper-3d-help-v1';
  const looks = {
    modern: {
      sky: '#0b0e15', fog: 28, ground: '#0f151e', grid: '#1b2533', rim: '#1d2633',
      block: ['#2e3a4d', '#43536b', '#1d2532'], floor: ['#151c26', '#1f2836'],
      stick: '#eef3fa', ink: '#0b0e15', dust: '#8fa0b6', outline: '#5cf0d0', cloth: '#ff5d6c', exploded: '#ff5050',
      numbers: ['#6fcaff', '#79e8ad', '#ff9d9d', '#b1a2ff', '#ffbd80', '#77e2e8', '#ffffff', '#b7c1d0']
    },
    legacy: {
      sky: '#7aa7e8', fog: 0, ground: '#5d9b3b', grid: null, rim: '#808080',
      block: ['#c0c0c0', '#ffffff', '#808080'], floor: ['#bdbdbd', '#7b7b7b'],
      stick: '#111111', ink: '#000000', dust: null, outline: '#000000', cloth: '#ff0000', exploded: '#ff0000',
      numbers: ['#0000ff', '#008000', '#ff0000', '#000080', '#800000', '#008080', '#000000', '#808080']
    }
  };
  const coveredStates = new Set(['covered', 'xray', 'flag', 'wrong', 'planted']);

  let THREE = null;
  let world = null;
  let renderer = null;
  let loading = null;
  let startTicket = 0;

  function loadEngine() {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (!loading) loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'vendor/three.min.js';
      script.onload = () => resolve(window.THREE);
      script.onerror = () => reject(new Error('3D engine missing'));
      document.head.append(script);
    });
    return loading;
  }

  // ---- Small drawing helpers.
  function canvasTexture(size, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    draw(canvas.getContext('2d'), size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }

  function bevelTexture([face, light, dark], legacy) {
    return canvasTexture(64, (ctx, s) => {
      const edge = legacy ? 7 : 5;
      ctx.fillStyle = face;
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = light;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s, 0); ctx.lineTo(s - edge, edge); ctx.lineTo(edge, edge); ctx.lineTo(edge, s - edge); ctx.lineTo(0, s); ctx.fill();
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.moveTo(s, s); ctx.lineTo(0, s); ctx.lineTo(edge, s - edge); ctx.lineTo(s - edge, s - edge); ctx.lineTo(s - edge, edge); ctx.lineTo(s, 0); ctx.fill();
      if (!legacy) {
        const glow = ctx.createLinearGradient(0, 0, s, s);
        glow.addColorStop(0, '#ffffff14');
        glow.addColorStop(1, '#00000000');
        ctx.fillStyle = glow;
        ctx.fillRect(edge, edge, s - edge * 2, s - edge * 2);
      }
    });
  }

  function floorTexture([face, line], legacy) {
    return canvasTexture(64, (ctx, s) => {
      ctx.fillStyle = face;
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = line;
      ctx.lineWidth = legacy ? 3 : 2;
      if (legacy) {
        ctx.beginPath(); ctx.moveTo(1, s); ctx.lineTo(1, 1); ctx.lineTo(s, 1); ctx.stroke();
      } else {
        ctx.strokeRect(2, 2, s - 4, s - 4);
      }
    });
  }

  function digitTexture(digit, color, legacy) {
    return canvasTexture(128, (ctx, s) => {
      ctx.font = legacy ? 'bold 104px Tahoma, Verdana, Arial, sans-serif' : '800 100px Sora, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (!legacy) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
      }
      ctx.fillStyle = color;
      ctx.fillText(String(digit), s / 2, s / 2 + 6);
    });
  }

  function crossTexture() {
    return canvasTexture(64, (ctx, s) => {
      ctx.strokeStyle = '#ff2b2b';
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(12, 12); ctx.lineTo(s - 12, s - 12); ctx.moveTo(s - 12, 12); ctx.lineTo(12, s - 12); ctx.stroke();
    });
  }

  // Joins a few simple shapes into one, so each kind of object is a single draw call.
  function merge(parts) {
    const positions = [];
    const normals = [];
    parts.forEach(([geometry, matrix]) => {
      const flat = geometry.index ? geometry.toNonIndexed() : geometry;
      if (matrix) flat.applyMatrix4(matrix);
      positions.push(...flat.attributes.position.array);
      normals.push(...flat.attributes.normal.array);
    });
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    return result;
  }

  function at(x, y, z, rx = 0, ry = 0, rz = 0) {
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  }

  function mineGeometry(legacy) {
    const parts = [[new THREE.SphereGeometry(0.2, legacy ? 10 : 16, legacy ? 8 : 12)]];
    const spike = new THREE.CylinderGeometry(0.028, 0.028, 0.58, 6);
    [[0, 0, 0], [Math.PI / 2, 0, 0], [0, 0, Math.PI / 2], [0, 0, Math.PI / 4], [0, 0, -Math.PI / 4], [Math.PI / 4, 0, 0], [-Math.PI / 4, 0, 0]]
      .forEach(([rx, ry, rz]) => parts.push([spike.clone(), at(0, 0, 0, rx, ry, rz)]));
    return merge(parts);
  }

  function flagPoleGeometry() {
    return merge([
      [new THREE.CylinderGeometry(0.025, 0.025, 0.62, 6), at(-0.1, 0.31, 0)],
      [new THREE.CylinderGeometry(0.16, 0.2, 0.06, 10), at(-0.04, 0.03, 0)]
    ]);
  }

  function clothGeometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.09, 0.62, 0, -0.09, 0.36, 0, 0.24, 0.49, 0.02], 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  // An InstancedMesh that only draws the tiles currently using it.
  class Slots {
    constructor(geometry, material, size, scene, shadows) {
      this.mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, size));
      this.mesh.count = 0;
      this.mesh.frustumCulled = false;
      this.mesh.castShadow = shadows;
      this.mesh.receiveShadow = shadows;
      this.slotOf = new Map();
      this.tileAt = [];
      scene.add(this.mesh);
    }

    set(tile, matrix, color) {
      let slot = this.slotOf.get(tile);
      if (slot === undefined) {
        slot = this.tileAt.length;
        this.tileAt.push(tile);
        this.slotOf.set(tile, slot);
        this.mesh.count = this.tileAt.length;
      }
      this.mesh.setMatrixAt(slot, matrix);
      if (color) this.mesh.setColorAt(slot, color);
      this.mesh.instanceMatrix.needsUpdate = true;
      if (color) this.mesh.instanceColor.needsUpdate = true;
    }

    remove(tile) {
      const slot = this.slotOf.get(tile);
      if (slot === undefined) return;
      const last = this.tileAt.length - 1;
      if (slot !== last) {
        const moved = this.tileAt[last];
        const matrix = new THREE.Matrix4();
        this.mesh.getMatrixAt(last, matrix);
        this.mesh.setMatrixAt(slot, matrix);
        if (this.mesh.instanceColor) {
          const color = new THREE.Color();
          this.mesh.getColorAt(last, color);
          this.mesh.setColorAt(slot, color);
          this.mesh.instanceColor.needsUpdate = true;
        }
        this.tileAt[slot] = moved;
        this.slotOf.set(moved, slot);
      }
      this.tileAt.pop();
      this.slotOf.delete(tile);
      this.mesh.count = this.tileAt.length;
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ---- The stickman, doodled like Eraser's: limbs are pen strokes (thin at the ends, a little uneven)
  // and the head is a sketched circle that always faces the camera, like a drawing on paper.
  // Built facing -z with his right hand on +x. Arms and legs are two pieces each, so elbows and knees bend.
  function buildStickman(look, legacy) {
    const radius = 0.032;
    const line = 0;
    const fill = new THREE.MeshBasicMaterial({ color: look.stick });
    const ink = new THREE.MeshBasicMaterial({ color: look.ink, side: THREE.BackSide });
    // A shape plus a slightly fatter copy drawn inside out in ink, which reads as an outline from any angle.
    const inked = (shape, material = fill) => {
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(shape(0), material);
      mesh.castShadow = true;
      group.add(mesh);
      if (line) group.add(new THREE.Mesh(shape(line), ink));
      return group;
    };
    const capsule = length => inked(() => strokeGeometry(radius, length));
    const limb = (parent, x, y, upper, lower) => {
      const top = new THREE.Group();
      top.position.set(x, y, 0);
      const bone = capsule(upper);
      bone.position.y = -upper / 2;
      const joint = new THREE.Group();
      joint.position.y = -upper;
      const fore = capsule(lower);
      fore.position.y = -lower / 2;
      const end = new THREE.Group();
      end.position.y = -lower;
      joint.add(fore, end);
      top.add(bone, joint);
      parent.add(top);
      return { top, joint, end };
    };

    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const hips = new THREE.Group();
    hips.position.y = hipHeight;
    body.add(hips);
    const torso = new THREE.Group();
    hips.add(torso);
    const spine = capsule(0.46);
    spine.position.y = 0.23;
    torso.add(spine);
    // The head floats just above the body, the way stick figures are drawn.
    const head = new THREE.Group();
    head.position.y = 0.73;
    const sketch = new THREE.Sprite(new THREE.SpriteMaterial({ map: headTexture(legacy ? '#000000' : '#0b0e15', legacy ? null : look.stick), transparent: true }));
    sketch.scale.set(0.6, 0.6, 1);
    // A plain ball inside the drawing, only so the head still casts a round shadow.
    const shadowCaster = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    shadowCaster.castShadow = true;
    head.add(sketch, shadowCaster);
    torso.add(head);
    const legs = [limb(hips, -0.07, 0, 0.42, 0.42), limb(hips, 0.07, 0, 0.42, 0.42)];
    const arms = [limb(torso, -0.05, 0.45, 0.3, 0.3), limb(torso, 0.05, 0.45, 0.3, 0.3)];

    // The tools are drawn the same way. The shovel carries on the line of the right forearm.
    const flat = color => new THREE.MeshBasicMaterial({ color });
    const wood = flat(legacy ? '#7a4a1a' : '#a8682e');
    const shovel = new THREE.Group();
    const handle = inked(extra => new THREE.CylinderGeometry(0.03 + extra, 0.03 + extra, 1 + extra * 2, 8), wood);
    handle.position.y = -0.2;
    const grip = inked(extra => new THREE.BoxGeometry(0.2 + extra * 2, 0.05 + extra * 2, 0.05 + extra * 2), wood);
    grip.position.y = 0.3;
    const spade = new THREE.Shape([[-0.13, 0.12], [0.13, 0.12], [0.13, -0.07], [0, -0.2], [-0.13, -0.07]].map(([x, y]) => new THREE.Vector2(x, y)));
    const blade = inked(extra => {
      const geometry = new THREE.ExtrudeGeometry(spade, { depth: 0.03, bevelEnabled: false });
      geometry.translate(0, 0, -0.015);
      if (extra) geometry.scale(1 + extra * 5, 1 + extra * 5, 1 + extra * 30);
      return geometry;
    }, flat(legacy ? '#9a9a9a' : '#cfd8e3'));
    blade.position.y = -0.82;
    shovel.add(handle, grip, blade);
    arms[1].end.add(shovel);

    // The flag stays upright in the left fist (see applyPose), with a spike below the hand for planting.
    const flag = new THREE.Group();
    flag.position.y = 0.05;
    const pole = inked(extra => new THREE.CylinderGeometry(0.022 + extra, 0.022 + extra, 1 + extra * 2, 8), flat(legacy ? '#000000' : '#f2f5f9'));
    pole.position.y = 0.15;
    const cloth = new THREE.Mesh(clothGeometry(), new THREE.MeshBasicMaterial({ color: look.cloth, side: THREE.DoubleSide }));
    cloth.scale.setScalar(1.2);
    cloth.position.set(0.11, -0.1, 0);
    flag.add(pole, cloth);
    arms[0].end.add(flag);

    return { root, body, hips, torso, head, legs, arms, shovel, flag };
  }

  // A pen stroke: an even line with round tips, slightly uneven along its length and a little different each time.
  function strokeGeometry(radius, length) {
    const points = [];
    const total = length + radius * 2;
    const steps = 14;
    const weight = 0.9 + Math.random() * 0.25;
    const wobble = Math.random() * Math.PI * 2;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      // Round caps: full width everywhere except the last radius at each end.
      const fromEnd = Math.min(t, 1 - t) * total;
      const cap = fromEnd >= radius ? 1 : Math.sqrt(Math.max(0, 1 - ((radius - fromEnd) / radius) ** 2));
      const unevenness = 1 + Math.sin(t * 6 + wobble) * 0.1;
      points.push(new THREE.Vector2(Math.max(0.0001, radius * weight * cap * unevenness), -total / 2 + t * total));
    }
    return new THREE.LatheGeometry(points, 8);
  }

  // The head: a wobbly white circle traced twice in ink, with a slanted band, the way you'd scribble it.
  function headTexture(ink, glow) {
    return canvasTexture(256, (ctx, size) => {
      const c = size / 2;
      const loop = (radius, jitter, turns = 1, start = 0) => {
        ctx.beginPath();
        const steps = 48 * turns;
        for (let i = 0; i <= steps; i += 1) {
          const a = start + (i / 48) * Math.PI * 2;
          const r = radius + Math.sin(a * 3 + jitter) * 3 + Math.sin(a * 5 + jitter * 2) * 1.5;
          const x = c + Math.cos(a) * r;
          const y = c + Math.sin(a) * r;
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
      };
      if (glow) {
        ctx.shadowColor = glow;
        ctx.shadowBlur = 10;
      }
      loop(92, 0.4);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = ink;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 11;
      loop(94, 1.3, 1.08, -0.4);
      ctx.stroke();
      ctx.lineWidth = 4;
      loop(99, 2.6, 0.55, 2.1);
      ctx.stroke();
      // The band: two quick strokes across the head.
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(c - 92, c - 6);
      ctx.quadraticCurveTo(c, c - 34, c + 94, c - 44);
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(c - 80, c + 8);
      ctx.quadraticCurveTo(c + 4, c - 18, c + 86, c - 28);
      ctx.stroke();
    });
  }

  // ---- Poses. Angles in radians: +x on a hip or shoulder swings the limb forward, a negative knee bends the shin back,
  // a positive elbow folds the forearm forward, and a negative lean tips the upper body forward.
  const poseKeys = ['hipY', 'lean', 'twist', 'head', 'lHip', 'lHipZ', 'lKnee', 'rHip', 'rHipZ', 'rKnee', 'lSh', 'lShZ', 'lEl', 'rSh', 'rShZ', 'rEl'];

  function mix(a, b, t) {
    const out = {};
    poseKeys.forEach(key => { out[key] = (a[key] || 0) + ((b[key] || 0) - (a[key] || 0)) * t; });
    return out;
  }

  function smooth(t) {
    const c = Math.min(1, Math.max(0, t));
    return c * c * (3 - 2 * c);
  }

  // Plays [time, pose] keys on top of a base pose; a null key is the base itself, missing joints keep the base value.
  function keyframes(keys, t, base) {
    const full = keys.map(([time, pose]) => [time, pose ? { ...base, ...pose } : base]);
    for (let i = 1; i < full.length; i += 1) {
      if (t <= full[i][0]) return mix(full[i - 1][1], full[i][1], smooth((t - full[i - 1][0]) / (full[i][0] - full[i - 1][0])));
    }
    return full[full.length - 1][1];
  }

  function idlePose(t) {
    const breathe = Math.sin(t * 2.4);
    return {
      hipY: breathe * 0.012, lean: -0.04 + breathe * 0.015, twist: 0, head: 0,
      lHip: 0.05, lHipZ: -0.08, lKnee: -0.08, rHip: -0.05, rHipZ: 0.08, rKnee: -0.12,
      lSh: 0.2, lShZ: -0.22, lEl: 1.2 + breathe * 0.04, rSh: 0.42, rShZ: 0.2, rEl: 0.4 + breathe * 0.03
    };
  }

  function movePose(phase, run) {
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    const legSwing = run ? 0.95 : 0.6;
    const bend = run ? 1.5 : 0.9;
    const armSwing = run ? 0.9 : 0.45;
    return {
      hipY: -Math.abs(s) * (run ? 0.07 : 0.035) - (run ? 0.04 : 0), lean: run ? -0.3 : -0.08, twist: s * (run ? 0.18 : 0.1), head: run ? 0.15 : 0,
      lHip: s * legSwing, lHipZ: -0.05, lKnee: -(0.1 + Math.max(0, c) * bend),
      rHip: -s * legSwing, rHipZ: 0.05, rKnee: -(0.1 + Math.max(0, -c) * bend),
      lSh: 0.25 - s * armSwing * 0.5, lShZ: -0.25, lEl: 1.2, rSh: 0.45 + s * armSwing, rShZ: 0.2, rEl: run ? 1.1 : 0.5
    };
  }

  function airPose(vy) {
    const rising = Math.max(0, Math.min(1, vy / 6));
    return {
      hipY: 0, lean: -0.12, twist: 0, head: -0.1,
      lHip: 0.95, lHipZ: -0.1, lKnee: -1.4 + rising * 0.3, rHip: 0.1 - rising * 0.3, rHipZ: 0.1, rKnee: -0.45,
      lSh: 0.7, lShZ: -0.9, lEl: 1, rSh: 1 + rising * 0.7, rShZ: 0.75, rEl: 0.6
    };
  }

  // Shovel: wind up over the shoulder, slam it into the tile in front, pull back.
  function digPose(t, base) {
    const strike = { rSh: 1.05, rShZ: 0.1, rEl: 0.15, lean: -0.55, twist: -0.12, hipY: -0.13, head: 0.35, lHip: 0.45, lKnee: -0.6, rHip: -0.15, rKnee: -0.5, lSh: -0.2, lShZ: -0.6 };
    return keyframes([
      [0, null],
      [0.19, { rSh: 2.7, rShZ: 0.15, rEl: 0.5, lean: 0.12, twist: 0.3, head: -0.15, lSh: 0.5, lShZ: -0.5 }],
      [digImpact, strike],
      [0.36, { ...strike, rSh: 1.1, lean: -0.5 }],
      [digTime, null]
    ], t, base);
  }

  // Flag: raise it high, stab it down into the block.
  function plantPose(t, base) {
    const stab = { lSh: 1.15, lShZ: -0.1, lEl: 0.1, lean: -0.45, twist: 0.1, hipY: -0.12, head: 0.3, rHip: 0.4, rKnee: -0.55, lHip: -0.1, lKnee: -0.45, rSh: 0.2 };
    return keyframes([
      [0, null],
      [0.16, { lSh: 2.5, lShZ: -0.15, lEl: 0.3, lean: 0.1, twist: -0.2, head: -0.1 }],
      [plantImpact, stab],
      [0.34, { ...stab, lSh: 1.2 }],
      [plantTime, null]
    ], t, base);
  }

  function cheerPose(t) {
    const wave = Math.sin(t * 9);
    return {
      hipY: 0, lean: 0.08, twist: 0, head: -0.25,
      lHip: 0.15, lHipZ: -0.15, lKnee: -0.3, rHip: 0.15, rHipZ: 0.15, rKnee: -0.3,
      lSh: 2.9, lShZ: -0.45 - wave * 0.15, lEl: 0.15, rSh: 2.9, rShZ: 0.45 + wave * 0.15, rEl: 0.15
    };
  }

  function flailPose(t) {
    return {
      hipY: 0, lean: 0.2, twist: Math.sin(t * 13) * 0.2, head: -0.3,
      lHip: 0.9 + Math.sin(t * 21) * 0.4, lHipZ: -0.3, lKnee: -0.8, rHip: -0.3 + Math.cos(t * 19) * 0.4, rHipZ: 0.3, rKnee: -1,
      lSh: 1.6 + Math.sin(t * 25) * 0.8, lShZ: -1.2, lEl: 0.6, rSh: 1.6 + Math.cos(t * 23) * 0.8, rShZ: 1.2, rEl: 0.6
    };
  }

  function lyingPose(t) {
    // A few dazed twitches, then still.
    const twitch = t < 1.6 ? Math.sin(t * 22) * 0.12 * (1 - t / 1.6) : 0;
    return {
      hipY: 0, lean: 0, twist: 0, head: 0.2,
      lHip: 0.25 + twitch, lHipZ: -0.35, lKnee: -0.35, rHip: -0.1, rHipZ: 0.3, rKnee: -0.1 - twitch,
      lSh: 0.3, lShZ: -1.35, lEl: 0.35 + twitch, rSh: 0.2, rShZ: 1.3, rEl: 0.2
    };
  }

  // Sat down hard, leaning back on both hands, shaking his head.
  function sitPose(t) {
    const shake = t < 1.4 ? Math.sin(t * 18) * 0.25 * (1 - t / 1.4) : 0;
    return {
      hipY: -0.8, lean: 0.3, twist: shake, head: 0.2,
      lHip: 1.45, lHipZ: -0.15, lKnee: -0.35, rHip: 1.3, rHipZ: 0.15, rKnee: -0.7,
      lSh: -0.6, lShZ: -0.35, lEl: 0.1, rSh: -0.6, rShZ: 0.35, rEl: 0.1
    };
  }

  function applyPose(stick, pose) {
    stick.hips.position.y = hipHeight + pose.hipY;
    stick.torso.rotation.set(pose.lean, pose.twist, 0);
    stick.head.rotation.x = pose.head;
    const [leftLeg, rightLeg] = stick.legs;
    const [leftArm, rightArm] = stick.arms;
    leftLeg.top.rotation.set(pose.lHip, 0, pose.lHipZ);
    leftLeg.joint.rotation.x = pose.lKnee;
    rightLeg.top.rotation.set(pose.rHip, 0, pose.rHipZ);
    rightLeg.joint.rotation.x = pose.rKnee;
    leftArm.top.rotation.set(pose.lSh, 0, pose.lShZ);
    leftArm.joint.rotation.x = pose.lEl;
    rightArm.top.rotation.set(pose.rSh, 0, pose.rShZ);
    rightArm.joint.rotation.x = pose.rEl;
    // The flag stays upright in the fist whatever the arm is doing.
    stick.flag.rotation.x = -(pose.lSh + pose.lEl + pose.lean);
  }

  // ---- Building one board.
  function build(options) {
    const game = options.getGame();
    const legacy = options.legacy();
    const look = legacy ? looks.legacy : looks.modern;
    const touch = options.touch();
    const shadows = !legacy && !touch;
    const width = game.width;
    const height = game.height;
    const count = width * height;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(look.sky);
    if (look.fog) scene.fog = new THREE.Fog(look.sky, look.fog, look.fog + Math.max(width, height) * 1.6 + 20);

    scene.add(new THREE.HemisphereLight(legacy ? '#ffffff' : '#b9d8ff', legacy ? '#5d9b3b' : '#101820', legacy ? 1.6 : 1.3));
    const sun = new THREE.DirectionalLight(legacy ? '#ffffff' : '#fff1dc', legacy ? 1.6 : 2.2);
    sun.position.set(width * 0.35 + 6, 16, height * 0.25 + 9);
    if (shadows) {
      sun.castShadow = true;
      const span = Math.max(width, height) / 2 + 6;
      Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: 60 });
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.bias = -0.0008;
    }
    scene.add(sun, sun.target);

    const groundSize = Math.max(width, height) + 80;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize), new THREE.MeshLambertMaterial({ color: look.ground }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = shadows;
    scene.add(ground);
    if (look.grid) {
      const grid = new THREE.GridHelper(groundSize, groundSize, look.grid, look.grid);
      grid.position.y = 0.002;
      grid.material.transparent = true;
      grid.material.opacity = 0.5;
      scene.add(grid);
    }
    const rim = new THREE.Mesh(new THREE.BoxGeometry(width + 0.5, 0.05, height + 0.5), new THREE.MeshLambertMaterial({ color: look.rim }));
    rim.position.y = 0.025;
    rim.receiveShadow = shadows;
    scene.add(rim);

    const lambert = map => new THREE.MeshLambertMaterial({ map });
    const blocks = new Slots(new THREE.BoxGeometry(0.94, blockHeight, 0.94), lambert(bevelTexture(look.block, legacy)), count, scene, shadows);
    const floors = new Slots(new THREE.BoxGeometry(0.98, floorHeight, 0.98), lambert(floorTexture(look.floor, legacy)), count, scene, shadows);
    floors.mesh.castShadow = false;
    const digitPlane = new THREE.PlaneGeometry(0.8, 0.8);
    const digits = look.numbers.map((color, i) => {
      const slots = new Slots(digitPlane, new THREE.MeshBasicMaterial({ map: digitTexture(i + 1, color, legacy), transparent: true, depthWrite: false }), count, scene, false);
      return slots;
    });
    const mineMat = new THREE.MeshLambertMaterial({ color: legacy ? '#000000' : '#1b1f27', emissive: legacy ? '#000000' : '#120808' });
    const mineShape = mineGeometry(legacy);
    const mines = new Slots(mineShape, mineMat, count, scene, shadows);
    const ghosts = new Slots(mineShape, new THREE.MeshBasicMaterial({ color: '#ff5d6c', transparent: true, opacity: 0.45, depthWrite: false }), count, scene, false);
    const poles = new Slots(flagPoleGeometry(), new THREE.MeshLambertMaterial({ color: legacy ? '#000000' : '#d9e2ee' }), count, scene, shadows);
    const cloths = new Slots(clothGeometry(), new THREE.MeshLambertMaterial({ color: look.cloth, side: THREE.DoubleSide }), count, scene, shadows);
    const crosses = new Slots(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: crossTexture(), transparent: true, depthWrite: false }), count, scene, false);

    const stick = buildStickman(look, legacy);
    scene.add(stick.root);
    const outline = buildOutline(look, legacy);
    scene.add(outline.group);

    const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 400);
    const puffShape = new THREE.SphereGeometry(1, 8, 6);
    return {
      game, legacy, look, touch, scene, camera, sun, width, height, count, puffShape,
      blocks, floors, digits, mines, ghosts, poles, cloths, crosses, stick, outline,
      states: new Array(count).fill(''),
      animStart: new Float64Array(count),
      animFrom: new Array(count).fill(''),
      animating: new Set(),
      particles: [],
      flash: null,
      ring: null,
      shake: 0,
      won: false,
      origin: null
    };
  }

  // Minecraft-style block outline, made of 12 thin bars so it stays thick at any distance.
  function buildOutline(look, legacy) {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color: look.outline, transparent: !legacy, opacity: legacy ? 1 : 0.95, depthTest: true });
    const bars = Array.from({ length: 12 }, () => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
      group.add(bar);
      return bar;
    });
    let fill = null;
    if (!legacy) {
      fill = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.98), new THREE.MeshBasicMaterial({ color: look.outline, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
      fill.rotation.x = -Math.PI / 2;
      group.add(fill);
    }
    group.visible = false;
    return { group, bars, fill, thickness: legacy ? 0.025 : 0.04, height: -1 };
  }

  function shapeOutline(outline, h) {
    if (outline.height === h) return;
    outline.height = h;
    const t = outline.thickness;
    const s = 0.5 + t / 2 - 0.005;
    const top = h + t / 2;
    let i = 0;
    const put = (x, y, z, sx, sy, sz) => {
      const bar = outline.bars[i++];
      bar.position.set(x, y, z);
      bar.scale.set(sx, sy, sz);
    };
    [top, t / 2].forEach(y => {
      put(0, y, -s, 1 + t, t, t);
      put(0, y, s, 1 + t, t, t);
      put(-s, y, 0, t, t, 1 + t);
      put(s, y, 0, t, t, 1 + t);
    });
    [[-s, -s], [s, -s], [-s, s], [s, s]].forEach(([x, z]) => put(x, (h + t) / 2, z, t, h + t, t));
    if (outline.fill) outline.fill.position.y = h + 0.006;
  }

  // ---- Tiles.
  const scratch = { m: null, q: null, flat: null, v: null, s: null, tilt: null, euler: null };

  function tileX(w, index) { return (index % w.width) - w.width / 2 + 0.5; }
  function tileZ(w, index) { return Math.floor(index / w.width) - w.height / 2 + 0.5; }

  function tilted(x, y, z, scale, tilt) {
    scratch.v.set(x, y, z);
    scratch.s.set(scale, scale, scale);
    scratch.tilt.setFromEuler(scratch.euler.set(tilt * 0.5, 0, tilt));
    return scratch.m.compose(scratch.v, scratch.tilt, scratch.s);
  }

  function matrix(x, y, z, scale = 1, flat = false, sy = scale) {
    scratch.v.set(x, y, z);
    scratch.s.set(scale, sy, scale);
    return scratch.m.compose(scratch.v, flat ? scratch.flat : scratch.q, scratch.s);
  }

  function ease(p) { return 1 - (1 - p) ** 3; }
  function pop(p) {
    const c = 1.9;
    return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2;
  }

  function placeTile(w, index, now) {
    const state = w.states[index];
    const x = tileX(w, index);
    const z = tileZ(w, index);
    const started = w.animStart[index];
    const p = started ? Math.min(1, Math.max(0, (now - started) / 320)) : 1;
    const from = w.animFrom[index];
    const covered = coveredStates.has(state);
    const tint = state === 'exploded' ? new THREE.Color(w.look.exploded) : new THREE.Color('#ffffff');
    w.floors.set(index, matrix(x, floorHeight / 2, z), tint);

    if (covered && from === '' && p < 1) {
      // New board: the blocks pop up out of the ground.
      const rise = Math.max(0.001, pop(p));
      w.blocks.set(index, matrix(x, (blockHeight * rise) / 2 - (1 - ease(p)) * 0.3, z, 1, false, rise));
    } else if (covered) {
      w.blocks.set(index, matrix(x, blockHeight / 2, z));
    } else if (coveredStates.has(from) && p < 1) {
      const left = 1 - ease(p);
      w.blocks.set(index, matrix(x, (blockHeight * left) / 2, z, 1, false, Math.max(0.001, left)));
    } else {
      w.blocks.remove(index);
    }

    const grow = covered || !coveredStates.has(from) ? pop(p) : (p < 0.35 ? 0 : pop((p - 0.35) / 0.65));
    const number = /^n([1-8])$/.exec(state);
    w.digits.forEach((slots, i) => {
      if (number && Number(number[1]) === i + 1) slots.set(index, matrix(x, floorHeight + 0.004, z, Math.max(0.001, grow), true));
      else slots.remove(index);
    });

    if (state === 'mine' || state === 'exploded') w.mines.set(index, matrix(x, floorHeight + 0.22, z, Math.max(0.001, grow)));
    else if (state === 'planted') w.mines.set(index, matrix(x, blockHeight + 0.22, z, Math.max(0.001, grow)));
    else w.mines.remove(index);

    if (state === 'xray') w.ghosts.set(index, matrix(x, blockHeight + 0.24, z, 0.8));
    else w.ghosts.remove(index);

    if (state === 'flag' || state === 'wrong') {
      // A planted flag drops in, sticks and wobbles.
      const planted = state === 'flag' && from === 'covered' && p < 1;
      const drop = planted ? (1 - ease(Math.min(1, p * 1.8))) * 0.55 : 0;
      const wobble = planted ? Math.sin(p * 16) * (1 - p) * 0.4 : 0;
      w.poles.set(index, tilted(x, blockHeight + drop, z, 1, wobble));
      w.cloths.set(index, tilted(x, blockHeight + drop, z, 1, wobble));
    } else if (from === 'flag' && state === 'covered' && p < 1) {
      // A removed flag pops out and shrinks away.
      const out = ease(p);
      w.poles.set(index, tilted(x, blockHeight + out * 0.6, z, Math.max(0.001, 1 - out), out * 0.8));
      w.cloths.set(index, tilted(x, blockHeight + out * 0.6, z, Math.max(0.001, 1 - out), out * 0.8));
    } else {
      w.poles.remove(index);
      w.cloths.remove(index);
    }

    if (state === 'wrong') w.crosses.set(index, matrix(x, blockHeight + 0.02, z, 1, true));
    else w.crosses.remove(index);
  }

  function syncTiles(w, now) {
    const changed = [];
    w.game.tiles.forEach((tile, index) => {
      const state = w.options.tileState(tile);
      if (state !== w.states[index]) changed.push([index, state]);
    });
    if (changed.length) {
      const origin = w.origin !== null ? w.origin : changed[0][0];
      const ox = origin % w.width;
      const oy = Math.floor(origin / w.width);
      const intro = w.states[0] === '';
      const animate = w.options.motion() && !w.legacy && (!intro || w.intro);
      // The opening wave starts under the stickman's feet.
      const start = intro ? Math.max(0, tileUnder(w, w.player.x, w.player.z)) : origin;
      changed.forEach(([index, state]) => {
        const from = w.states[index];
        w.states[index] = state;
        w.animFrom[index] = from;
        if (animate) {
          const dx = (index % w.width) - (intro ? start % w.width : ox);
          const dy = Math.floor(index / w.width) - (intro ? Math.floor(start / w.width) : oy);
          const mine = state === 'mine' || state === 'wrong';
          const delay = intro ? Math.min(Math.hypot(dx, dy) * 26, 700) : mine ? 120 + Math.min(Math.hypot(dx, dy) * 45, 900) : Math.min(Math.max(Math.abs(dx), Math.abs(dy)) * 22, 520);
          w.animStart[index] = now + delay;
          w.animating.add(index);
        } else {
          w.animStart[index] = 0;
        }
        placeTile(w, index, now);
        if (state === 'exploded' && from !== '') explode(w, index);
        if (from === 'covered' && /^n/.test(state) && index === w.origin) burst(w, index, w.look.block[0], 10);
      });
    }
    w.animating.forEach(index => {
      placeTile(w, index, now);
      if (now - w.animStart[index] >= 320) {
        w.animStart[index] = 0;
        w.animating.delete(index);
      }
    });
    if (w.game.won && !w.won) {
      w.won = true;
      w.anim.winT = 0;
      confetti(w);
    }
  }

  // ---- Effects (lighter in legacy).
  function burst(w, index, color, amount) {
    if (w.legacy || !w.options.motion()) return;
    const geometry = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    const material = new THREE.MeshLambertMaterial({ color });
    for (let i = 0; i < amount; i += 1) {
      const piece = new THREE.Mesh(geometry, material);
      piece.position.set(tileX(w, index) + (Math.random() - 0.5) * 0.6, blockHeight, tileZ(w, index) + (Math.random() - 0.5) * 0.6);
      w.scene.add(piece);
      w.particles.push({ mesh: piece, vel: new THREE.Vector3((Math.random() - 0.5) * 3, 2.5 + Math.random() * 2.5, (Math.random() - 0.5) * 3), life: 0.7 + Math.random() * 0.3, spin: Math.random() * 8 });
    }
  }

  function explode(w, index) {
    const x = tileX(w, index);
    const z = tileZ(w, index);
    const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.9, depthWrite: false }));
    flash.position.set(x, 0.3, z);
    w.scene.add(flash);
    w.flash = { mesh: flash, age: 0 };
    w.shake = w.options.motion() ? 0.55 : 0;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 40), new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.5, z);
    w.scene.add(ring);
    w.ring = { mesh: ring, age: 0 };
    knockBack(w, x, z);
    if (w.legacy || !w.options.motion()) return;
    const colors = ['#ff5d3a', '#ffb347', '#ffe08a', '#3a3f4a'];
    const geometry = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    for (let i = 0; i < 40; i += 1) {
      const piece = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: colors[i % colors.length] }));
      piece.position.set(x, 0.4, z);
      w.scene.add(piece);
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 5;
      w.particles.push({ mesh: piece, vel: new THREE.Vector3(Math.cos(angle) * speed, 4 + Math.random() * 6, Math.sin(angle) * speed), life: 1 + Math.random() * 0.6, spin: Math.random() * 10 });
    }
  }

  // Close to the blast the stickman is thrown backwards and lands flat on his back; further away the shock just knocks him onto his backside.
  function knockBack(w, x, z) {
    const dx = w.player.x - x;
    const dz = w.player.z - z;
    const distance = Math.hypot(dx, dz) || 0.001;
    w.anim.action = null;
    w.pending = null;
    const far = distance >= 7;
    const speed = far ? 1.6 : Math.max(3.2, 7.5 - distance * 0.6);
    w.anim.yaw = Math.atan2(dx, dz);
    w.anim.lose = {
      t: 0, far, flying: true, vx: (dx / distance) * speed, vz: (dz / distance) * speed, vy: far ? 3.5 : 6.5, air: far ? 0.35 : 0.65,
      tumble: far ? 0 : Math.PI / 2 + (distance < 3 && w.options.motion() ? Math.PI * 2 : 0)
    };
  }

  function puff(w, x, y, z, size = 1) {
    if (w.legacy || !w.look.dust || !w.options.motion()) return;
    const mesh = new THREE.Mesh(w.puffShape, new THREE.MeshBasicMaterial({ color: w.look.dust, transparent: true, opacity: 0.3, depthWrite: false }));
    mesh.position.set(x, y + 0.08, z);
    mesh.scale.setScalar(0.09 * size);
    w.scene.add(mesh);
    w.particles.push({ mesh, vel: new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.45, (Math.random() - 0.5) * 0.8), life: 0.45, maxLife: 0.45, spin: 0, puff: size });
  }

  function confetti(w) {
    if (w.legacy || !w.options.motion()) return;
    const colors = ['#5cf0d0', '#ffcf3a', '#ff5d6c', '#6fcaff', '#b1a2ff', '#79e8ad'];
    const geometry = new THREE.PlaneGeometry(0.12, 0.07);
    const { x, y, z } = w.player;
    for (let i = 0; i < 70; i += 1) {
      const piece = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide }));
      piece.position.set(x, y + 2.2, z);
      w.scene.add(piece);
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3.5;
      w.particles.push({ mesh: piece, vel: new THREE.Vector3(Math.cos(angle) * speed, 5 + Math.random() * 4, Math.sin(angle) * speed), life: 2.2 + Math.random(), spin: 4 + Math.random() * 8, drag: true });
    }
  }

  function updateEffects(w, dt) {
    w.particles = w.particles.filter(particle => {
      particle.life -= dt;
      if (particle.life <= 0) {
        w.scene.remove(particle.mesh);
        particle.mesh.material.dispose();
        return false;
      }
      if (particle.puff) {
        const age = 1 - particle.life / particle.maxLife;
        particle.mesh.position.addScaledVector(particle.vel, dt);
        particle.mesh.scale.setScalar(0.09 * particle.puff * (1 + age * 2.2));
        particle.mesh.material.opacity = 0.3 * (1 - age);
        return true;
      }
      particle.vel.y -= (particle.drag ? 7 : 16) * dt;
      if (particle.drag) particle.vel.multiplyScalar(1 - dt * 1.2);
      particle.mesh.position.addScaledVector(particle.vel, dt);
      if (particle.mesh.position.y < 0.05) {
        particle.mesh.position.y = 0.05;
        particle.vel.set(0, 0, 0);
      }
      particle.mesh.rotation.x += particle.spin * dt;
      particle.mesh.rotation.z += particle.spin * dt * 0.7;
      return true;
    });
    if (w.flash) {
      w.flash.age += dt;
      const p = w.flash.age / (w.legacy ? 0.35 : 0.6);
      w.flash.mesh.scale.setScalar(0.3 + p * 3.2);
      w.flash.mesh.material.opacity = Math.max(0, 0.9 * (1 - p));
      if (p >= 1) {
        w.scene.remove(w.flash.mesh);
        w.flash = null;
      }
    }
    if (w.ring) {
      w.ring.age += dt;
      const p = w.ring.age / 0.55;
      w.ring.mesh.scale.setScalar(1 + p * 7);
      w.ring.mesh.material.opacity = Math.max(0, 0.85 * (1 - p));
      if (p >= 1) {
        w.scene.remove(w.ring.mesh);
        w.ring = null;
      }
    }
    w.shake = Math.max(0, w.shake - dt);
  }

  // ---- Player.
  function tileUnder(w, x, z) {
    const column = Math.floor(x + w.width / 2);
    const row = Math.floor(z + w.height / 2);
    if (column < 0 || column >= w.width || row < 0 || row >= w.height) return -1;
    return row * w.width + column;
  }

  function groundAt(w, x, z) {
    const index = tileUnder(w, x, z);
    if (index < 0) return 0;
    if (coveredStates.has(w.states[index]) || w.blocks.slotOf.has(index)) return blockHeight;
    return floorHeight;
  }

  function lookDirection(w, target) {
    const { yaw, pitch } = w.player;
    return target.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  }

  function movePlayer(w, dt) {
    const player = w.player;
    const anim = w.anim;
    if (anim.lose) {
      flyBack(w, dt);
      return;
    }
    const keys = w.keys;
    let forward = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    let strafe = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    if (w.pad.x || w.pad.y) {
      strafe = w.pad.x;
      forward = -w.pad.y;
    }
    const length = Math.hypot(forward, strafe);
    player.running = length > 0.05 && (keys.ShiftLeft || keys.ShiftRight || (w.touch && length > 0.92));
    const speed = (player.running ? 7 : 4.2) * Math.min(1, length);
    if (length > 0.05) {
      forward /= length;
      strafe /= length;
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      const moveX = -sin * forward + cos * strafe;
      const moveZ = -cos * forward - sin * strafe;
      player.x += moveX * speed * dt;
      player.z += moveZ * speed * dt;
      // He turns to face the way he runs; the camera stays wherever the player put it.
      player.facing = Math.atan2(-moveX, -moveZ);
      const limitX = w.width / 2 + 7;
      const limitZ = w.height / 2 + 7;
      player.x = Math.min(limitX, Math.max(-limitX, player.x));
      player.z = Math.min(limitZ, Math.max(-limitZ, player.z));
      player.walk += dt * speed * 2.3;
      player.moving = Math.min(1, player.moving + dt * 6);
    } else {
      player.moving = Math.max(0, player.moving - dt * 6);
    }
    // A puff of dust from each running footstep.
    const stepSide = Math.sin(player.walk) > 0;
    if (stepSide !== anim.stepSide) {
      anim.stepSide = stepSide;
      if (player.running && player.onGround) puff(w, player.x, player.y, player.z, 0.8);
    }
    if ((keys.Space || w.jumpQueued) && player.onGround) {
      player.vy = 6.2;
      player.onGround = false;
    }
    w.jumpQueued = false;
    const wasOnGround = player.onGround;
    const fall = player.vy;
    const ground = groundAt(w, player.x, player.z);
    if (player.y > ground + 0.001 || player.vy > 0) {
      player.vy -= 20 * dt;
      player.y += player.vy * dt;
      if (player.y <= ground) {
        player.y = ground;
        player.vy = 0;
        player.onGround = true;
      } else {
        player.onGround = false;
      }
    } else {
      player.y += (ground - player.y) * Math.min(1, dt * 18);
      player.vy = 0;
      player.onGround = true;
    }
    anim.airT = player.onGround ? 0 : anim.airT + dt;
    // Landing from a jump (or the drop in at the start) squashes him for a moment.
    if (!wasOnGround && player.onGround && fall < -3) {
      anim.landT = 0.18;
      if (fall < -6) [0, 1, 2, 3].forEach(i => puff(w, player.x + Math.cos(i * 1.6) * 0.3, player.y, player.z + Math.sin(i * 1.6) * 0.3, 1.1));
    }
    anim.landT = Math.max(0, anim.landT - dt);
  }

  function flyBack(w, dt) {
    const lose = w.anim.lose;
    const player = w.player;
    if (!lose.flying) return;
    player.x += lose.vx * dt;
    player.z += lose.vz * dt;
    lose.vy -= 20 * dt;
    player.y += lose.vy * dt;
    const ground = groundAt(w, player.x, player.z);
    if (player.y <= ground && lose.t > 0.1) {
      player.y = ground;
      player.vy = 0;
      lose.flying = false;
      w.shake = Math.max(w.shake, w.options.motion() ? 0.18 : 0);
      [0, 1, 2].forEach(i => puff(w, player.x + (i - 1) * 0.5, player.y, player.z, 1.2));
    }
  }

  function turnToward(from, to, amount) {
    const difference = Math.atan2(Math.sin(to - from), Math.cos(to - from));
    return from + difference * amount;
  }

  function animateStickman(w, now, dt) {
    const { stick, player, anim } = w;
    const t = now / 1000;
    // The camera orbits freely, so the body follows his own facing (the camera's only in first person).
    if (!anim.lose) anim.yaw = turnToward(anim.yaw, w.firstPerson ? player.yaw : player.facing, Math.min(1, dt * (anim.action ? 30 : 12)));
    stick.root.position.set(player.x, player.y, player.z);
    stick.root.rotation.y = anim.yaw;
    let pose;
    let lift = 0;
    let spin = 0;
    let tumble = 0;
    if (anim.lose) {
      const lose = anim.lose;
      lose.t += dt;
      if (lose.flying) {
        pose = lose.far ? mix(idlePose(t), flailPose(t), smooth(lose.t / 0.15)) : flailPose(t);
        tumble = lose.tumble * smooth(lose.t / lose.air);
      } else {
        lose.down = (lose.down || 0) + dt;
        if (lose.far) {
          pose = mix(flailPose(t), sitPose(lose.down), smooth(lose.down / 0.2));
        } else {
          pose = lyingPose(lose.down);
          tumble = lose.tumble;
          lift = 0.07;
        }
      }
    } else {
      pose = mix(idlePose(t), movePose(player.walk, player.running), player.moving);
      if (anim.airT > 0.04) pose = mix(pose, airPose(player.vy), Math.min(1, (anim.airT - 0.04) * 10));
      if (anim.landT > 0) {
        const k = anim.landT / 0.18;
        pose.hipY -= 0.16 * k;
        pose.lKnee -= 0.8 * k;
        pose.rKnee -= 0.8 * k;
        pose.lHip += 0.4 * k;
        pose.rHip += 0.4 * k;
        pose.lean -= 0.2 * k;
      }
      if (w.game.won) {
        // Victory: a spin, a few hops with both arms in the air.
        anim.winT += dt;
        const cheering = Math.max(0, 1 - player.moving) * (anim.winT < 2.6 ? smooth(anim.winT * 5) : smooth((3 - anim.winT) * 2.5));
        if (cheering > 0) {
          pose = mix(pose, cheerPose(t), cheering);
          if (anim.winT < 2.4) lift = Math.abs(Math.sin(anim.winT * 6.5)) * 0.32 * cheering;
          if (anim.winT < 0.7) spin = smooth(anim.winT / 0.7) * Math.PI * 2;
        }
      }
      if (anim.action) {
        const action = anim.action;
        action.t += dt;
        pose = action.tool === 'dig' ? digPose(action.t, pose) : plantPose(action.t, pose);
        if (action.t >= (action.tool === 'dig' ? digTime : plantTime)) anim.action = null;
      }
    }
    applyPose(stick, pose);
    stick.body.position.y = lift;
    stick.body.rotation.set(tumble, spin, 0);
    // In first person the camera sits inside the head, so the body would only get in the way.
    stick.root.visible = !w.firstPerson;
  }

  function placeCamera(w, dt) {
    const { player, camera } = w;
    const direction = lookDirection(w, scratchDirection);
    const head = scratchHead.set(player.x, player.y + eyeHeight - w.anim.landT * 0.5, player.z);
    const right = scratchRight.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    if (w.cameraOverride) {
      camera.position.fromArray(w.cameraOverride[0]);
      camera.lookAt(scratchTarget.fromArray(w.cameraOverride[1]));
      return;
    }
    // Knocked down: pull back and up, looking at the fallen stickman.
    const down = w.anim.lose && !w.anim.lose.far && !w.firstPerson;
    if (w.firstPerson) {
      camera.position.copy(head).addScaledVector(direction, 0.12);
      w.follow = null;
    } else {
      // The camera trails the stickman slightly, which makes steps, jumps and landings feel weighty.
      if (!w.follow) w.follow = head.clone();
      w.follow.lerp(head, 1 - Math.exp(-dt * 14));
      const distance = (w.touch ? 2.9 : 2.5) + down * 3;
      camera.position.copy(w.follow).addScaledVector(direction, -distance).addScaledVector(right, (w.touch ? 0.35 : 0.55) - down * 0.3);
      camera.position.y += 0.1 + down * 2;
      camera.position.y = Math.max(camera.position.y, groundAt(w, camera.position.x, camera.position.z) + 0.25);
    }
    // Widens a little while running.
    const fov = 76 + (player.running && player.moving > 0.5 && !w.anim.lose ? 7 : 0);
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 6);
      camera.updateProjectionMatrix();
    }
    if (w.shake > 0) {
      const amount = w.shake * 0.25;
      camera.position.x += (Math.random() - 0.5) * amount;
      camera.position.y += (Math.random() - 0.5) * amount;
    }
    if (down) camera.lookAt(scratchTarget.set(player.x, player.y + 0.4, player.z));
    else camera.lookAt(scratchTarget.copy(camera.position).add(direction));
  }

  // Walks along the line of sight until it enters a block or reaches the floor.
  function findTarget(w) {
    const { camera, player } = w;
    const direction = lookDirection(w, scratchDirection);
    const point = scratchPoint;
    for (let t = 0; t < 12; t += 0.04) {
      point.copy(camera.position).addScaledVector(direction, t);
      if (point.y < 0) return -1;
      const index = tileUnder(w, point.x, point.z);
      if (index < 0) continue;
      const top = coveredStates.has(w.states[index]) ? blockHeight : floorHeight;
      if (point.y > top) continue;
      const dx = tileX(w, index) - player.x;
      const dz = tileZ(w, index) - player.z;
      return Math.hypot(dx, dz) <= reach ? index : -1;
    }
    return -1;
  }

  function useTool(w, tool) {
    if (!w.options.canPlay() || w.anim.lose) return;
    if (w.pending) landTool(w);
    const slot = w.hud.hotbar.querySelector(`[data-tool="${tool}"]`);
    slot.classList.remove('used');
    void slot.offsetWidth;
    slot.classList.add('used');
    w.anim.action = { tool, t: 0 };
    // Turn toward the tile being worked on.
    if (w.target >= 0) w.player.facing = Math.atan2(-(tileX(w, w.target) - w.player.x), -(tileZ(w, w.target) - w.player.z));
    else w.player.facing = w.player.yaw;
    const impact = w.options.motion() ? (tool === 'dig' ? digImpact : plantImpact) : 0;
    w.pending = { tool, index: w.target, at: performance.now() + impact * 1000 };
  }

  function landTool(w) {
    const { tool, index } = w.pending;
    w.pending = null;
    if (index < 0 || w.options.getGame() !== w.game) return;
    if (w.options.motion()) w.shake = Math.max(w.shake, 0.08);
    puff(w, tileX(w, index), coveredStates.has(w.states[index]) ? blockHeight : floorHeight, tileZ(w, index), 1);
    w.origin = index;
    if (tool === 'dig') w.options.dig(index);
    else w.options.flag(index);
  }

  // ---- HUD and controls.
  const shovelIcon = '<svg viewBox="0 0 24 24"><path d="M10.5 13.5 19 5M16.8 2.8l4.4 4.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M8.6 11.2 12.8 15.4 8.4 19.8 2.6 21.4 4.2 15.6z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  const flagIcon = '<svg viewBox="0 0 24 24"><path d="M6 21V3.5M6 4h11l-3 4.2 3 4.3H6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>';

  const desktopHelp = `<ul>
          <li><b>WASD</b> walk · <b>Shift</b> run · <b>Space</b> jump</li>
          <li><b>Mouse</b> look around</li>
          <li><b>Left click</b> shovel: dig a tile</li>
          <li><b>Right click</b> flag: mark a mine</li>
          <li><b>R</b> new game · <b>V</b> camera</li>
          <li><b>Esc</b> switches between moving the camera and using the mouse</li>
        </ul>`;
  const touchHelp = `<ul>
          <li><b>Left stick</b> walk (push all the way to run)</li>
          <li><b>Drag</b> anywhere else to look around</li>
          <li><b>Dig</b> and <b>Flag</b> use your tools</li>
          <li><b>View</b> switches the camera</li>
        </ul>`;

  // The controls card shows up during the first 3D match only, then fades away by itself.
  function helpSeen() {
    try {
      return localStorage.getItem(helpKey) === 'seen';
    } catch {
      return true;
    }
  }

  function markHelpSeen(w) {
    try {
      localStorage.setItem(helpKey, 'seen');
    } catch {
      // Private mode: it will just show again next time.
    }
    w.hud.start.classList.add('hidden');
  }

  function buildHud(w) {
    const full = !helpSeen();
    const root = document.createElement('div');
    root.className = 'world3d-hud';
    root.innerHTML = `
      <div class="world3d-crosshair" aria-hidden="true"></div>
      <div class="world3d-hotbar">
        <button type="button" data-tool="dig" aria-label="Shovel">${shovelIcon}<span>${w.touch ? 'Dig' : 'Left click'}</span></button>
        <button type="button" data-tool="flag" aria-label="Flag">${flagIcon}<span>${w.touch ? 'Flag' : 'Right click'}</span></button>
      </div>
      <div class="world3d-start ${full ? '' : 'hidden'}" aria-live="polite">
        <strong>3D Mode</strong>
        ${w.touch ? touchHelp : desktopHelp}
      </div>
      <div class="world3d-mouse hidden">Press <b>Esc</b> to move the camera</div>
      <div class="world3d-tip hidden">${w.touch ? 'Tap the face for a new game' : 'Press <b>R</b> for a new game'}</div>
      ${w.touch ? '<div class="world3d-stick"><i></i></div><button type="button" class="world3d-jump" aria-label="Jump">Jump</button><button type="button" class="world3d-view" aria-label="Switch camera">View</button>' : ''}`;
    w.container.append(root);
    return {
      root,
      hotbar: root.querySelector('.world3d-hotbar'),
      start: root.querySelector('.world3d-start'),
      tip: root.querySelector('.world3d-tip'),
      mouse: root.querySelector('.world3d-mouse'),
      stick: root.querySelector('.world3d-stick'),
      jump: root.querySelector('.world3d-jump'),
      view: root.querySelector('.world3d-view')
    };
  }

  function grabMouse() {
    try {
      const request = renderer.domElement.requestPointerLock();
      if (request && request.catch) request.catch(() => {});
    } catch {
      // Not allowed right now; the Esc hint stays up.
    }
  }

  function bindControls(w) {
    const canvas = renderer.domElement;
    const on = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      w.unbind.push(() => target.removeEventListener(type, handler, options));
    };
    const locked = () => document.pointerLockElement === canvas;
    const turn = (dx, dy, speed) => {
      w.player.yaw -= dx * speed;
      w.player.pitch = Math.max(-1.35, Math.min(1.15, w.player.pitch - dy * speed));
    };

    on(document, 'keydown', event => {
      if (!w.options.canPlay() || (event.target instanceof Element && event.target.closest('input, textarea, select'))) return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      w.keys[event.code] = true;
      if (/^(Arrow|Space)/.test(event.code)) event.preventDefault();
      if (event.code === 'KeyV' && !event.repeat) w.firstPerson = !w.firstPerson;
      if (event.code === 'KeyF' && !event.repeat) useTool(w, 'flag');
    });
    on(document, 'keyup', event => {
      w.keys[event.code] = false;
      // Space is jump here, never a click on whichever button still has focus.
      if (event.code === 'Space' && w.options.canPlay()) event.preventDefault();
    });
    on(window, 'blur', () => { w.keys = {}; });

    if (!w.hud.start.classList.contains('hidden')) {
      const timer = window.setTimeout(() => markHelpSeen(w), 9000);
      w.unbind.push(() => window.clearTimeout(timer));
    }
    if (!w.touch) {
      // Clicking the world also works, for browsers where Esc can't capture the mouse.
      on(canvas, 'click', () => { if (!locked()) grabMouse(); });
      on(document, 'pointerlockchange', () => {
        if (!locked()) {
          w.unlockedAt = performance.now();
          w.keys = {};
        } else if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        w.hud.mouse.classList.toggle('hidden', locked());
      });
      on(document, 'mousemove', event => {
        if (locked()) turn(event.movementX, event.movementY, 0.0022);
      });
      on(canvas, 'mousedown', event => {
        if (!locked()) return;
        if (event.button === 0 || event.button === 1) useTool(w, 'dig');
        else if (event.button === 2) useTool(w, 'flag');
      });
      on(canvas, 'contextmenu', event => event.preventDefault());
      return;
    }

    // Phones: left thumb walks with the stick, dragging anywhere else looks around.
    const look = new Map();
    on(canvas, 'pointerdown', event => {
      look.set(event.pointerId, { x: event.clientX, y: event.clientY });
    });
    on(window, 'pointermove', event => {
      const last = look.get(event.pointerId);
      if (!last) return;
      turn(event.clientX - last.x, event.clientY - last.y, 0.0055);
      look.set(event.pointerId, { x: event.clientX, y: event.clientY });
    });
    ['pointerup', 'pointercancel'].forEach(type => on(window, type, event => look.delete(event.pointerId)));

    const pad = w.hud.stick;
    const knob = pad.querySelector('i');
    let padPointer = null;
    const movePad = event => {
      const rect = pad.getBoundingClientRect();
      const radius = rect.width / 2;
      let dx = (event.clientX - rect.left - radius) / radius;
      let dy = (event.clientY - rect.top - radius) / radius;
      const length = Math.hypot(dx, dy);
      if (length > 1) {
        dx /= length;
        dy /= length;
      }
      w.pad.x = dx;
      w.pad.y = dy;
      knob.style.translate = `${dx * radius * 0.6}px ${dy * radius * 0.6}px`;
    };
    on(pad, 'pointerdown', event => {
      padPointer = event.pointerId;
      pad.setPointerCapture(event.pointerId);
      movePad(event);
    });
    on(pad, 'pointermove', event => { if (event.pointerId === padPointer) movePad(event); });
    ['pointerup', 'pointercancel'].forEach(type => on(pad, type, event => {
      if (event.pointerId !== padPointer) return;
      padPointer = null;
      w.pad.x = 0;
      w.pad.y = 0;
      knob.style.translate = '';
    }));
    on(w.hud.hotbar, 'pointerdown', event => {
      const button = event.target.closest('[data-tool]');
      if (!button) return;
      event.preventDefault();
      useTool(w, button.dataset.tool);
    });
    on(w.hud.jump, 'pointerdown', event => {
      event.preventDefault();
      w.jumpQueued = true;
    });
    on(w.hud.view, 'click', () => { w.firstPerson = !w.firstPerson; });
  }

  // ---- Main loop.
  let scratchDirection, scratchHead, scratchRight, scratchTarget, scratchPoint;

  function frame(now) {
    const w = world;
    if (!w) return;
    w.raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - (w.lastTime || now)) / 1000);
    w.lastTime = now;
    const game = w.options.getGame();
    if (game !== w.game || w.legacy !== w.options.legacy()) {
      rebuild();
      return;
    }
    resize();
    if (w.options.canPlay()) movePlayer(w, dt);
    if (w.pending && now >= w.pending.at) landTool(w);
    syncTiles(w, now);
    animateStickman(w, now, dt);
    placeCamera(w, dt);
    if (w.game.ended !== w.tipShown) {
      w.tipShown = w.game.ended;
      w.hud.tip.classList.toggle('hidden', !w.game.ended);
    }
    w.target = w.options.canPlay() && !w.game.ended ? findTarget(w) : -1;
    const outline = w.outline;
    outline.group.visible = w.target >= 0;
    if (w.target >= 0) {
      const covered = coveredStates.has(w.states[w.target]);
      shapeOutline(outline, covered ? blockHeight : floorHeight);
      outline.group.position.set(tileX(w, w.target), 0, tileZ(w, w.target));
      if (outline.fill) outline.fill.material.opacity = 0.12 + Math.sin(now / 220) * 0.06;
    }
    updateEffects(w, dt);
    renderer.render(w.scene, w.camera);
  }

  function resize() {
    const box = world.container;
    const width = box.clientWidth;
    const height = box.clientHeight;
    if (width === world.size[0] && height === world.size[1]) return;
    world.size = [width, height];
    renderer.setSize(width, height, false);
    world.camera.aspect = width / Math.max(1, height);
    world.camera.updateProjectionMatrix();
  }

  function dispose(scene) {
    scene.traverse(object => {
      if (object.geometry) object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      materials.forEach(material => {
        if (material.map) material.map.dispose();
        material.dispose();
      });
    });
  }

  function makeWorld(options, container, player, intro) {
    const w = build(options);
    w.intro = intro;
    w.pending = null;
    w.tipShown = false;
    w.anim = { yaw: player ? player.facing : 0, action: null, lose: null, landT: 0, airT: 0, winT: 0, stepSide: false };
    w.options = options;
    w.container = container;
    w.size = [0, 0];
    w.keys = {};
    w.pad = { x: 0, y: 0 };
    w.unbind = [];
    w.target = -1;
    w.firstPerson = false;
    w.player = player || { x: 0, y: 0, z: w.height / 2 + 2.2, vy: 0, yaw: 0, pitch: -0.42, walk: 0, moving: 0, dig: 0, plant: 0, onGround: true };
    w.player.x = Math.min(w.width / 2 + 7, Math.max(-w.width / 2 - 7, w.player.x));
    w.player.z = Math.min(w.height / 2 + 7, Math.max(-w.height / 2 - 7, w.player.z));
    w.player.running = false;
    if (w.player.facing === undefined) w.player.facing = w.player.yaw;
    // Each new match he drops in from the sky.
    if (intro && options.motion()) {
      w.player.y += 5;
      w.player.vy = 0;
      w.player.onGround = false;
    }
    renderer.shadowMap.enabled = !w.legacy && !w.touch;
    renderer.setPixelRatio(w.legacy ? 1 : Math.min(window.devicePixelRatio || 1, w.touch ? 1.5 : 2));
    w.hud = buildHud(w);
    bindControls(w);
    return w;
  }

  function teardown(keepCanvas) {
    if (!world) return;
    cancelAnimationFrame(world.raf);
    world.unbind.forEach(off => off());
    world.hud.root.remove();
    dispose(world.scene);
    if (!keepCanvas && document.pointerLockElement === renderer.domElement) document.exitPointerLock();
    world = null;
  }

  function rebuild() {
    const { options, container, player, firstPerson } = world;
    const sameBoard = options.getGame() && options.getGame().width === world.width && options.getGame().height === world.height;
    const newMatch = options.getGame() !== world.game;
    const locked = document.pointerLockElement === renderer.domElement;
    teardown(true);
    if (!options.getGame()) return;
    world = makeWorld(options, container, sameBoard ? player : null, newMatch);
    world.firstPerson = firstPerson;
    if (!world.touch) world.hud.mouse.classList.toggle('hidden', locked);
    world.raf = requestAnimationFrame(frame);
  }

  function initScratch() {
    scratch.m = new THREE.Matrix4();
    scratch.q = new THREE.Quaternion();
    scratch.flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    scratch.v = new THREE.Vector3();
    scratch.s = new THREE.Vector3();
    scratch.tilt = new THREE.Quaternion();
    scratch.euler = new THREE.Euler();
    scratchDirection = new THREE.Vector3();
    scratchHead = new THREE.Vector3();
    scratchRight = new THREE.Vector3();
    scratchTarget = new THREE.Vector3();
    scratchPoint = new THREE.Vector3();
  }

  window.Ultra3D = {
    // options: getGame, tileState, dig, flag, legacy, touch, motion, canPlay
    async start(container, options) {
      const ticket = ++startTicket;
      THREE = await loadEngine();
      // Left the match while the engine was loading.
      if (ticket !== startTicket) return;
      if (!scratch.m) initScratch();
      if (!renderer) {
        renderer = new THREE.WebGLRenderer({ antialias: !options.legacy(), powerPreference: 'high-performance' });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.domElement.className = 'world3d-canvas';
      }
      if (world) teardown(true);
      container.prepend(renderer.domElement);
      world = makeWorld(options, container, null, true);
      world.raf = requestAnimationFrame(frame);
      if (!world.touch) {
        world.hud.mouse.classList.remove('hidden');
        grabMouse();
      }
    },
    stop() {
      startTicket += 1;
      teardown(false);
    },
    active() {
      return Boolean(world);
    },
    // For automated checks: the live world, and a way to swing a tool without a mouse.
    debug: { world: () => world, use: tool => world && useTool(world, tool) },
    // Esc in 3D Mode: capture the mouse to steer the camera, or free it to click buttons.
    // The desktop app calls this itself when Esc is pressed, which is what lets the page capture the mouse.
    escape() {
      if (!world || world.touch || !world.options.canPlay()) return;
      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock();
        return;
      }
      // This same Esc press already freed the mouse.
      if (performance.now() - (world.unlockedAt || 0) < 400) return;
      grabMouse();
    },
    releaseMouse() {
      if (renderer && document.pointerLockElement === renderer.domElement) document.exitPointerLock();
    }
  };
})();
