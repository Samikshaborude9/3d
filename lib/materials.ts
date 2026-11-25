import * as THREE from "three";

/** Brushed direction texture generated in code. RG = direction, B = strength. */
function brushedMap(): THREE.CanvasTexture {
  const w = 256, h = 256;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const jitter = (Math.random() - 0.5) * 22; // each streak slightly off-axis
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 128 + jitter;
      img.data[i + 2] = 200 + Math.random() * 55;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export interface Mats {
  black: THREE.MeshPhysicalMaterial;
  silver: THREE.MeshPhysicalMaterial;
  chrome: THREE.MeshPhysicalMaterial;
  red: THREE.MeshPhysicalMaterial;
  glass: THREE.MeshPhysicalMaterial;
  hidden: THREE.MeshBasicMaterial;
  line: THREE.LineBasicMaterial;
}

export function makeMaterials(): Mats {
  const brushed = brushedMap();
  const metal = (color: string, roughness: number, aniso = 0.8) =>
    new THREE.MeshPhysicalMaterial({
      color, metalness: 1, roughness, anisotropy: aniso, anisotropyMap: brushed,
      envMapIntensity: 1.25,
    });
  return {
    black: metal("#74747c", 0.34, 0.7), // anodised barrel
    silver: metal("#a6a29c", 0.3), // satin face
    chrome: new THREE.MeshPhysicalMaterial({ color: "#e4e0d8", metalness: 1, roughness: 0.07, envMapIntensity: 1.5 }), // polished edge
    red: new THREE.MeshPhysicalMaterial({
      color: "#c4140f", metalness: 1, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2,
    }),
    // Glass reflects the studio environment only — no direct lights in the scene.
    glass: new THREE.MeshPhysicalMaterial({
      color: "#06080b", metalness: 0, roughness: 0.02, ior: 1.55, clearcoat: 1,
      clearcoatRoughness: 0, iridescence: 0.7, iridescenceIOR: 1.3,
      iridescenceThicknessMinimum: 120, iridescenceThicknessMaximum: 420, envMapIntensity: 1.8,
    }),
    hidden: Object.assign(new THREE.MeshBasicMaterial(), { visible: false }),
    line: new THREE.LineBasicMaterial({ color: "#ff4a3d" }),
  };
}
