import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";

import monster1Url from "@/assets/monster1.png";
import monster2Url from "@/assets/monster2.jpg";
import monster3Url from "@/assets/monster3.png";
import monster4Url from "@/assets/monster4.jpg";
import monster5Url from "@/assets/monster5.jpg";

import { playShoot, playHit, playDamage, playStep, playWin, playGameOver } from "./MazeSounds";

// 14x14 maze: 1=wall, 0=path, 2=start, 3=finish
const MAZE_MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,2,0,0,1,0,0,0,0,1,0,0,0,1],
  [1,0,1,0,1,0,1,1,0,1,0,1,0,1],
  [1,0,1,0,0,0,0,1,0,0,0,1,0,1],
  [1,0,0,0,1,1,0,0,0,1,0,0,0,1],
  [1,1,1,0,0,1,0,1,1,1,0,1,1,1],
  [1,0,0,0,1,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,0,1,1,1,0,1,1,0,1],
  [1,0,0,0,0,0,0,1,0,0,0,1,0,1],
  [1,1,1,0,1,1,0,0,0,1,0,0,0,1],
  [1,0,0,0,0,1,0,1,0,1,0,1,0,1],
  [1,0,1,1,0,0,0,1,0,0,0,1,0,1],
  [1,0,0,0,0,1,0,0,0,1,0,0,3,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

const WALL_HEIGHT = 2.8;
const CELL_SIZE = 2;
const PLAYER_RADIUS = 0.3;
const MOVE_SPEED = 0.08;
const ROTATE_SPEED = 0.03;
const JUMP_FORCE = 0.12;
const GRAVITY = 0.006;
const MONSTER_SPEED = 0.015;
const MONSTER_ATTACK_DIST = 0.8;
const SHOOT_RANGE = 16;

// Monster spawn positions (grid coords)
const MONSTER_SPAWNS: [number, number][] = [
  [6, 3], [2, 6], [10, 4], [8, 8], [4, 11],
];

const MONSTER_TEXTURES = [monster1Url, monster2Url, monster3Url, monster4Url, monster5Url];

function findCell(value: number): [number, number] {
  for (let z = 0; z < MAZE_MAP.length; z++)
    for (let x = 0; x < MAZE_MAP[z].length; x++)
      if (MAZE_MAP[z][x] === value) return [x, z];
  return [1, 1];
}

function isWall(x: number, z: number): boolean {
  const gz = Math.floor(z / CELL_SIZE);
  const gx = Math.floor(x / CELL_SIZE);
  if (gz < 0 || gz >= MAZE_MAP.length || gx < 0 || gx >= MAZE_MAP[0].length) return true;
  return MAZE_MAP[gz][gx] === 1;
}

function canMove(x: number, z: number): boolean {
  return (
    !isWall(x - PLAYER_RADIUS, z - PLAYER_RADIUS) &&
    !isWall(x + PLAYER_RADIUS, z - PLAYER_RADIUS) &&
    !isWall(x - PLAYER_RADIUS, z + PLAYER_RADIUS) &&
    !isWall(x + PLAYER_RADIUS, z + PLAYER_RADIUS)
  );
}

// Shared input state
export const inputState = {
  forward: false, backward: false, left: false, right: false,
  jump: false, rotateLeft: false, rotateRight: false, shoot: false,
};

// Game state shared between components
export const gameState = {
  health: 3,
  kills: 0,
  gameOver: false,
  won: false,
  shooting: false,
  monsters: MONSTER_SPAWNS.map((s, i) => ({
    x: s[0] * CELL_SIZE + CELL_SIZE / 2,
    z: s[1] * CELL_SIZE + CELL_SIZE / 2,
    alive: true,
    texIndex: i,
  })),
};

export function resetGameState() {
  gameState.health = 3;
  gameState.kills = 0;
  gameState.gameOver = false;
  gameState.won = false;
  gameState.shooting = false;
  gameState.monsters = MONSTER_SPAWNS.map((s, i) => ({
    x: s[0] * CELL_SIZE + CELL_SIZE / 2,
    z: s[1] * CELL_SIZE + CELL_SIZE / 2,
    alive: true,
    texIndex: i,
  }));
}

/* ─── Walls ─── */
function Walls() {
  const wallA = useMemo(() => new THREE.Color("hsl(10, 50%, 40%)"), []);
  const wallB = useMemo(() => new THREE.Color("hsl(20, 45%, 50%)"), []);
  const walls = useMemo(() => {
    const r: { pos: [number, number, number]; color: THREE.Color }[] = [];
    for (let z = 0; z < MAZE_MAP.length; z++)
      for (let x = 0; x < MAZE_MAP[z].length; x++)
        if (MAZE_MAP[z][x] === 1)
          r.push({
            pos: [x * CELL_SIZE + CELL_SIZE / 2, WALL_HEIGHT / 2, z * CELL_SIZE + CELL_SIZE / 2],
            color: (x + z) % 2 === 0 ? wallA : wallB,
          });
    return r;
  }, [wallA, wallB]);

  return (
    <>
      {walls.map((w, i) => (
        <mesh key={i} position={w.pos}>
          <boxGeometry args={[CELL_SIZE, WALL_HEIGHT, CELL_SIZE]} />
          <meshStandardMaterial color={w.color} roughness={0.8} />
        </mesh>
      ))}
    </>
  );
}

/* ─── Floor with checkerboard ─── */
function Floor() {
  const size = MAZE_MAP.length * CELL_SIZE;
  const tex = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = MAZE_MAP[0].length * 2;
    canvas.height = MAZE_MAP.length * 2;
    const ctx = canvas.getContext("2d")!;
    for (let y = 0; y < canvas.height; y++)
      for (let x = 0; x < canvas.width; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? "#3a3a3a" : "#2a2a2a";
        ctx.fillRect(x, y, 1, 1);
      }
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(MAZE_MAP[0].length, MAZE_MAP.length);
    t.magFilter = THREE.NearestFilter;
    return t;
  }, []);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[size / 2, 0, size / 2]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial map={tex} />
    </mesh>
  );
}

