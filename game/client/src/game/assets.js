import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map();

export const MODEL_REGISTRY = {
  player: '/assets/models/player.glb',
  slime: '/assets/models/slime.glb',
  goblin: '/assets/models/goblin.glb',
  archer: '/assets/models/archer.glb',
  boss_necro_cube: '/assets/models/boss_necro_cube.glb',
  crate_weapon: '/assets/models/crate_weapon.glb',
  door: '/assets/models/door.glb',
  portal: '/assets/models/portal.glb'
};

export async function loadModel(id) {
  const url = MODEL_REGISTRY[id];
  if (!url) return null;
  if (cache.has(url)) return cache.get(url).clone(true);
  try {
    const gltf = await loader.loadAsync(url);
    cache.set(url, gltf.scene);
    return gltf.scene.clone(true);
  } catch {
    return null;
  }
}

export function fallbackBox(width, height, depth, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color })
  );
  mesh.position.y = height / 2;
  return mesh;
}
