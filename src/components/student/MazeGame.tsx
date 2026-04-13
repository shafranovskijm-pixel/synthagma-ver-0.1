import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import * as THREE from "three";

// 10x10 maze: 1=wall, 0=path, 2=start, 3=finish
const MAZE_MAP = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 2, 0, 0, 1, 0, 0, 0, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 0, 0, 1, 1, 0, 0, 0, 1],
  [1, 1, 1, 0, 0, 1, 0, 1, 1, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1, 3, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

const WALL_HEIGHT = 2.5;
const CELL_SIZE = 2;
const PLAYER_RADIUS = 0.3;
const MOVE_SPEED = 0.08;
const ROTATE_SPEED = 0.03;
const JUMP_FORCE = 0.12;
const GRAVITY = 0.006;

function findCell(value: number): [number, number] {
  for (let z = 0; z < MAZE_MAP.length; z++) {
    for (let x = 0; x < MAZE_MAP[z].length; x++) {
      if (MAZE_MAP[z][x] === value) return [x, z];
    }
  }
  return [1, 1];
}

function isWall(x: number, z: number): boolean {
  const gz = Math.floor(z / CELL_SIZE);
  const gx = Math.floor(x / CELL_SIZE);
  if (gz < 0 || gz >= MAZE_MAP.length || gx < 0 || gx >= MAZE_MAP[0].length) return true;
  return MAZE_MAP[gz][gx] === 1;
}

function canMove(x: number, z: number): boolean {
  // Check all 4 corners of player bounding circle
  return (
    !isWall(x - PLAYER_RADIUS, z - PLAYER_RADIUS) &&
    !isWall(x + PLAYER_RADIUS, z - PLAYER_RADIUS) &&
    !isWall(x - PLAYER_RADIUS, z + PLAYER_RADIUS) &&
    !isWall(x + PLAYER_RADIUS, z + PLAYER_RADIUS)
  );
}

// Shared input state
const inputState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  rotateLeft: false,
  rotateRight: false,
};

function Walls() {
  const wallColor = new THREE.Color("hsl(220, 30%, 35%)");
  const wallColorAlt = new THREE.Color("hsl(220, 25%, 45%)");

  const walls = useMemo(() => {
    const result: { pos: [number, number, number]; color: THREE.Color }[] = [];
    for (let z = 0; z < MAZE_MAP.length; z++) {
      for (let x = 0; x < MAZE_MAP[z].length; x++) {
        if (MAZE_MAP[z][x] === 1) {
          result.push({
            pos: [x * CELL_SIZE + CELL_SIZE / 2, WALL_HEIGHT / 2, z * CELL_SIZE + CELL_SIZE / 2],
            color: (x + z) % 2 === 0 ? wallColor : wallColorAlt,
          });
        }
      }
    }
    return result;
  }, []);

  return (
    <>
      {walls.map((w, i) => (
        <mesh key={i} position={w.pos}>
          <boxGeometry args={[CELL_SIZE, WALL_HEIGHT, CELL_SIZE]} />
          <meshStandardMaterial color={w.color} />
        </mesh>
      ))}
    </>
  );
}

function Floor() {
  const size = MAZE_MAP.length * CELL_SIZE;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[size / 2, 0, size / 2]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color="hsl(220, 15%, 25%)" />
    </mesh>
  );
}

function Ceiling() {
  const size = MAZE_MAP.length * CELL_SIZE;
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[size / 2, WALL_HEIGHT, size / 2]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color="hsl(220, 20%, 15%)" />
    </mesh>
  );
}

function FinishMarker() {
  const [fx, fz] = findCell(3);
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.position.y = 0.8 + Math.sin(clock.elapsedTime * 2) * 0.3;
      ref.current.rotation.y = clock.elapsedTime;
    }
  });

  return (
    <mesh ref={ref} position={[fx * CELL_SIZE + CELL_SIZE / 2, 0.8, fz * CELL_SIZE + CELL_SIZE / 2]}>
      <octahedronGeometry args={[0.35]} />
      <meshStandardMaterial color="hsl(50, 100%, 60%)" emissive="hsl(50, 100%, 40%)" emissiveIntensity={2} />
    </mesh>
  );
}

interface PlayerProps {
  onWin: () => void;
  resetKey: number;
}