/* ─── Finish marker ─── */
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
      <octahedronGeometry args={[0.4]} />
      <meshStandardMaterial color="hsl(50, 100%, 60%)" emissive="hsl(50, 100%, 40%)" emissiveIntensity={3} />
    </mesh>
  );
}

/* ─── Monster billboard ─── */
function MonsterSprite({ index, playerRef }: { index: number; playerRef: React.MutableRefObject<{ x: number; z: number }> }) {
  const m = gameState.monsters[index];
  const texture = useTexture(MONSTER_TEXTURES[m.texIndex % MONSTER_TEXTURES.length]);
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!m.alive || !meshRef.current) return;
    // Billboard — face camera
    meshRef.current.position.set(m.x, 1.2, m.z);
    meshRef.current.lookAt(playerRef.current.x, 1.2, playerRef.current.z);

    // Move toward player
    const dx = playerRef.current.x - m.x;
    const dz = playerRef.current.z - m.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > MONSTER_ATTACK_DIST && dist < 12) {
      const nx = m.x + (dx / dist) * MONSTER_SPEED;
      const nz = m.z + (dz / dist) * MONSTER_SPEED;
      if (canMove(nx, nz)) { m.x = nx; m.z = nz; }
      else if (canMove(nx, m.z)) { m.x = nx; }
      else if (canMove(m.x, nz)) { m.z = nz; }
    }
  });

  if (!m.alive) return null;

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[1.4, 1.8]} />
      <meshStandardMaterial map={texture} transparent alphaTest={0.1} side={THREE.DoubleSide} emissive="white" emissiveIntensity={0.15} />
    </mesh>
  );
}

/* ─── Player ─── */
interface PlayerProps {
  onWin: () => void;
  onDamage: () => void;
  onKill: () => void;
  onGameOver: () => void;
  onShootAnim: () => void;
  resetKey: number;
}

