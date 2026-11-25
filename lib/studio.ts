import * as THREE from "three";

/** A tiny photo studio: dark room, one off-axis softbox, two strip lights. Baked via PMREM. */
export function buildEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const studio = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(120, 80, 120),
    new THREE.MeshBasicMaterial({ color: "#2a2a31", side: THREE.BackSide }),
  );
  studio.add(room);

  const panel = (w: number, h: number, intensity: number, pos: [number, number, number], tint = "#fff4e0") => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    studio.add(m);
  };
  panel(26, 16, 6, [-22, 20, 20]); // key softbox, off-axis
  panel(3, 40, 11, [30, 4, 12], "#ffe9d0"); // strip · edge line
  panel(3, 40, 8, [-32, 2, -14], "#d8e6ff"); // strip · edge line (rim)
  panel(70, 30, 2.4, [0, 38, 0], "#dfe6ff"); // overhead fill
  panel(60, 4, 0.35, [0, -30, 0], "#ff3b2f"); // faint red floor kick, brand accent

  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(studio, 0.02).texture;
  pmrem.dispose();
  return tex;
}
