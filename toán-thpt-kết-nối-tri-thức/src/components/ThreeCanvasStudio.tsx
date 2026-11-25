import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LabCommandSet } from '../types';
import { compileMathExpression, parseDesmosCommandsForCanvas } from '../utils/graph2dMath';

interface ThreeCanvasStudioProps {
  commandSet: LabCommandSet;
  isAutoRotating: boolean;
  objectOpacity: number;
  highlightColor: string;
  showHiddenEdges?: boolean;
}

function createVertexLabelSprite(text: string, color = '#E2E8F0'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 128, 128);
    ctx.font = '800 54px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#070B19';
    ctx.lineWidth = 10;
    ctx.strokeText(text, 64, 64);
    ctx.fillStyle = color;
    ctx.fillText(text, 64, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.68, 0.68, 0.68);
  sprite.renderOrder = 10;
  return sprite;
}

function addVertexMarker(
  parent: THREE.Group,
  pos: THREE.Vector3,
  label: string,
  colorHex: string,
  offset = new THREE.Vector3(0, 0.35, 0)
) {
  const dotGeom = new THREE.SphereGeometry(0.085, 16, 16);
  const dotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFFFFF') });
  const dot = new THREE.Mesh(dotGeom, dotMat);
  dot.position.copy(pos);
  dot.renderOrder = 5;
  parent.add(dot);

  const haloGeom = new THREE.SphereGeometry(0.13, 16, 16);
  const haloMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(colorHex),
    transparent: true,
    opacity: 0.45,
  });
  const halo = new THREE.Mesh(haloGeom, haloMat);
  halo.position.copy(pos);
  halo.renderOrder = 4;
  parent.add(halo);

  const sprite = createVertexLabelSprite(label, '#F8FAFC');
  sprite.position.copy(pos).add(offset);
  parent.add(sprite);
}

function addDualPassEdgeCurve(
  parent: THREE.Group,
  edgeGeom: THREE.BufferGeometry,
  visibleColor: string,
  showHiddenEdges: boolean,
  alwaysDashed = false
) {
  if (!alwaysDashed) {
    const visibleMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(visibleColor),
      transparent: true,
      opacity: 0.98,
      depthTest: true,
      depthWrite: false,
    });
    const visibleLines = new THREE.LineSegments(edgeGeom, visibleMat);
    visibleLines.renderOrder = 3;
    parent.add(visibleLines);
  }

  const hiddenMat = new THREE.LineDashedMaterial({
    color: new THREE.Color(visibleColor),
    dashSize: 0.22,
    gapSize: 0.14,
    transparent: true,
    opacity: alwaysDashed ? 0.78 : 0.62,
    depthTest: false,
    depthWrite: false,
  });
  const hiddenLines = new THREE.LineSegments(edgeGeom, hiddenMat);
  hiddenLines.computeLineDistances();
  hiddenLines.renderOrder = 2;
  hiddenLines.visible = showHiddenEdges || alwaysDashed;
  if (!alwaysDashed) {
    hiddenLines.userData.isHiddenEdge = true;
  }
  parent.add(hiddenLines);
}

function addDualPassSolid(
  parent: THREE.Group,
  geom: THREE.BufferGeometry,
  colorHex: string,
  opacity: number,
  showHiddenEdges: boolean,
  edgeThresholdDeg = 1,
  includeAutoEdges = true
) {
  // Depth pre-pass mesh guarantees accurate occlusion even when solid faces are translucent
  const depthMat = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    side: THREE.DoubleSide,
  });
  const depthMesh = new THREE.Mesh(geom, depthMat);
  depthMesh.renderOrder = 0;
  parent.add(depthMesh);

  // Shaded PBR surface mesh
  const faceMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(colorHex),
    transparent: true,
    opacity,
    roughness: 0.24,
    metalness: 0.1,
    clearcoat: 0.35,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const faceMesh = new THREE.Mesh(geom, faceMat);
  faceMesh.renderOrder = 1;
  parent.add(faceMesh);

  if (includeAutoEdges) {
    const edgesGeom = new THREE.EdgesGeometry(geom, edgeThresholdDeg);
    addDualPassEdgeCurve(parent, edgesGeom, '#E0F2FE', showHiddenEdges, false);
  }
}