function Player({ onWin, onDamage, onKill, onGameOver, onShootAnim, resetKey }: PlayerProps) {
  const { camera } = useThree();
  const [sx, sz] = findCell(2);
  const [fx, fz] = findCell(3);
  const pos = useRef({ x: sx * CELL_SIZE + CELL_SIZE / 2, z: sz * CELL_SIZE + CELL_SIZE / 2 });
  const yaw = useRef(0);
  const velY = useRef(0);
  const posY = useRef(1.5);
  const onGround = useRef(true);
  const isDragging = useRef(false);
  const lastMouseX = useRef(0);
  const stepTimer = useRef(0);
  const shootCooldown = useRef(0);
  const damageCooldown = useRef(0);

  useEffect(() => {
    pos.current = { x: sx * CELL_SIZE + CELL_SIZE / 2, z: sz * CELL_SIZE + CELL_SIZE / 2 };
    yaw.current = 0; velY.current = 0; posY.current = 1.5; onGround.current = true;
  }, [resetKey, sx, sz]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case "KeyW": case "ArrowUp": inputState.forward = true; break;
        case "KeyS": case "ArrowDown": inputState.backward = true; break;
        case "KeyA": case "ArrowLeft": inputState.rotateLeft = true; break;
        case "KeyD": case "ArrowRight": inputState.rotateRight = true; break;
        case "Space": inputState.jump = true; e.preventDefault(); break;
        case "KeyF": case "Enter": inputState.shoot = true; break;
        case "Digit1": case "Numpad1": break;
        case "Digit2": case "Numpad2": break;
        case "Digit3": case "Numpad3": break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case "KeyW": case "ArrowUp": inputState.forward = false; break;
        case "KeyS": case "ArrowDown": inputState.backward = false; break;
        case "KeyA": case "ArrowLeft": inputState.rotateLeft = false; break;
        case "KeyD": case "ArrowRight": inputState.rotateRight = false; break;
        case "Space": inputState.jump = false; break;
        case "KeyF": case "Enter": inputState.shoot = false; break;
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) { inputState.shoot = true; }
      isDragging.current = true; lastMouseX.current = e.clientX;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      yaw.current -= (e.clientX - lastMouseX.current) * 0.005;
      lastMouseX.current = e.clientX;
    };
    const onMouseUp = () => { isDragging.current = false; inputState.shoot = false; };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) { isDragging.current = true; lastMouseX.current = e.touches[0].clientX; }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging.current || !e.touches.length) return;
      yaw.current -= (e.touches[0].clientX - lastMouseX.current) * 0.005;
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
    if (gameState.gameOver || gameState.won) return;

    // Rotation
    if (inputState.rotateLeft) yaw.current += ROTATE_SPEED;
    if (inputState.rotateRight) yaw.current -= ROTATE_SPEED;

    const sin = Math.sin(yaw.current);
    const cos = Math.cos(yaw.current);
    let dx = 0, dz = 0;
    const moving = inputState.forward || inputState.backward;
    if (inputState.forward) { dx -= sin * MOVE_SPEED; dz -= cos * MOVE_SPEED; }
    if (inputState.backward) { dx += sin * MOVE_SPEED; dz += cos * MOVE_SPEED; }

    const nx = pos.current.x + dx;
    const nz = pos.current.z + dz;
    if (canMove(nx, nz)) { pos.current.x = nx; pos.current.z = nz; }
    else if (canMove(nx, pos.current.z)) { pos.current.x = nx; }
    else if (canMove(pos.current.x, nz)) { pos.current.z = nz; }

    // Steps sound
    if (moving) {
      stepTimer.current++;
      if (stepTimer.current % 15 === 0) playStep();
    }

    // Jump
    if (inputState.jump && onGround.current) { velY.current = JUMP_FORCE; onGround.current = false; }
    velY.current -= GRAVITY;
    posY.current += velY.current;
    if (posY.current <= 1.5) { posY.current = 1.5; velY.current = 0; onGround.current = true; }

    camera.position.set(pos.current.x, posY.current, pos.current.z);
    camera.rotation.set(0, yaw.current, 0);

    // Shooting
    shootCooldown.current = Math.max(0, shootCooldown.current - 1);
    if (inputState.shoot && shootCooldown.current === 0) {
      shootCooldown.current = 20;
      playShoot();
      onShootAnim();
      // Raycast forward for monsters
      const dir = new THREE.Vector3(-sin, 0, -cos).normalize();
      for (const m of gameState.monsters) {
        if (!m.alive) continue;
        const toM = new THREE.Vector3(m.x - pos.current.x, 0, m.z - pos.current.z);
        const dist = toM.length();
        if (dist > SHOOT_RANGE) continue;
        toM.normalize();
        const dot = dir.dot(toM);
        if (dot > 0.92) {
          m.alive = false;
          gameState.kills++;
          playHit();
          onKill();
        }
      }
      inputState.shoot = false;
    }

    // Monster collision / damage
    damageCooldown.current = Math.max(0, damageCooldown.current - 1);
    for (const m of gameState.monsters) {
      if (!m.alive) continue;
      const d = Math.sqrt((pos.current.x - m.x) ** 2 + (pos.current.z - m.z) ** 2);
      if (d < MONSTER_ATTACK_DIST && damageCooldown.current === 0) {
        damageCooldown.current = 60;
        gameState.health--;
        playDamage();
        onDamage();
        m.alive = false;
        if (gameState.health <= 0) {
          gameState.gameOver = true;
          playGameOver();
          onGameOver();
        }
      }
    }

    // Win check
    const finishX = fx * CELL_SIZE + CELL_SIZE / 2;
    const finishZ = fz * CELL_SIZE + CELL_SIZE / 2;
    if (Math.sqrt((pos.current.x - finishX) ** 2 + (pos.current.z - finishZ) ** 2) < 0.8) {
      gameState.won = true;
      playWin();
      onWin();
    }
  });

  return null;
}

