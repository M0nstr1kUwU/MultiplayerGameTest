import * as THREE from 'three';

function colorFromString(value, fallback = 0xffb84d) {
  if (!value) return fallback;
  if (String(value).startsWith('#')) return Number(`0x${String(value).slice(1)}`);
  return fallback;
}

function hpBar(current, max) {
  const pct = Math.max(0, Math.min(100, (Number(current) / Math.max(1, Number(max))) * 100));
  return `<div class="bar"><span style="width:${pct}%"></span></div>`;
}

function disposeObject(object) {
  object.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose?.());
    else child.material?.dispose?.();
  });
}

export class Renderer3D {
  constructor(root) {
    this.root = root;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x11131f);
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 260);
    this.camera.position.set(0, 28, 24);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.root.append(this.renderer.domElement);
    this.visible = true;

    this.labelsLayer = document.createElement('div');
    this.labelsLayer.className = 'labels-layer';
    this.root.append(this.labelsLayer);

    this.playerMeshes = new Map();
    this.enemyMeshes = new Map();
    this.crateMeshes = new Map();
    this.dropMeshes = new Map();
    this.labels = new Map();
    this.projectileMeshes = [];
    this.telegraphMeshes = [];
    this.doorMeshes = [];
    this.mapGroup = new THREE.Group();
    this.scene.add(this.mapGroup);
    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.mapKey = '';

    this.createLights();
    this.rebuildArena({ type: 'menu' });
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('mousemove', (event) => {
      this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    });
    this.animate();
  }

  createLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 2));
    const light = new THREE.DirectionalLight(0xffffff, 1.6);
    light.position.set(10, 22, 5);
    this.scene.add(light);
  }

  clearGroup(group) {
    for (const child of [...group.children]) {
      group.remove(child);
      disposeObject(child);
    }
    this.doorMeshes = [];
  }

  rebuildArena(mode) {
    const key = JSON.stringify({
      type: mode?.type,
      room: mode?.currentRoom?.id,
      doors: mode?.currentRoom?.doors,
      doorOpen: mode?.currentRoom?.doorOpen,
      locked: mode?.currentRoom?.locked,
      theme: mode?.currentRoom?.theme?.id,
      level: mode?.level,
      arena: mode?.arena?.size
    });
    if (key === this.mapKey) return;
    this.mapKey = key;
    this.clearGroup(this.mapGroup);

    if (mode?.type === 'pve' && mode.currentRoom) this.createRoom(mode.currentRoom);
    else this.createPvpArena(mode?.arena?.size ?? 42);
  }

  createPvpArena(size) {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(size, 0.2, size), new THREE.MeshStandardMaterial({ color: 0x242842, roughness: 0.8 }));
    floor.position.y = -0.1;
    this.mapGroup.add(floor);
    this.createWallsBox({ cx: 0, cz: 0, w: size, d: size, h: 4.2, t: 1.0, wallColor: 0x303757, doors: {} });
  }

  createRoom(room) {
    const theme = room.theme ?? {};
    const floorColor = colorFromString(theme.floorColor, room.kind === 'boss' ? 0x332033 : room.kind === 'shop' ? 0x20382c : 0x252a42);
    const wallColor = colorFromString(theme.wallColor, 0x343b60);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(room.width, 0.2, room.depth), new THREE.MeshStandardMaterial({ color: floorColor, roughness: 0.82 }));
    floor.position.set(room.center.x, -0.1, room.center.z);
    floor.userData.texturePath = theme.floorTexture;
    this.mapGroup.add(floor);


    this.createWallsBox({
      cx: room.center.x,
      cz: room.center.z,
      w: room.width,
      d: room.depth,
      h: 4.6,
      t: 1.0,
      wallColor,
      doorColor: colorFromString(theme.doorColor, 0x8a6f4d),
      doors: room.doors ?? {},
      wallTexture: theme.wallTexture,
      doorTexture: theme.doorTexture
    });
  }

  createWallsBox({ cx, cz, w, d, h, t, wallColor, doorColor = 0x8a6f4d, doors = {}, wallTexture, doorTexture }) {
    const wallMat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.9 });
    const doorGap = 5.6;
    const makeWall = (x, y, z, ww, hh, dd) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, dd), wallMat);
      wall.position.set(x, y, z);
      wall.userData.texturePath = wallTexture;
      this.mapGroup.add(wall);
    };

    const makeDoorLeaf = (side, x, z, offset, sign, isOpen, isLocked, horizontal) => {
      const leafWidth = doorGap / 2 - 0.16;
      const mat = new THREE.MeshStandardMaterial({
        color: isLocked ? 0x91526a : isOpen ? 0x5d8f72 : doorColor,
        roughness: 0.78,
        emissive: isOpen ? 0x102819 : 0x1d1014
      });
      const geometry = horizontal
        ? new THREE.BoxGeometry(leafWidth, h, t * 0.82)
        : new THREE.BoxGeometry(t * 0.82, h, leafWidth);
      const door = new THREE.Mesh(geometry, mat);
      const closed = horizontal
        ? { x: x + offset, y: h / 2, z }
        : { x, y: h / 2, z: z + offset };
      const target = { ...closed, rotY: 0 };
      if (isOpen) {
        const outward = side === 'north' ? -1 : side === 'south' ? 1 : side === 'west' ? -1 : 1;
        if (horizontal) {
          target.x += sign * leafWidth * 0.96;
          target.z += outward * (t * 1.35);
          target.rotY = -outward * sign * Math.PI * 0.42;
        } else {
          target.z += sign * leafWidth * 0.96;
          target.x += outward * (t * 1.35);
          target.rotY = outward * sign * Math.PI * 0.42;
        }
      }
      door.position.set(closed.x, closed.y, closed.z);
      door.rotation.y = 0;
      door.userData.texturePath = doorTexture;
      door.userData.targetX = target.x;
      door.userData.targetY = target.y;
      door.userData.targetZ = target.z;
      door.userData.targetRotY = target.rotY;
      door.userData.isDoor = true;
      this.doorMeshes.push(door);
      this.mapGroup.add(door);
    };

    const makeDoor = (side, x, z) => {
      const info = doors?.[side];
      if (!info) return false;
      const isOpen = Boolean(info.open);
      const isLocked = Boolean(info.locked);
      const horizontal = side === 'north' || side === 'south';
      const leafOffset = doorGap / 4;
      makeDoorLeaf(side, x, z, horizontal ? -leafOffset : -leafOffset, -1, isOpen, isLocked, horizontal);
      makeDoorLeaf(side, x, z, horizontal ? leafOffset : leafOffset, 1, isOpen, isLocked, horizontal);
      return true;
    };

    const westDoor = makeDoor('west', cx - w / 2, cz);
    const eastDoor = makeDoor('east', cx + w / 2, cz);
    const northDoor = makeDoor('north', cx, cz - d / 2);
    const southDoor = makeDoor('south', cx, cz + d / 2);

    if (northDoor) {
      makeWall(cx - (w + doorGap) / 4, h / 2, cz - d / 2, (w - doorGap) / 2, h, t);
      makeWall(cx + (w + doorGap) / 4, h / 2, cz - d / 2, (w - doorGap) / 2, h, t);
    } else makeWall(cx, h / 2, cz - d / 2, w, h, t);
    if (southDoor) {
      makeWall(cx - (w + doorGap) / 4, h / 2, cz + d / 2, (w - doorGap) / 2, h, t);
      makeWall(cx + (w + doorGap) / 4, h / 2, cz + d / 2, (w - doorGap) / 2, h, t);
    } else makeWall(cx, h / 2, cz + d / 2, w, h, t);

    if (westDoor) {
      makeWall(cx - w / 2, h / 2, cz - (d + doorGap) / 4, t, h, (d - doorGap) / 2);
      makeWall(cx - w / 2, h / 2, cz + (d + doorGap) / 4, t, h, (d - doorGap) / 2);
    } else makeWall(cx - w / 2, h / 2, cz, t, h, d);
    if (eastDoor) {
      makeWall(cx + w / 2, h / 2, cz - (d + doorGap) / 4, t, h, (d - doorGap) / 2);
      makeWall(cx + w / 2, h / 2, cz + (d + doorGap) / 4, t, h, (d - doorGap) / 2);
    } else makeWall(cx + w / 2, h / 2, cz, t, h, d);
  }

  setVisible(value) {
    this.visible = Boolean(value);
    this.renderer.domElement.style.display = this.visible ? 'block' : 'none';
    this.labelsLayer.style.display = this.visible ? 'block' : 'none';
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  getAimAngle(localPlayer) {
    if (!localPlayer) return 0;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const point = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.groundPlane, point);
    return Math.atan2(point.z - localPlayer.z, point.x - localPlayer.x);
  }

  setWorldState(state, myId) {
    this.latestState = state;
    this.myId = String(myId);
    const mode = state.mode ?? { type: 'menu' };
    this.rebuildArena(mode);
    this.syncPlayers(state.players ?? [], myId);
    this.syncEnemies(mode.enemies ?? []);
    this.syncCrates(mode.crates ?? []);
    this.syncDrops(mode.drops ?? []);
    this.syncProjectiles(mode.projectiles ?? []);
    this.syncTelegraphs(mode.telegraphs ?? []);
    this.syncPortal(mode.portal);

    const me = (state.players ?? []).find((p) => p.id === String(myId));
    const target = me ?? { x: mode.currentRoom?.center?.x ?? 0, z: mode.currentRoom?.center?.z ?? 0 };
    this.camera.position.x += (target.x - this.camera.position.x) * 0.08;
    this.camera.position.z += (target.z + 22 - this.camera.position.z) * 0.08;
    this.camera.lookAt(target.x, 0, target.z);
    this.updateLabels(myId);
  }

  syncPlayers(players, myId) {
    const ids = new Set(players.map((p) => p.id));
    for (const [id, mesh] of this.playerMeshes) if (!ids.has(id)) this.removeObject(id, mesh, this.playerMeshes);
    for (const player of players) this.upsertPlayer(player, player.id === String(myId));
  }

  syncEnemies(enemies) {
    const valid = enemies.filter((e) => Number(e.hp) > 0 && Number(e.maxHp) > 0);
    const ids = new Set(valid.map((e) => e.id));
    for (const [id, mesh] of this.enemyMeshes) if (!ids.has(id)) this.removeObject(id, mesh, this.enemyMeshes);
    for (const enemy of valid) this.upsertEnemy(enemy);
  }

  syncCrates(crates) {
    const ids = new Set(crates.filter((c) => !c.opened).map((c) => c.id));
    for (const [id, mesh] of this.crateMeshes) if (!ids.has(id)) this.removeObject(id, mesh, this.crateMeshes);
    for (const crate of crates) if (!crate.opened) this.upsertCrate(crate);
  }

  syncDrops(drops) {
    const ids = new Set(drops.map((d) => d.id));
    for (const [id, mesh] of this.dropMeshes) if (!ids.has(id)) this.removeObject(id, mesh, this.dropMeshes);
    for (const drop of drops) this.upsertDrop(drop);
  }

  syncProjectiles(projectiles) {
    for (const mesh of this.projectileMeshes) {
      this.scene.remove(mesh);
      disposeObject(mesh);
    }
    this.projectileMeshes = [];
    for (const projectile of projectiles) this.addProjectile(projectile);
  }

  syncTelegraphs(telegraphs) {
    for (const mesh of this.telegraphMeshes) {
      this.scene.remove(mesh);
      disposeObject(mesh);
    }
    this.telegraphMeshes = [];
    for (const telegraph of telegraphs) this.addTelegraph(telegraph);
  }

  addTelegraph(telegraph) {
    const color = colorFromString(telegraph.color, 0xff4f70);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false });
    let mesh;
    if (telegraph.type === 'line') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(telegraph.length ?? 16, 0.04, (telegraph.width ?? 2) * 2), mat);
      mesh.position.set(telegraph.x + Math.cos(telegraph.angle) * (telegraph.length ?? 16) / 2, 0.05, telegraph.z + Math.sin(telegraph.angle) * (telegraph.length ?? 16) / 2);
      mesh.rotation.y = -telegraph.angle;
    } else {
      mesh = new THREE.Mesh(new THREE.CircleGeometry(telegraph.radius ?? 3, 40), mat);
      mesh.position.set(telegraph.x, 0.06, telegraph.z);
      mesh.rotation.x = -Math.PI / 2;
    }
    this.telegraphMeshes.push(mesh);
    this.scene.add(mesh);
  }

  syncPortal(portal) {
    if (this.portalMesh) {
      this.scene.remove(this.portalMesh);
      disposeObject(this.portalMesh);
      this.portalMesh = null;
    }
    const portalLabel = this.labels.get('portal');
    if (portalLabel) { portalLabel.el.remove(); this.labels.delete('portal'); }
    if (!portal?.active) return;
    const torus = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.14, 12, 32), new THREE.MeshStandardMaterial({ color: 0x79f2ff, emissive: 0x205b66 }));
    torus.position.set(portal.x, 0.12, portal.z);
    torus.rotation.x = Math.PI / 2;
    this.portalMesh = torus;
    this.scene.add(torus);
    this.setLabel('portal', () => `<b>Портал</b><small>E — голосовать ${portal.votes?.length ?? 0}/${portal.required?.length ?? '?'}</small>`, torus, 2.0);
  }

  removeObject(id, mesh, map) {
    this.scene.remove(mesh);
    disposeObject(mesh);
    map.delete(id);
    const label = this.labels.get(id);
    if (label) {
      label.el.remove();
      this.labels.delete(id);
    }
  }

  createPlayerMesh(player, isMe) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: colorFromString(player.color, isMe ? 0x6d7cff : 0x56d6a6), roughness: 0.62 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.1, 6, 12), bodyMat);
    body.position.y = 0.9;
    body.userData.role = 'body';
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), bodyMat);
    head.position.y = 1.8;
    head.userData.role = 'body';
    const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.18), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
    weapon.position.set(0.68, 1.05, 0);
    weapon.userData.role = 'weapon';
    const arc = new THREE.Mesh(new THREE.TorusGeometry(1.65, 0.035, 8, 18, Math.PI * 1.15), new THREE.MeshStandardMaterial({ color: 0xfff1a6, emissive: 0x665000, transparent: true, opacity: 0.72 }));
    arc.rotation.x = Math.PI / 2;
    arc.position.set(0.65, 0.55, 0);
    arc.visible = false;
    arc.userData.role = 'swing';
    const shield = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 24, 12),
      new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0.18, depthWrite: false })
    );
    shield.position.y = 1.12;
    shield.scale.set(1, 1.18, 1);
    shield.visible = false;
    shield.userData.role = 'shield';
    group.add(body, head, weapon, arc, shield);
    group.userData.kind = 'player';
    return group;
  }

  upsertPlayer(player, isMe) {
    let mesh = this.playerMeshes.get(player.id);
    if (!mesh) {
      mesh = this.createPlayerMesh(player, isMe);
      this.playerMeshes.set(player.id, mesh);
      this.scene.add(mesh);
    }
    mesh.userData.entity = player;
    mesh.visible = player.alive || player.downed || player.spectator;
    mesh.position.set(player.x, 0, player.z);
    mesh.rotation.y = -player.rot;
    mesh.scale.set(1, player.downed ? 0.32 : 1, 1);
    for (const child of mesh.children) {
      if (child.userData.role === 'body') child.material.color.setHex(colorFromString(player.color, isMe ? 0x6d7cff : 0x56d6a6));
      if (child.userData.role === 'swing') {
        child.visible = (player.swingTimer ?? 0) > 0;
        child.rotation.z = (1 - Math.min(1, (player.swingTimer ?? 0) / 0.22)) * Math.PI * 0.7;
      }
      if (child.userData.role === 'shield') {
        child.visible = !isMe && Number(player.shield ?? 0) > 0 && player.alive;
        const scale = 1 + Math.min(0.35, Number(player.shield ?? 0) * 0.03);
        child.scale.set(scale, scale * 1.18, scale);
      }
    }
    if (!isMe) {
      const status = player.downed ? ` · Воскр.: ${Number(player.reviveProgress ?? 0).toFixed(1)}/5с` : '';
      this.setLabel(player.id, () => `<b>${player.username}</b>${hpBar(player.hp, player.maxHp)}<small>${player.hp}/${player.maxHp} HP${Number(player.shield ?? 0) > 0 ? ` · 🛡 ${player.shield}` : ''}${player.ability ? ` · ${player.ability.name}: ${player.ability.cooldown.toFixed(1)}с` : ''}${status}</small>`, mesh, player.downed ? 1.05 : 2.65);
    }
  }

  createEnemyMesh(enemy) {
    const group = new THREE.Group();
    const size = enemy.kind === 'boss' ? 2.2 : 1.1;
    const mat = new THREE.MeshStandardMaterial({ color: colorFromString(enemy.color, enemy.kind === 'boss' ? 0xd94f70 : 0xffb84d), roughness: 0.68 });
    const core = enemy.kind === 'boss'
      ? new THREE.Mesh(new THREE.DodecahedronGeometry(size * 0.75, 0), mat)
      : new THREE.Mesh(new THREE.CapsuleGeometry(size * 0.38, size * 0.55, 5, 10), mat);
    core.position.y = enemy.kind === 'boss' ? 1.5 : 0.8;
    group.add(core);
    if (enemy.kind === 'boss' || enemy.ranged) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(size * 0.42, size * 0.1, size * 0.08), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222 }));
      eye.position.set(size * 0.38, enemy.kind === 'boss' ? 1.65 : 1.05, 0);
      group.add(eye);
    }
    group.userData.kind = 'enemy';
    return group;
  }

  upsertEnemy(enemy) {
    let mesh = this.enemyMeshes.get(enemy.id);
    if (!mesh) {
      mesh = this.createEnemyMesh(enemy);
      this.enemyMeshes.set(enemy.id, mesh);
      this.scene.add(mesh);
    }
    mesh.userData.entity = enemy;
    mesh.position.x = enemy.x;
    mesh.position.z = enemy.z;
    mesh.rotation.y = -Number(enemy.rot ?? 0);
    this.setLabel(enemy.id, () => `<b>${enemy.name ?? enemy.type}</b>${hpBar(enemy.hp, enemy.maxHp)}<small>${enemy.hp}/${enemy.maxHp} HP${enemy.kind === 'boss' ? ` · стадия ${enemy.stage ?? 1}` : ''}${enemy.statusEffects?.length ? ` · ${enemy.statusEffects.map((e) => e.name ?? e.id).join(', ')}` : ''}${enemy.ability ? ` · ${enemy.ability}: ${Number(enemy.abilityCooldown ?? 0).toFixed(1)}с` : ''}</small>`, mesh, enemy.kind === 'boss' ? 3.5 : 2.0);
  }

  upsertCrate(crate) {
    let mesh = this.crateMeshes.get(crate.id);
    if (!mesh) {
      const mat = new THREE.MeshStandardMaterial({ color: crate.kind === 'ability' ? 0x9f7cff : 0xb8844d, roughness: 0.7 });
      mesh = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.1, 1.35), mat);
      box.position.y = 0.55;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 1.5), new THREE.MeshStandardMaterial({ color: 0x2d2330, roughness: 0.8 }));
      lid.position.y = 1.2;
      mesh.add(box, lid);
      mesh.userData.texturePath = crate.groundTexture;
      this.crateMeshes.set(crate.id, mesh);
      this.scene.add(mesh);
    }
    mesh.position.set(crate.x, 0, crate.z);
  }

  upsertDrop(drop) {
    let mesh = this.dropMeshes.get(drop.id);
    if (!mesh) {
      let geometry;
      if (drop.type === 'weapon') geometry = new THREE.BoxGeometry(1.2, 0.22, 0.35);
      else if (drop.type === 'revive') geometry = new THREE.OctahedronGeometry(0.45, 0);
      else geometry = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 12);
      const material = new THREE.MeshStandardMaterial({ color: drop.type === 'weapon' ? 0x8fd8ff : drop.type === 'heal' ? 0x59e08b : drop.type === 'revive' ? 0xff74d4 : 0xffdc73, emissive: drop.type === 'revive' ? 0x44113a : 0x000000 });
      mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = 0.25;
      mesh.userData.texturePath = drop.groundTexture ?? drop.weapon?.groundTexture;
      this.dropMeshes.set(drop.id, mesh);
      this.scene.add(mesh);
    }
    mesh.position.set(drop.x, 0.25, drop.z);
    mesh.rotation.y += 0.05;
    const me = this.latestState?.players?.find((player) => player.id === this.myId);
    const near = me && Math.hypot((me.x ?? 0) - drop.x, (me.z ?? 0) - drop.z) <= 3.0;
    if (!near) {
      this.deleteLabel(drop.id);
      return;
    }
    const labelText = drop.type === 'weapon' ? drop.weapon?.name : drop.type === 'magazine' ? `${drop.magazine.type} x${drop.magazine.amount}` : drop.type === 'revive' ? `Resurrect x${drop.amount}` : `Heal +${drop.amount}`;
    this.setLabel(drop.id, () => `<b>${labelText}</b><small>E — подобрать</small>`, mesh, 1.2);
  }

  addProjectile(projectile) {
    const pColor = colorFromString(projectile.color, projectile.enemy ? 0xff6d8c : 0xffffff);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(projectile.enemy ? 0.25 : 0.18, 12, 12), new THREE.MeshStandardMaterial({ color: pColor, emissive: projectile.enemy ? 0x33111a : 0x222222 }));
    mesh.position.set(projectile.x, 0.45, projectile.z);
    this.projectileMeshes.push(mesh);
    this.scene.add(mesh);
  }

  deleteLabel(id) {
    const label = this.labels.get(id);
    if (!label) return;
    label.el.remove();
    this.labels.delete(id);
  }

  setLabel(id, htmlFactory, mesh, yOffset) {
    let label = this.labels.get(id);
    if (!label) {
      const el = document.createElement('div');
      el.className = 'world-label';
      this.labelsLayer.append(el);
      label = { el, htmlFactory, mesh, yOffset };
      this.labels.set(id, label);
    }
    label.htmlFactory = htmlFactory;
    label.mesh = mesh;
    label.yOffset = yOffset;
  }

  updateLabels(myId) {
    const vector = new THREE.Vector3();
    for (const [id, label] of this.labels) {
      if (!label.mesh.visible) {
        label.el.style.display = 'none';
        continue;
      }
      label.el.style.display = 'block';
      vector.set(label.mesh.position.x, label.yOffset, label.mesh.position.z);
      vector.project(this.camera);
      const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;
      label.el.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
      label.el.innerHTML = label.htmlFactory(myId);
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    if (this.portalMesh) this.portalMesh.rotation.z += 0.015;
    for (const door of this.doorMeshes) {
      door.position.x += ((door.userData.targetX ?? door.position.x) - door.position.x) * 0.08;
      door.position.y += ((door.userData.targetY ?? door.position.y) - door.position.y) * 0.08;
      door.position.z += ((door.userData.targetZ ?? door.position.z) - door.position.z) * 0.08;
      door.rotation.y += ((door.userData.targetRotY ?? door.rotation.y) - door.rotation.y) * 0.08;
    }
    if (this.visible) this.renderer.render(this.scene, this.camera);
    if (this.latestState) this.updateLabels();
  }

  destroy() {
    this.renderer.dispose();
    this.root.innerHTML = '';
  }
}