function buildSquarePyramidGeometry(halfBase: number, height: number): {
  geom: THREE.BufferGeometry;
  vertices: { S: THREE.Vector3; A: THREE.Vector3; B: THREE.Vector3; C: THREE.Vector3; D: THREE.Vector3; O: THREE.Vector3 };
} {
  const A = new THREE.Vector3(-halfBase, 0, halfBase);
  const B = new THREE.Vector3(halfBase, 0, halfBase);
  const C = new THREE.Vector3(halfBase, 0, -halfBase);
  const D = new THREE.Vector3(-halfBase, 0, -halfBase);
  const S = new THREE.Vector3(0, height, 0);
  const O = new THREE.Vector3(0, 0, 0);

  const positions = [
    // Base ABCD (2 triangles)
    A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z,
    A.x, A.y, A.z, C.x, C.y, C.z, D.x, D.y, D.z,
    // 4 Lateral faces
    A.x, A.y, A.z, B.x, B.y, B.z, S.x, S.y, S.z,
    B.x, B.y, B.z, C.x, C.y, C.z, S.x, S.y, S.z,
    C.x, C.y, C.z, D.x, D.y, D.z, S.x, S.y, S.z,
    D.x, D.y, D.z, A.x, A.y, A.z, S.x, S.y, S.z,
  ];
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return { geom, vertices: { S, A, B, C, D, O } };
}

function buildTetrahedronGeometry(radius: number, height: number): {
  geom: THREE.BufferGeometry;
  vertices: { S: THREE.Vector3; A: THREE.Vector3; B: THREE.Vector3; C: THREE.Vector3; O: THREE.Vector3 };
} {
  const angle0 = Math.PI / 6;
  const A = new THREE.Vector3(radius * Math.cos(angle0), 0, radius * Math.sin(angle0));
  const B = new THREE.Vector3(
    radius * Math.cos(angle0 + (2 * Math.PI) / 3),
    0,
    radius * Math.sin(angle0 + (2 * Math.PI) / 3)
  );
  const C = new THREE.Vector3(
    radius * Math.cos(angle0 + (4 * Math.PI) / 3),
    0,
    radius * Math.sin(angle0 + (4 * Math.PI) / 3)
  );
  const S = new THREE.Vector3(0, height, 0);
  const O = new THREE.Vector3(0, 0, 0);

  const positions = [
    A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z,
    A.x, A.y, A.z, B.x, B.y, B.z, S.x, S.y, S.z,
    B.x, B.y, B.z, C.x, C.y, C.z, S.x, S.y, S.z,
    C.x, C.y, C.z, A.x, A.y, A.z, S.x, S.y, S.z,
  ];
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return { geom, vertices: { S, A, B, C, O } };
}

function buildCircleLoopGeometry(radius: number, segments = 64): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < segments; i++) {
    const a1 = (i / segments) * Math.PI * 2;
    const a2 = ((i + 1) / segments) * Math.PI * 2;
    pts.push(
      new THREE.Vector3(radius * Math.cos(a1), 0, radius * Math.sin(a1)),
      new THREE.Vector3(radius * Math.cos(a2), 0, radius * Math.sin(a2))
    );
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    const anyObj = obj as THREE.Mesh & { material?: THREE.Material | THREE.Material[] };
    if (anyObj.geometry) {
      anyObj.geometry.dispose();
    }
    if (anyObj.material) {
      const mats = Array.isArray(anyObj.material) ? anyObj.material : [anyObj.material];
      mats.forEach((m) => {
        const texMat = m as THREE.SpriteMaterial;
        if (texMat.map) texMat.map.dispose();
        m.dispose();
      });
    }
  });
}