/* ─── Main component ─── */
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
  onDamage: () => void;
  onKill: () => void;
  onGameOver: () => void;
  onShootAnim: () => void;
  resetKey: number;
}

export default function MazeGame({
  onForward, onBackward, onRotLeft, onRotRight, onJump,
  onForwardEnd, onBackwardEnd, onRotLeftEnd, onRotRightEnd, onJumpEnd,
  onWin, onDamage, onKill, onGameOver, onShootAnim, resetKey,
}: MazeGameProps) {
  const playerPos = useRef({ x: 0, z: 0 });

  // Sync player position for monsters
  const [sx, sz] = findCell(2);
  playerPos.current = { x: sx * CELL_SIZE + CELL_SIZE / 2, z: sz * CELL_SIZE + CELL_SIZE / 2 };

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
  }, [onForward, onBackward, onRotLeft, onRotRight, onJump, onForwardEnd, onBackwardEnd, onRotLeftEnd, onRotRightEnd, onJumpEnd]);

  return (
    <Canvas
      style={{ width: "100%", height: "100%" }}
      camera={{ fov: 75, near: 0.1, far: 100, position: [3, 1.5, 3] }}
      gl={{ antialias: true }}
    >
      <ambientLight intensity={0.5} />
      <pointLight position={[14, 8, 14]} intensity={1} />
      <pointLight position={[3, 2.5, 3]} intensity={0.6} color="hsl(30, 80%, 70%)" />
      <pointLight position={[20, 2.5, 20]} intensity={0.5} color="hsl(0, 70%, 60%)" />
      <fog attach="fog" args={["#1a0a0a", 1, 22]} />
      <color attach="background" args={["#1a0a0a"]} />
      <Walls />
      <Floor />
      <FinishMarker />
      {gameState.monsters.map((_, i) => (
        <MonsterSprite key={`${resetKey}-${i}`} index={i} playerRef={playerPos} />
      ))}
      <Player
        onWin={onWin}
        onDamage={onDamage}
        onKill={onKill}
        onGameOver={onGameOver}
        onShootAnim={onShootAnim}
        resetKey={resetKey}
      />
    </Canvas>
  );
}
