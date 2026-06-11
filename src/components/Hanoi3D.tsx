import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GameState, GameStatus } from '../types';
import { sounds } from '../utils/audio';

// Color map for discs of sizes 1 to 12
const DISC_COLORS = [
  0xf87171, // 1: Red/Coral
  0xfb923c, // 2: Orange
  0xfacc15, // 3: Yellow/Gold
  0x4ade80, // 4: Green
  0x2dd4bf, // 5: Teal
  0x38bdf8, // 6: Sky Blue
  0x6366f1, // 7: Indigo
  0x8b5cf6, // 8: Purple/Violet
  0xec4899, // 9: Pink
  0xf43f5e, // 10: Rose
  0xa855f7, // 11: Lavender
  0x14b8a6, // 12: Emerald Deep
];

interface Hanoi3DProps {
  gameState: GameState;
  onPegClick: (pegIndex: number) => void;
  autoplayingMoves: { from: number; to: number }[] | null;
  autoplayIndex: number;
}

export default function Hanoi3D({
  gameState,
  onPegClick,
  autoplayingMoves,
  autoplayIndex
}: Hanoi3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Keep references of 3D objects, so we can animate them in the render loop.
  const discsMeshesRef = useRef<{ [size: number]: THREE.Mesh }>({});
  const pegsHighlightRef = useRef<THREE.Mesh[]>([]);
  const hoverIndicatorRef = useRef<number | null>(null);

  // Keep latest callback reference to avoid stale closure issues in pointer listeners
  const onPegClickRef = useRef(onPegClick);
  useEffect(() => {
    onPegClickRef.current = onPegClick;
  }, [onPegClick]);

  // Camera orientation angles
  const cameraAngleRef = useRef<{ theta: number; phi: number }>({
    theta: Math.PI / 2, // horizontal orbit angle (centered)
    phi: 0.45,         // vertical tilt angle
  });
  const orbitRadiusRef = useRef<number>(24);
  const isDraggingCamera = useRef(false);
  const previousMousePosition = useRef({ x: 0, y: 0 });
  const previousTouchDistance = useRef<number | null>(null);

  // Store game state in ref to avoid recreating the Three.js loop or context
  const gameStateRef = useRef<GameState>(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Handle Three.js initialization and main loop
  useEffect(() => {
    if (!canvasRef.current || !mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = Math.max(350, mountRef.current.clientHeight);

    // 1. Scene & Camera Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f1d); // Dark Slate Blue background
    scene.fog = new THREE.FogExp2(0x0a0f1d, 0.015);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 150);
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      alpha: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 2. Lights Layout
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 25, 15);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.bias = -0.001;
    scene.add(dirLight);

    const blueLight = new THREE.PointLight(0x4f46e5, 1.5, 30);
    blueLight.position.set(-8, 5, 5);
    scene.add(blueLight);

    const pinkLight = new THREE.PointLight(0xdb2777, 1.5, 30);
    pinkLight.position.set(8, 5, -5);
    scene.add(pinkLight);

    // 3. Game Board Base Plate
    const baseGeo = new THREE.BoxGeometry(28, 0.8, 8, 1, 1, 1);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x111827, // Slate-900 metallic grey
      roughness: 0.15,
      metalness: 0.8,
    });
    const boardBase = new THREE.Mesh(baseGeo, baseMat);
    boardBase.position.set(0, -0.4, 0);
    boardBase.receiveShadow = true;
    scene.add(boardBase);

    // Table Floor under board for shadows and size depth
    const floorGeo = new THREE.PlaneGeometry(100, 100);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x05070c,
      roughness: 0.8,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.8;
    floor.receiveShadow = true;
    scene.add(floor);

    // 4. Rods (Pegs) setup
    const pegGeometry = new THREE.CylinderGeometry(0.22, 0.22, 5.0, 16);
    const pegMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4af37, // Polished brass gold
      metalness: 0.9,
      roughness: 0.1,
    });

    const pegPositionsX = [-9.5, 0, 9.5];
    const pegs: THREE.Mesh[] = [];
    const hitboxes: THREE.Mesh[] = [];

    // Invisible larger cylinders for super easy clicking/raycasting
    const hitboxGeometry = new THREE.CylinderGeometry(2.2, 2.2, 5.5, 8);
    const hitboxMaterial = new THREE.MeshBasicMaterial({
      visible: false, // hidden in UI but detectable by raycaster
    });

    pegPositionsX.forEach((x, index) => {
      // Create the core rod
      const pegMesh = new THREE.Mesh(pegGeometry, pegMaterial);
      pegMesh.position.set(x, 2.5, 0); // half height since base is at Y=0
      pegMesh.castShadow = true;
      pegMesh.receiveShadow = true;
      scene.add(pegMesh);
      pegs.push(pegMesh);

      // Create glowing selection rings at the foot of each peg
      const ringGeo = new THREE.RingGeometry(0.6, 0.9, 32);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        visible: false,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
      });
      const highlightRing = new THREE.Mesh(ringGeo, ringMat);
      highlightRing.position.set(x, 0.02, 0);
      scene.add(highlightRing);
      pegsHighlightRef.current[index] = highlightRing;

      // Add clickable hitbox containing peg index in custom userData for raycaster
      const hitboxMesh = new THREE.Mesh(hitboxGeometry, hitboxMaterial);
      hitboxMesh.position.set(x, 2.5, 0);
      hitboxMesh.userData = { pegIndex: index };
      scene.add(hitboxMesh);
      hitboxes.push(hitboxMesh);
    });

    // 5. Create Discs
    // Max level has 12 discs. We instantiate physical disc meshes for the current level's disc counts.
    const discCount = gameStateRef.current.discCount;
    const currentDiscsMeshes: { [size: number]: THREE.Mesh } = {};

    for (let size = 1; size <= discCount; size++) {
      // compute radius proportionally: biggest is radius=4.0, smallest size 1 is radius 1.25
      const discRadius = 0.9 + size * 0.22;
      const discThickness = 0.42;

      // Create rounded cylinder using Torus & Cylinder or simply standard segment beveled cylinders.
      // A standard cylinder with radial segments makes an elegant disk!
      const discGeo = new THREE.CylinderGeometry(discRadius, discRadius, discThickness, 32);

      // Let's create an elegant translucent glassy material
      const discMat = new THREE.MeshPhysicalMaterial({
        color: DISC_COLORS[(size - 1) % DISC_COLORS.length],
        roughness: 0.1,
        metalness: 0.2,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        transmission: 0.3, // Give a classy translucent modern look
        thickness: 0.5,
      });

      const discMesh = new THREE.Mesh(discGeo, discMat);
      discMesh.castShadow = true;
      discMesh.receiveShadow = true;

      // Also we can add a beautiful gold insert torus in the middle for high precision details!
      const insertGeo = new THREE.TorusGeometry(0.24, 0.08, 8, 16);
      insertGeo.rotateX(Math.PI / 2);
      const insertMat = new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        metalness: 0.95,
        roughness: 0.1,
      });
      const insertMesh = new THREE.Mesh(insertGeo, insertMat);
      insertMesh.position.y = 0.0;
      discMesh.add(insertMesh);

      scene.add(discMesh);
      currentDiscsMeshes[size] = discMesh;

      // Initialize resting coordinate instantly based on pegs
      let foundPeg = 0;
      let heightIdx = 0;
      gameStateRef.current.pegs.forEach((pegStack, pIdx) => {
        const foundIdx = pegStack.indexOf(size);
        if (foundIdx !== -1) {
          foundPeg = pIdx;
          heightIdx = foundIdx;
        }
      });

      const startX = pegPositionsX[foundPeg];
      const startY = heightIdx * discThickness + discThickness / 2;
      discMesh.position.set(startX, startY, 0);
    }
    discsMeshesRef.current = currentDiscsMeshes;

    // 6. Camera Position Orbit Math Constants
    const updateCameraPosition = () => {
      const { theta, phi } = cameraAngleRef.current;
      const orbitRadius = orbitRadiusRef.current;
      camera.position.x = orbitRadius * Math.sin(theta) * Math.cos(phi);
      camera.position.y = orbitRadius * Math.sin(phi);
      camera.position.z = orbitRadius * Math.cos(theta) * Math.cos(phi);
      camera.lookAt(0, 1.8, 0);
    };
    updateCameraPosition();

    // 7. Raycaster Setup for interaction
    const raycaster = new THREE.Raycaster();
    const touchPoint = new THREE.Vector2();

    const getIntersectedPegIndex = (clientX: number, clientY: number): number | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((clientY - rect.top) / rect.height) * 2 + 1;
      touchPoint.set(x, y);

      raycaster.setFromCamera(touchPoint, camera);
      const intersects = raycaster.intersectObjects(hitboxes);
      if (intersects.length > 0) {
        return intersects[0].object.userData.pegIndex as number;
      }
      return null;
    };

    // 8. Event listeners
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomSpeed = 0.05;
      orbitRadiusRef.current = Math.max(12, Math.min(60, orbitRadiusRef.current + e.deltaY * zoomSpeed));
      updateCameraPosition();
    };

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if ('touches' in e && e.touches.length === 2) {
        // Pinch zoom start
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        previousTouchDistance.current = Math.sqrt(dx * dx + dy * dy);
        isDraggingCamera.current = false;
        return;
      }

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      const hitPegIdx = getIntersectedPegIndex(clientX, clientY);
      if (hitPegIdx !== null) {
        // Trigger interaction logic on Peg clicked instead of rotating camera!
        onPegClickRef.current(hitPegIdx);
        isDraggingCamera.current = false;
      } else {
        // Rotate container
        isDraggingCamera.current = true;
        previousMousePosition.current = { x: clientX, y: clientY };
      }
    };

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      if ('touches' in e && e.touches.length === 2) {
        // Pinch zoom move
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (previousTouchDistance.current !== null) {
          const delta = distance - previousTouchDistance.current;
          const zoomSpeed = 0.1;
          orbitRadiusRef.current = Math.max(12, Math.min(60, orbitRadiusRef.current - delta * zoomSpeed));
          updateCameraPosition();
        }
        previousTouchDistance.current = distance;
        return;
      }

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      if (isDraggingCamera.current) {
        const deltaX = clientX - previousMousePosition.current.x;
        const deltaY = clientY - previousMousePosition.current.y;

        // update camera orbit values
        cameraAngleRef.current.theta -= deltaX * 0.007;
        // Limit phi to avoid flipping camera completely upside down
        cameraAngleRef.current.phi = Math.max(
          0.05,
          Math.min(Math.PI / 2 - 0.05, cameraAngleRef.current.phi - deltaY * 0.007)
        );

        previousMousePosition.current = { x: clientX, y: clientY };
        updateCameraPosition();
      } else {
        // Handle hovering highlight state
        const hoverPegIdx = getIntersectedPegIndex(clientX, clientY);
        hoverIndicatorRef.current = hoverPegIdx;
      }
    };

    const handlePointerUp = () => {
      isDraggingCamera.current = false;
      previousTouchDistance.current = null;
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', handlePointerDown);
    dom.addEventListener('mousemove', handlePointerMove);
    dom.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('mouseup', handlePointerUp);

    dom.addEventListener('touchstart', handlePointerDown, { passive: true });
    dom.addEventListener('touchmove', handlePointerMove, { passive: true });
    window.addEventListener('touchend', handlePointerUp);

    // 9. Resize Observer for proper fit in containers
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        const actHeight = Math.max(350, height);
        renderer.setSize(width, actHeight);
        camera.aspect = width / actHeight;
        camera.updateProjectionMatrix();
        updateCameraPosition(); // Refresh on resize
      }
    });
    resizeObserver.observe(mountRef.current);

    // 10. Frame Render Animation Tick loop!
    let animationFrameId: number;
    const peakY = 5.8; // Peak height for discs to slide safely over rods
    const discThickness = 0.42;
    const speed = 0.22; // Quick, satisfying slide interpolation speed

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const state = gameStateRef.current;
      const pegsData = state.pegs;
      const selectedPegIndex = state.selectedPeg;

      // Dynamic glowing highlighting rings update
      pegsHighlightRef.current.forEach((ring, idx) => {
        if (!ring) return;
        // Highlight active if:
        // - This peg is explicitly selected as the source peg
        // - Or if mouse is currently hovering over it
        const isSelected = selectedPegIndex === idx;
        const isHovered = hoverIndicatorRef.current === idx;

        if (isSelected) {
          ring.visible = true;
          // Sky Blue pulse
          ring.material.color.setHex(0x38bdf8);
          // Gently scale ring up & down to pulse
          const pulse = 1.0 + Math.sin(Date.now() * 0.01) * 0.1;
          ring.scale.set(pulse, pulse, 1);
        } else if (isHovered) {
          ring.visible = true;
          // Emerald Green
          ring.material.color.setHex(0x10b981);
          ring.scale.set(1, 1, 1);
        } else {
          ring.visible = false;
        }
      });

      // Animate Discs based on current stack positions
      pegsData.forEach((pegStack, pegIdx) => {
        const targetX = pegPositionsX[pegIdx];

        pegStack.forEach((discSize, stackIdx) => {
          const discMesh = currentDiscsMeshes[discSize];
          if (!discMesh) return;

          // Compute resting height Y
          let targetY = stackIdx * discThickness + discThickness / 2;

          // If this is the TOP disc of a SELECTED peg, let it float invitingly!
          const isTopDisc = stackIdx === pegStack.length - 1;
          if (selectedPegIndex === pegIdx && isTopDisc) {
            targetY = peakY - 0.4; // float is slightly lower than absolute peak to hint selection
          }

          // Fetch current physical coords
          const curX = discMesh.position.x;
          const curY = discMesh.position.y;

          let nextTX = targetX;
          let nextTY = targetY;

          // Animation pathfinding math
          if (Math.abs(curX - targetX) > 0.05) {
            // Case 1: Disc needs to transverse horizontally (not at destination peg peg index)
            if (curY < peakY - 0.1) {
              // Action 1: Lift upward first towards the Peak Y coordinate (lock horizontally to original peg position)
              nextTX = curX;
              nextTY = peakY;
            } else {
              // Action 2: Glide horizontally along the peak height to target peg
              nextTX = targetX;
              nextTY = peakY;
            }
          } else {
            // Case 2: Horizontal position matches, descend down onto stack or hover peak if selected
            nextTX = targetX;
            nextTY = targetY;
          }

          // Apply interpolation
          discMesh.position.x += (nextTX - curX) * speed;
          discMesh.position.y += (nextTY - curY) * speed;
          // smooth rotation or subtle floating
          discMesh.position.z += (0 - discMesh.position.z) * speed;
        });
      });

      renderer.render(scene, camera);
    };

    animate();

    // 11. Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      dom.removeEventListener('mousedown', handlePointerDown);
      dom.removeEventListener('mousemove', handlePointerMove);
      dom.removeEventListener('wheel', handleWheel);
      window.removeEventListener('mouseup', handlePointerUp);
      dom.removeEventListener('touchstart', handlePointerDown);
      dom.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);

      // dispose meshes & geometries
      scene.clear();
      renderer.dispose();
    };

  }, [gameState.discCount]); // Re-init when disc count changes (e.g. changing level)

  return (
    <div ref={mountRef} className="w-full h-full relative overflow-hidden select-none bg-slate-950">
      <canvas ref={canvasRef} className="w-full h-full block cursor-grab active:cursor-grabbing" id="hanoi-3d-canvas" />

      {/* Guide & Controls Label */}
      <div className="absolute top-4 left-4 text-xs font-mono bg-slate-900/80 backdrop-blur-md px-3 py-2 rounded border border-slate-700/50 text-slate-300 pointer-events-none select-none max-w-xs space-y-1">
        <p className="text-sky-400 font-semibold">🎮 操作指引：</p>
        <p>• 點擊柱子或盤子：選擇/移至該柱</p>
        <p>• 拖曳背景：轉動 3D 視角</p>
        <p>• 滾輪 / 雙指縮放：拉遠拉近視距</p>
      </div>

      {/* Selected Indicator overlay */}
      {gameState.selectedPeg !== null && (
        <div className="absolute top-4 right-4 pointer-events-none select-none animate-pulse bg-sky-500/10 border border-sky-400 text-sky-400 text-xs font-semibold px-3 py-1.5 rounded-full backdrop-blur-md flex items-center gap-1.5 shadow-lg shadow-sky-500/10">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping"></span>
          已選擇柱子 {gameState.selectedPeg + 1}
        </div>
      )}
    </div>
  );
}