export const ThreeCanvasStudio: React.FC<ThreeCanvasStudioProps> = ({
  commandSet,
  isAutoRotating,
  objectOpacity,
  highlightColor,
  showHiddenEdges = true,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const requestRenderRef = useRef<() => void>(() => {});
  const autoRotateRef = useRef<boolean>(isAutoRotating);
  const showHiddenEdgesRef = useRef<boolean>(showHiddenEdges);

  useEffect(() => {
    autoRotateRef.current = isAutoRotating;
    requestRenderRef.current();
  }, [isAutoRotating]);

  useEffect(() => {
    showHiddenEdgesRef.current = showHiddenEdges;
    const group = groupRef.current;
    if (group) {
      group.traverse((obj) => {
        if (obj.userData?.isHiddenEdge) {
          obj.visible = showHiddenEdges;
        }
      });
      requestRenderRef.current();
    }
  }, [showHiddenEdges]);

  // Initialize isolated WebGLRenderer once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 520;

    // Detect software GL fallback (SwiftShader / llvmpipe) to prevent CPU stutter
    let isSoftwareGl = false;
    try {
      const probeCanvas = document.createElement('canvas');
      const probeGl =
        probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
      if (probeGl) {
        const dbg = probeGl.getExtension('WEBGL_debug_renderer_info');
        if (dbg) {
          const rendererStr = String(
            probeGl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || ''
          );
          isSoftwareGl = /SwiftShader|llvmpipe|Software/i.test(rendererStr);
        }
      }
    } catch {
      isSoftwareGl = false;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0B1021');

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 200);
    let zoomDist = 12.2;
    let rotX = 0.28;
    let rotY = 0.62;
    const updateCameraPos = () => {
      const dir = new THREE.Vector3(6, 4.6, 8).normalize();
      camera.position.copy(dir.multiplyScalar(zoomDist));
      camera.lookAt(0, 1.35, 0);
    };
    updateCameraPos();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.appendChild(renderer.domElement);

    // Environment & Lighting (RoomEnvironment PMREM)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.65);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0x22d3ee, 1.35);
    keyLight.position.set(6, 11, 7);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x8b5cf6, 1.15);
    rimLight.position.set(-7, 4, -6);
    scene.add(rimLight);

    // Grid & Oxyz Axes
    const gridHelper = new THREE.GridHelper(12, 12, 0x3b82f6, 0x1e293b);
    gridHelper.position.y = -0.005;
    scene.add(gridHelper);

    const axesGroup = new THREE.Group();
    const makeAxis = (to: THREE.Vector3, from: THREE.Vector3, color: number) => {
      const g = new THREE.BufferGeometry().setFromPoints([from, to]);
      const m = new THREE.LineBasicMaterial({ color });
      return new THREE.Line(g, m);
    };
    axesGroup.add(makeAxis(new THREE.Vector3(5.5, 0, 0), new THREE.Vector3(-5.5, 0, 0), 0xf43f5e));
    axesGroup.add(makeAxis(new THREE.Vector3(0, 5.5, 0), new THREE.Vector3(0, -3.0, 0), 0x06b6d4));
    axesGroup.add(makeAxis(new THREE.Vector3(0, 0, 5.5), new THREE.Vector3(0, 0, -5.5), 0x3b82f6));
    scene.add(axesGroup);

    const mathGroup = new THREE.Group();
    scene.add(mathGroup);
    groupRef.current = mathGroup;

    // Paced / On-Demand Render Scheduler
    let rafId = 0;
    let paceTimerId = 0;
    let renderRequested = false;
    let disposed = false;
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;
    let lastTime = performance.now();

    const renderFrame = (now: number) => {
      rafId = 0;
      renderRequested = false;
      if (disposed) return;

      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      if (autoRotateRef.current && !isDragging) {
        rotY += dt * 0.45;
      }

      mathGroup.rotation.x = rotX;
      mathGroup.rotation.y = rotY;
      renderer.render(scene, camera);

      if (autoRotateRef.current && !isDragging) {
        if (isSoftwareGl) {
          paceTimerId = window.setTimeout(() => {
            if (!disposed) {
              rafId = requestAnimationFrame(renderFrame);
            }
          }, 70);
        } else {
          rafId = requestAnimationFrame(renderFrame);
        }
      }
    };

    const requestRender = () => {
      if (disposed || renderRequested || rafId !== 0) return;
      renderRequested = true;
      rafId = requestAnimationFrame(renderFrame);
    };
    requestRenderRef.current = requestRender;
    requestRender();

    // Mouse / Pointer Drag + Wheel Zoom
    const domElem = renderer.domElement;
    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
      domElem.setPointerCapture?.(e.pointerId);
      requestRender();
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      rotY += dx * 0.0085;
      rotX = Math.max(-1.35, Math.min(1.35, rotX + dy * 0.0085));
      prevX = e.clientX;
      prevY = e.clientY;
      requestRender();
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!isDragging) return;
      isDragging = false;
      domElem.releasePointerCapture?.(e.pointerId);
      requestRender();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomDist = Math.max(5.2, Math.min(22, zoomDist + (e.deltaY > 0 ? 0.85 : -0.85)));
      updateCameraPos();
      requestRender();
    };
    const onDoubleClick = () => {
      rotX = 0.34;
      rotY = 0.62;
      zoomDist = 10.5;
      updateCameraPos();
      requestRender();
    };

    domElem.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    domElem.addEventListener('wheel', onWheel, { passive: false });
    domElem.addEventListener('dblclick', onDoubleClick);

    const handleResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || 640;
      const h = container.clientHeight || 520;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    const resizeObs = new ResizeObserver(handleResize);
    resizeObs.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      clearTimeout(paceTimerId);
      resizeObs.disconnect();
      domElem.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      domElem.removeEventListener('wheel', onWheel);
      domElem.removeEventListener('dblclick', onDoubleClick);
      disposeObjectTree(scene);
      envTarget.dispose();
      renderer.dispose();
      if (container.contains(domElem)) {
        container.removeChild(domElem);
      }
    };
  }, []);

  // Rebuild 3D model when commandSet, opacity, or highlightColor changes
  useEffect(() => {
    const mathGroup = groupRef.current;
    if (!mathGroup) return;

    while (mathGroup.children.length > 0) {
      const child = mathGroup.children[0];
      mathGroup.remove(child);
      disposeObjectTree(child);
    }

    const titleLower = `${commandSet.title || ''} ${commandSet.notes || ''} ${(commandSet.geogebra3d || []).join(' ')}`.toLowerCase();
    const colorHex = highlightColor || '#06B6D4';
    const hiddenEnabled = showHiddenEdgesRef.current;

    if (titleLower.includes('tứ diện') || titleLower.includes('tetra')) {
      const { geom, vertices } = buildTetrahedronGeometry(2.4, 3.6);
      addDualPassSolid(mathGroup, geom, colorHex, objectOpacity, hiddenEnabled, 1, true);

      // Altitude SO (always behind faces -> naturally renders dashed through depth occlusion)
      const soGeom = new THREE.BufferGeometry().setFromPoints([vertices.S, vertices.O]);
      addDualPassEdgeCurve(mathGroup, soGeom, '#F59E0B', true, false);

      addVertexMarker(mathGroup, vertices.S, 'S', colorHex, new THREE.Vector3(0, 0.36, 0));
      addVertexMarker(mathGroup, vertices.A, 'A', colorHex, new THREE.Vector3(0.32, -0.1, 0.32));
      addVertexMarker(mathGroup, vertices.B, 'B', colorHex, new THREE.Vector3(-0.36, -0.1, 0.2));
      addVertexMarker(mathGroup, vertices.C, 'C', colorHex, new THREE.Vector3(0.15, -0.1, -0.36));
      addVertexMarker(mathGroup, vertices.O, 'O', '#F59E0B', new THREE.Vector3(0.26, 0.12, 0.2));
    } else if (
      titleLower.includes('chóp') ||
      titleLower.includes('pyramid')
    ) {
      const { geom, vertices } = buildSquarePyramidGeometry(2.1, 3.8);
      addDualPassSolid(mathGroup, geom, colorHex, objectOpacity, hiddenEnabled, 1, true);

      // Base diagonals AC, BD & Altitude SO (dual-pass: hidden behind solid faces -> dashed automatically!)
      const diagGeom = new THREE.BufferGeometry().setFromPoints([
        vertices.A,
        vertices.C,
        vertices.B,
        vertices.D,
      ]);
      addDualPassEdgeCurve(mathGroup, diagGeom, '#94A3B8', hiddenEnabled, false);

      const soGeom = new THREE.BufferGeometry().setFromPoints([vertices.S, vertices.O]);
      addDualPassEdgeCurve(mathGroup, soGeom, '#F59E0B', hiddenEnabled, false);

      addVertexMarker(mathGroup, vertices.S, 'S', colorHex, new THREE.Vector3(0, 0.38, 0));
      addVertexMarker(mathGroup, vertices.A, 'A', colorHex, new THREE.Vector3(-0.32, -0.05, 0.32));
      addVertexMarker(mathGroup, vertices.B, 'B', colorHex, new THREE.Vector3(0.32, -0.05, 0.32));
      addVertexMarker(mathGroup, vertices.C, 'C', colorHex, new THREE.Vector3(0.32, -0.05, -0.32));
      addVertexMarker(mathGroup, vertices.D, 'D', colorHex, new THREE.Vector3(-0.32, -0.05, -0.32));
      addVertexMarker(mathGroup, vertices.O, 'O', '#F59E0B', new THREE.Vector3(0.24, 0.14, 0.24));
    } else if (
      titleLower.includes('hộp') ||
      titleLower.includes('lập phương') ||
      titleLower.includes('lăng trụ') ||
      titleLower.includes('prism')
    ) {
      const isTriPrism = titleLower.includes('tam giác');
      const geom = isTriPrism
        ? new THREE.CylinderGeometry(2.0, 2.0, 3.4, 3)
        : new THREE.BoxGeometry(3.2, 3.2, 3.2);
      geom.translate(0, 1.65, 0);
      addDualPassSolid(mathGroup, geom, colorHex, objectOpacity, hiddenEnabled, 1, true);

      if (!isTriPrism) {
        const s = 1.6;
        const diag = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-s, 0.05, s),
          new THREE.Vector3(s, 3.25, -s),
        ]);
        addDualPassEdgeCurve(mathGroup, diag, '#F59E0B', hiddenEnabled, false);
      }
    } else if (titleLower.includes('cầu') || titleLower.includes('sphere')) {
      const sphereRadius = 2.25;
      const centerPos = new THREE.Vector3(0, 1.5, 0);
      const geom = new THREE.SphereGeometry(sphereRadius, 36, 28);
      geom.translate(centerPos.x, centerPos.y, centerPos.z);
      addDualPassSolid(mathGroup, geom, colorHex, objectOpacity, hiddenEnabled, 18, false);

      // Clean Equator & Meridian dual-pass curves (visible front solid, hidden back dashed!)
      const equator = buildCircleLoopGeometry(sphereRadius * 1.004, 72);
      equator.translate(centerPos.x, centerPos.y, centerPos.z);
      addDualPassEdgeCurve(mathGroup, equator, '#E0F2FE', hiddenEnabled, false);

      const meridian1 = buildCircleLoopGeometry(sphereRadius * 1.004, 72);
      meridian1.rotateX(Math.PI / 2);
      meridian1.translate(centerPos.x, centerPos.y, centerPos.z);
      addDualPassEdgeCurve(mathGroup, meridian1, '#93C5FD', hiddenEnabled, false);

      addVertexMarker(mathGroup, centerPos, 'I', '#F59E0B', new THREE.Vector3(0.25, 0.3, 0));

      if (titleLower.includes('mặt phẳng') || titleLower.includes('plane') || titleLower.includes('giao tuyến')) {
        // Intersecting Plane + Geometrically Exact Circular Section
        const d = 0.85;
        const planeGroup = new THREE.Group();
        planeGroup.position.copy(centerPos);
        planeGroup.rotation.set(-Math.PI / 2 + 0.38, 0.16, 0.2);

        const planeGeom = new THREE.PlaneGeometry(6.0, 6.0);
        planeGeom.translate(0, 0, -d);
        const planeMat = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color('#8B5CF6'),
          transparent: true,
          opacity: 0.26,
          side: THREE.DoubleSide,
          roughness: 0.3,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        });
        const planeMesh = new THREE.Mesh(planeGeom, planeMat);
        planeMesh.renderOrder = 1;
        planeGroup.add(planeMesh);

        const planeEdges = new THREE.EdgesGeometry(planeGeom, 1);
        const planeBorder = new THREE.LineSegments(
          planeEdges,
          new THREE.LineBasicMaterial({ color: 0xa78bfa })
        );
        planeGroup.add(planeBorder);

        // Exact intersection circle radius r = sqrt(R^2 - d^2) in local XY plane at z = -d
        const rCircle = Math.sqrt(Math.max(0.5, sphereRadius * sphereRadius - d * d));
        const interRing = buildCircleLoopGeometry(rCircle, 72);
        interRing.rotateX(Math.PI / 2);
        interRing.translate(0, 0, -d);
        addDualPassEdgeCurve(planeGroup, interRing, '#F59E0B', hiddenEnabled, false);

        // Radius & distance segment IH inside sphere (hidden behind sphere surface -> dashed!)
        const ihGeom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, 0, -d),
          new THREE.Vector3(0, 0, -d),
          new THREE.Vector3(rCircle, 0, -d),
        ]);
        addDualPassEdgeCurve(planeGroup, ihGeom, '#FBBF24', hiddenEnabled, false);

        mathGroup.add(planeGroup);
      }
    } else if (titleLower.includes('tròn xoay') || titleLower.includes('solid')) {
      // Sample actual function f(x) from desmos2d if possible, else sqrt(x)
      const parsed = parseDesmosCommandsForCanvas(commandSet.desmos2d || []);
      const activeFn = parsed.functions[0]?.fn || compileMathExpression('sqrt(x)')!;
      const [rawA, rawB] = parsed.shadedRegions[0]
        ? [parsed.shadedRegions[0].a, parsed.shadedRegions[0].b]
        : parsed.functions[0]?.domain || [0, 4];

      const lo = Number.isFinite(rawA) ? rawA : 0;
      const hi = Number.isFinite(rawB) && rawB > lo ? rawB : lo + 4;
      const span = hi - lo;
      const scaleX = 4.2 / Math.max(span, 0.5);

      // Compute max radius to keep lathe nicely framed
      let maxR = 0.5;
      for (let i = 0; i <= 32; i++) {
        const x = lo + (span * i) / 32;
        const y = Math.abs(activeFn(x));
        if (Number.isFinite(y)) maxR = Math.max(maxR, y);
      }
      const scaleR = Math.min(1.6, 2.2 / Math.max(maxR, 0.5));

      const curvePoints: THREE.Vector2[] = [];
      for (let i = 0; i <= 36; i++) {
        const t = i / 36;
        const x = lo + span * t;
        const yVal = Math.abs(activeFn(x));
        const r = Number.isFinite(yVal) ? Math.max(0.03, yVal * scaleR) : 0.03;
        const latheY = (t - 0.5) * span * scaleX;
        curvePoints.push(new THREE.Vector2(r, latheY));
      }

      const geom = new THREE.LatheGeometry(curvePoints, 36);
      // Orient Lathe along X axis and lift slightly above y = 0 grid floor
      geom.rotateZ(-Math.PI / 2);
      geom.translate(0, 1.8, 0);

      addDualPassSolid(mathGroup, geom, colorHex, objectOpacity, hiddenEnabled, 22, false);

      // Add front/back end-cap circles with Dual-Pass visible/hidden rendering
      const rStart = curvePoints[0].x;
      const rEnd = curvePoints[curvePoints.length - 1].x;
      const xStart = curvePoints[0].y;
      const xEnd = curvePoints[curvePoints.length - 1].y;

      [
        { x: xStart, r: rStart },
        { x: xEnd, r: rEnd },
      ].forEach(({ x, r }) => {
        if (r > 0.08) {
          const cap = buildCircleLoopGeometry(r, 64);
          cap.rotateZ(Math.PI / 2);
          cap.translate(x, 1.8, 0);
          addDualPassEdgeCurve(mathGroup, cap, '#E0F2FE', hiddenEnabled, false);
        }
      });
    } else {
      // Fallback 3D Geometric Solid (Octahedron + Dual-Pass Hidden Lines)
      const geom = new THREE.OctahedronGeometry(2.3, 0);
      geom.translate(0, 1.8, 0);
      addDualPassSolid(mathGroup, geom, colorHex, objectOpacity, hiddenEnabled, 1, true);
    }

    requestRenderRef.current();
  }, [commandSet, objectOpacity, highlightColor]);

  return (
    <div className="relative w-full h-full min-h-[480px] lg:h-[620px] bg-[#0B1021] overflow-hidden rounded-2xl">
      <div
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />
      <div className="absolute bottom-3 left-3 right-3 pointer-events-none flex flex-wrap items-center justify-between gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl bg-[#0F172A]/95 border border-blue-500/30 text-cyan-300 shadow-lg">
        <span>Kéo để xoay 360° · Cuộn để phóng to/thu nhỏ · Nhấp đúp để đặt lại</span>
        <span className="text-emerald-400 font-bold">
          {showHiddenEdges ? 'SGK: Nét liền thấy · Nét đứt khuất' : 'Khối 3D Đặc'}
        </span>
      </div>
    </div>
  );
};
