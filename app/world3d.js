// 3D Mode: the same match, played as a stickman walking around on the board.
// app.js still owns the rules; this file only draws the board and turns shovel and flag swings into reveal/flag calls.
(() => {
  const blockHeight = 0.42;
  const floorHeight = 0.06;
  const reach = 5.2;
  const eyeHeight = 1.5;
  const looks = {
    modern: {
      sky: '#0b0e15', fog: 28, ground: '#0f151e', grid: '#1b2533', rim: '#1d2633',
      block: ['#2e3a4d', '#43536b', '#1d2532'], floor: ['#151c26', '#1f2836'],
      stick: '#e5edf9', eyes: '#0b0e15', outline: '#5cf0d0', cloth: '#ff5d6c', exploded: '#ff5050',
      numbers: ['#6fcaff', '#79e8ad', '#ff9d9d', '#b1a2ff', '#ffbd80', '#77e2e8', '#ffffff', '#b7c1d0']
    },
    legacy: {
      sky: '#7aa7e8', fog: 0, ground: '#5d9b3b', grid: null, rim: '#808080',
      block: ['#c0c0c0', '#ffffff', '#808080'], floor: ['#bdbdbd', '#7b7b7b'],
      stick: '#111111', eyes: '#ffffff', outline: '#000000', cloth: '#ff0000', exploded: '#ff0000',
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

  // ---- The stickman, built facing -z with his right hand on +x.
  function buildStickman(look) {
    const mat = new THREE.MeshLambertMaterial({ color: look.stick });
    const radius = 0.05;
    const limb = (length, thickness = radius) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(thickness, thickness, length, 8), mat);
      mesh.position.y = -length / 2;
      mesh.castShadow = true;
      return mesh;
    };
    const joint = (r = radius) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat);
      mesh.castShadow = true;
      return mesh;
    };
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);

    const torso = limb(0.5);
    torso.position.y = 1.03;
    body.add(torso);
    const hips = joint();
    hips.position.y = 0.78;
    body.add(hips);
    const head = new THREE.Group();
    head.position.y = 1.5;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), mat);
    skull.castShadow = true;
    head.add(skull);
    const eyeMat = new THREE.MeshBasicMaterial({ color: look.eyes });
    [-0.07, 0.07].forEach(x => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), eyeMat);
      eye.position.set(x, 0.03, -0.18);
      head.add(eye);
    });
    const neck = limb(0.12);
    neck.position.y = 1.36;
    body.add(neck, head);

    const makeLeg = side => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.09, 0.78, 0);
      pivot.add(limb(0.78));
      body.add(pivot);
      return pivot;
    };
    const makeArm = side => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.07, 1.25, 0);
      pivot.add(limb(0.6));
      const hand = joint(0.06);
      hand.position.y = -0.6;
      pivot.add(hand);
      body.add(pivot);
      const grip = new THREE.Group();
      grip.position.y = -0.6;
      pivot.add(grip);
      return { pivot, grip };
    };
    const legs = [makeLeg(-1), makeLeg(1)];
    const shoulder = joint();
    shoulder.position.y = 1.25;
    body.add(shoulder);
    const left = makeArm(-1);
    const right = makeArm(1);

    // Shovel in the right hand: handle up through the fist, blade at the bottom.
    const wood = new THREE.MeshLambertMaterial({ color: '#a8743f' });
    const metal = new THREE.MeshLambertMaterial({ color: look === looks.legacy ? '#7d7d7d' : '#b9c6d6' });
    const shovel = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), wood);
    handle.position.y = -0.18;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.04), wood);
    bar.position.y = 0.32;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.025), metal);
    blade.position.y = -0.78;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.1, 4), metal);
    tip.rotation.set(Math.PI, Math.PI / 4, 0);
    tip.scale.z = 0.16;
    tip.position.y = -0.95;
    shovel.add(handle, bar, blade, tip);
    shovel.traverse(part => { part.castShadow = true; });
    shovel.rotation.x = 0.2;
    right.grip.add(shovel);

    // Flag in the left hand.
    const flag = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6), new THREE.MeshLambertMaterial({ color: look === looks.legacy ? '#000000' : '#d9e2ee' }));
    pole.position.y = 0.2;
    const cloth = new THREE.Mesh(clothGeometry(), new THREE.MeshLambertMaterial({ color: look.cloth, side: THREE.DoubleSide }));
    cloth.position.set(0.09, 0.03, 0);
    cloth.scale.set(1.1, 1.1, 1.1);
    flag.add(pole, cloth);
    flag.traverse(part => { part.castShadow = true; });
    flag.rotation.x = -0.7;
    left.grip.add(flag);

    return { root, body, head, legs, left, right, shovel, flag };
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

    const stick = buildStickman(look);
    scene.add(stick.root);
    const outline = buildOutline(look, legacy);
    scene.add(outline.group);

    const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 400);
    return {
      game, legacy, look, touch, scene, camera, sun, width, height, count,
      blocks, floors, digits, mines, ghosts, poles, cloths, crosses, stick, outline,
      states: new Array(count).fill(''),
      animStart: new Float64Array(count),
      animFrom: new Array(count).fill(''),
      animating: new Set(),
      particles: [],
      flash: null,
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
  const scratch = { m: null, q: null, flat: null, v: null, s: null };

  function tileX(w, index) { return (index % w.width) - w.width / 2 + 0.5; }
  function tileZ(w, index) { return Math.floor(index / w.width) - w.height / 2 + 0.5; }

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

    if (covered) {
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
      const lift = state === 'flag' && from !== 'wrong' ? Math.max(0.001, pop(p)) : 1;
      w.poles.set(index, matrix(x, blockHeight, z, lift));
      w.cloths.set(index, matrix(x, blockHeight, z, lift));
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
      const animate = w.options.motion() && !w.legacy && w.states[0] !== '';
      changed.forEach(([index, state]) => {
        const from = w.states[index];
        w.states[index] = state;
        w.animFrom[index] = from;
        if (animate) {
          const dx = (index % w.width) - ox;
          const dy = Math.floor(index / w.width) - oy;
          const mine = state === 'mine' || state === 'wrong';
          const delay = mine ? 120 + Math.min(Math.hypot(dx, dy) * 45, 900) : Math.min(Math.max(Math.abs(dx), Math.abs(dy)) * 22, 520);
          w.animStart[index] = now + delay;
          w.animating.add(index);
        } else {
          w.animStart[index] = 0;
        }
        placeTile(w, index, now);
        if (state === 'exploded') explode(w, index);
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
    const keys = w.keys;
    let forward = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    let strafe = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    if (w.pad.x || w.pad.y) {
      strafe = w.pad.x;
      forward = -w.pad.y;
    }
    const length = Math.hypot(forward, strafe);
    const speed = (keys.ShiftLeft || keys.ShiftRight ? 7 : 4.2) * Math.min(1, length);
    if (length > 0.05) {
      forward /= length;
      strafe /= length;
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      player.x += (-sin * forward + cos * strafe) * speed * dt;
      player.z += (-cos * forward - sin * strafe) * speed * dt;
      const limitX = w.width / 2 + 7;
      const limitZ = w.height / 2 + 7;
      player.x = Math.min(limitX, Math.max(-limitX, player.x));
      player.z = Math.min(limitZ, Math.max(-limitZ, player.z));
      player.walk += dt * speed * 2.3;
      player.moving = Math.min(1, player.moving + dt * 6);
    } else {
      player.moving = Math.max(0, player.moving - dt * 6);
    }
    if ((keys.Space || w.jumpQueued) && player.onGround) {
      player.vy = 6.2;
      player.onGround = false;
    }
    w.jumpQueued = false;
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
  }

  function animateStickman(w, now, dt) {
    const { stick, player } = w;
    stick.root.position.set(player.x, player.y, player.z);
    stick.root.rotation.y = player.yaw;
    const swing = Math.sin(player.walk) * 0.7 * player.moving;
    stick.legs[0].rotation.x = swing;
    stick.legs[1].rotation.x = -swing;
    stick.body.position.y = Math.abs(Math.cos(player.walk)) * 0.05 * player.moving + Math.sin(now / 600) * 0.008;
    stick.head.rotation.x = Math.max(-0.5, Math.min(0.5, player.pitch * 0.6));
    const dig = player.dig > 0 ? 1 - player.dig / 0.34 : -1;
    const plant = player.plant > 0 ? 1 - player.plant / 0.3 : -1;
    // Right arm swings the shovel down onto the tile; left arm pushes the flag forward.
    const digAngle = dig >= 0 ? (dig < 0.35 ? 0.55 + (dig / 0.35) * 1.3 : 1.85 - ((dig - 0.35) / 0.65) * 1.65) : 0.55 - swing * 0.3;
    const plantAngle = plant >= 0 ? 0.35 + Math.sin(plant * Math.PI) * 1.1 : 0.35 + swing * 0.3;
    stick.right.pivot.rotation.set(digAngle, 0, 0.32);
    stick.left.pivot.rotation.set(plantAngle, 0, -0.32);
    player.dig = Math.max(0, player.dig - dt);
    player.plant = Math.max(0, player.plant - dt);
    // In first person the camera sits inside the head, so the body would only get in the way.
    stick.root.visible = !w.firstPerson;
  }

  function placeCamera(w) {
    const { player, camera } = w;
    const direction = lookDirection(w, scratchDirection);
    const head = scratchHead.set(player.x, player.y + eyeHeight, player.z);
    const right = scratchRight.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    if (w.firstPerson) {
      camera.position.copy(head).addScaledVector(direction, 0.12);
    } else {
      const distance = w.touch ? 4.4 : 4;
      camera.position.copy(head).addScaledVector(direction, -distance).addScaledVector(right, 0.75);
      camera.position.y += 0.35;
      camera.position.y = Math.max(camera.position.y, groundAt(w, camera.position.x, camera.position.z) + 0.25);
    }
    if (w.cameraOverride) {
      camera.position.fromArray(w.cameraOverride[0]);
      camera.lookAt(scratchTarget.fromArray(w.cameraOverride[1]));
      return;
    }
    if (w.shake > 0) {
      const amount = w.shake * 0.25;
      camera.position.x += (Math.random() - 0.5) * amount;
      camera.position.y += (Math.random() - 0.5) * amount;
    }
    camera.lookAt(scratchTarget.copy(camera.position).add(direction));
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
    if (!w.options.canPlay()) return;
    const player = w.player;
    if (tool === 'dig') player.dig = 0.34;
    else player.plant = 0.3;
    w.hud.hotbar.querySelector(`[data-tool="${tool}"]`).classList.remove('used');
    void w.hud.hotbar.offsetWidth;
    w.hud.hotbar.querySelector(`[data-tool="${tool}"]`).classList.add('used');
    const index = w.target;
    if (index < 0) return;
    w.origin = index;
    if (tool === 'dig') w.options.dig(index);
    else w.options.flag(index);
  }

  // ---- HUD and controls.
  const shovelIcon = '<svg viewBox="0 0 24 24"><path d="M10.5 13.5 19 5M16.8 2.8l4.4 4.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M8.6 11.2 12.8 15.4 8.4 19.8 2.6 21.4 4.2 15.6z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  const flagIcon = '<svg viewBox="0 0 24 24"><path d="M6 21V3.5M6 4h11l-3 4.2 3 4.3H6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>';

  function buildHud(w) {
    const root = document.createElement('div');
    root.className = 'world3d-hud';
    root.innerHTML = `
      <div class="world3d-crosshair" aria-hidden="true"></div>
      <div class="world3d-hotbar">
        <button type="button" data-tool="dig" aria-label="Shovel">${shovelIcon}<span>${w.touch ? 'Dig' : 'Left click'}</span></button>
        <button type="button" data-tool="flag" aria-label="Flag">${flagIcon}<span>${w.touch ? 'Flag' : 'Right click'}</span></button>
      </div>
      <div class="world3d-start ${w.touch ? 'hidden' : ''}">
        <strong>3D Mode</strong>
        <span>Click to play</span>
        <ul>
          <li><b>WASD</b> walk · <b>Shift</b> run · <b>Space</b> jump</li>
          <li><b>Mouse</b> look around</li>
          <li><b>Left click</b> shovel: dig a tile</li>
          <li><b>Right click</b> flag: mark a mine</li>
          <li><b>V</b> switch camera · <b>Esc</b> free the mouse</li>
        </ul>
      </div>
      ${w.touch ? '<div class="world3d-stick"><i></i></div><button type="button" class="world3d-jump" aria-label="Jump">Jump</button><button type="button" class="world3d-view" aria-label="Switch camera">View</button>' : ''}`;
    w.container.append(root);
    return {
      root,
      hotbar: root.querySelector('.world3d-hotbar'),
      start: root.querySelector('.world3d-start'),
      stick: root.querySelector('.world3d-stick'),
      jump: root.querySelector('.world3d-jump'),
      view: root.querySelector('.world3d-view')
    };
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

    if (!w.touch) {
      on(w.hud.start, 'click', () => {
        try {
          const request = canvas.requestPointerLock();
          if (request && request.catch) request.catch(() => {});
        } catch {
          // Some browsers refuse; the overlay just stays up.
        }
      });
      on(document, 'pointerlockchange', () => {
        w.hud.start.classList.toggle('hidden', locked());
        if (locked() && document.activeElement instanceof HTMLElement) document.activeElement.blur();
        if (!locked()) w.keys = {};
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
    syncTiles(w, now);
    animateStickman(w, now, dt);
    placeCamera(w);
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

  function makeWorld(options, container, player) {
    const w = build(options);
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
    const locked = document.pointerLockElement === renderer.domElement;
    teardown(true);
    if (!options.getGame()) return;
    world = makeWorld(options, container, sameBoard ? player : null);
    world.firstPerson = firstPerson;
    if (locked) world.hud.start.classList.add('hidden');
    world.raf = requestAnimationFrame(frame);
  }

  function initScratch() {
    scratch.m = new THREE.Matrix4();
    scratch.q = new THREE.Quaternion();
    scratch.flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    scratch.v = new THREE.Vector3();
    scratch.s = new THREE.Vector3();
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
      world = makeWorld(options, container, null);
      world.raf = requestAnimationFrame(frame);
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
    releaseMouse() {
      if (renderer && document.pointerLockElement === renderer.domElement) document.exitPointerLock();
    }
  };
})();