function Player({ onWin, resetKey }: PlayerProps) {
  const { camera } = useThree();
  const [sx, sz] = findCell(2);
  const [fx, fz] = findCell(3);
  const pos = useRef({ x: sx * CELL_SIZE + CELL_SIZE / 2, z: sz * CELL_SIZE + CELL_SIZE / 2 });
  const yaw = useRef(0);
  const velY = useRef(0);
  const posY = useRef(1.5);
  const onGround = useRef(true);

  // Mouse drag rotation
  const isDragging = useRef(false);
  const lastMouseX = useRef(0);

  useEffect(() => {
    pos.current = { x: sx * CELL_SIZE + CELL_SIZE / 2, z: sz * CELL_SIZE + CELL_SIZE / 2 };
    yaw.current = 0;
    velY.current = 0;
    posY.current = 1.5;
    onGround.current = true;
  }, [resetKey, sx, sz]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case "KeyW": case "ArrowUp": inputState.forward = true; break;
        case "KeyS": case "ArrowDown": inputState.backward = true; break;
        case "KeyA": case "ArrowLeft": inputState.rotateLeft = true; break;
        case "KeyD": case "ArrowRight": inputState.rotateRight = true; break;
        case "KeyQ": inputState.left = true; break;
        case "KeyE": inputState.right = true; break;
        case "Space": inputState.jump = true; e.preventDefault(); break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case "KeyW": case "ArrowUp": inputState.forward = false; break;
        case "KeyS": case "ArrowDown": inputState.backward = false; break;
        case "KeyA": case "ArrowLeft": inputState.rotateLeft = false; break;
        case "KeyD": case "ArrowRight": inputState.rotateRight = false; break;
        case "KeyQ": inputState.left = false; break;
        case "KeyE": inputState.right = false; break;
        case "Space": inputState.jump = false; break;
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      isDragging.current = true;
      lastMouseX.current = e.clientX;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - lastMouseX.current;
      yaw.current -= dx * 0.005;
      lastMouseX.current = e.clientX;
    };
    const onMouseUp = () => { isDragging.current = false; };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDragging.current = true;
        lastMouseX.current = e.touches[0].clientX;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging.current || e.touches.length < 1) return;
      const dx = e.touches[0].clientX - lastMouseX.current;
      yaw.current -= dx * 0.005;
      lastMouseX.current = e.touches[0].clientX;
    };
    const onTouchEnd = () => { isDragging.current = false; };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchstart", onTouchStart);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", onTouchEnd);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  useFrame(() => {
    // Rotation
    if (inputState.rotateLeft) yaw.current += ROTATE_SPEED;
    if (inputState.rotateRight) yaw.current -= ROTATE_SPEED;

    const sin = Math.sin(yaw.current);
    const cos = Math.cos(yaw.current);

    let dx = 0, dz = 0;
    if (inputState.forward) { dx -= sin * MOVE_SPEED; dz -= cos * MOVE_SPEED; }
    if (inputState.backward) { dx += sin * MOVE_SPEED; dz += cos * MOVE_SPEED; }
    if (inputState.left) { dx -= cos * MOVE_SPEED; dz += sin * MOVE_SPEED; }
    if (inputState.right) { dx += cos * MOVE_SPEED; dz -= sin * MOVE_SPEED; }

    // Collision with sliding
    const nx = pos.current.x + dx;
    const nz = pos.current.z + dz;
    if (canMove(nx, nz)) {
      pos.current.x = nx;
      pos.current.z = nz;
    } else if (canMove(nx, pos.current.z)) {
      pos.current.x = nx;
    } else if (canMove(pos.current.x, nz)) {
      pos.current.z = nz;
    }

    // Jump / gravity
    if (inputState.jump && onGround.current) {
      velY.current = JUMP_FORCE;
      onGround.current = false;
    }
    velY.current -= GRAVITY;
    posY.current += velY.current;
    if (posY.current <= 1.5) {
      posY.current = 1.5;
      velY.current = 0;
      onGround.current = true;
    }

    camera.position.set(pos.current.x, posY.current, pos.current.z);
    camera.rotation.set(0, yaw.current, 0);

    // Check win
    const finishX = fx * CELL_SIZE + CELL_SIZE / 2;
    const finishZ = fz * CELL_SIZE + CELL_SIZE / 2;
    const dist = Math.sqrt((pos.current.x - finishX) ** 2 + (pos.current.z - finishZ) ** 2);
    if (dist < 0.8) {
      onWin();
    }
  });

  return null;
}

interface MazeGameProps {
  onForward: React.MutableRefObject<(() => void) | null>;
  onBackward: React.MutableRefObject<(() => void) | null>;
  onRotLeft: React.MutableRefObject<(() => void) | null>;
  onRotRight: React.MutableRefObject<(() => void) | null>;
  onJump: React.MutableRefObject<(() => void) | null>;
  onForwardEnd: React.MutableRefObject<(() => void) | null>;
  onBackwardEnd: React.MutableRefObject<(() => void) | null>;
  onRotLeftEnd: React.MutableRefObject<(() => void) | null>;
  onRotRightEnd: React.MutableRefObject<(() => void) | null>;
  onJumpEnd: React.MutableRefObject<(() => void) | null>;
  onWin: () => void;
  resetKey: number;
}

export default function MazeGame({
  onForward, onBackward, onRotLeft, onRotRight, onJump,
  onForwardEnd, onBackwardEnd, onRotLeftEnd, onRotRightEnd, onJumpEnd,
  onWin, resetKey,
}: MazeGameProps) {
  // Wire up button refs
  useEffect(() => {
    onForward.current = () => { inputState.forward = true; };
    onBackward.current = () => { inputState.backward = true; };
    onRotLeft.current = () => { inputState.rotateLeft = true; };
    onRotRight.current = () => { inputState.rotateRight = true; };
    onJump.current = () => { inputState.jump = true; };
    onForwardEnd.current = () => { inputState.forward = false; };
    onBackwardEnd.current = () => { inputState.backward = false; };
    onRotLeftEnd.current = () => { inputState.rotateLeft = false; };
    onRotRightEnd.current = () => { inputState.rotateRight = false; };
    onJumpEnd.current = () => { inputState.jump = false; };
  }, []);

  return (
    <Canvas
      style={{ width: "100%", height: "100%" }}
      camera={{ fov: 75, near: 0.1, far: 100, position: [3, 1.5, 3] }}
      gl={{ antialias: true }}
    >
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 8, 10]} intensity={0.8} />
      <pointLight position={[3, 2, 3]} intensity={0.5} color="hsl(220, 80%, 70%)" />
      <fog attach="fog" args={["#0a0e1a", 1, 14]} />
      <color attach="background" args={["#0a0e1a"]} />
      <Walls />
      <Floor />
      <Ceiling />
      <FinishMarker />
      <Player onWin={onWin} resetKey={resetKey} />
    </Canvas>
  );
}
