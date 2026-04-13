import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useRef, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";

import monster1Url from "@/assets/monster1.png";
import monster2Url from "@/assets/monster2.jpg";
import monster3Url from "@/assets/monster3.png";
import monster4Url from "@/assets/monster4.jpg";
import monster5Url from "@/assets/monster5.jpg";

import { playShoot, playHit, playDamage, playStep, playWin, playGameOver, playPickup } from "./MazeSounds";

// Cell types: 0=empty, 1=wall, 2=player spawn, 3=exit, 4=door, 5=health pickup
// Expanded map with open field at start that narrows into maze
const MAZE_MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,2,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,0,0,0,1,1,1,1,1,1,1,1],
  [1,0,0,0,4,0,0,0,0,1,0,0,0,1],
  [1,0,1,0,1,0,1,1,0,1,0,1,0,1],
  [1,0,1,5,0,0,0,1,0,0,0,1,0,1],
  [1,0,0,0,1,1,0,4,0,1,0,0,0,1],
  [1,1,1,0,0,1,0,1,1,1,0,1,1,1],
  [1,0,0,0,1,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,0,1,1,1,0,1,1,0,1],
  [1,0,0,5,0,0,0,1,0,0,0,1,0,1],
  [1,1,1,0,1,1,0,4,0,1,0,0,0,1],
  [1,0,0,0,0,1,0,1,0,1,0,1,0,1],
  [1,0,1,1,0,0,0,1,5,0,0,1,0,1],
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
const BULLET_SPEED = 0.5;
const BULLET_LIFE = 60;
const DOOR_OPEN_DIST = 2.5;

const MONSTER_SPAWNS: [number, number][] = [
  [6, 6], [2, 10], [10, 8], [8, 12], [4, 15],
];
const MONSTER_TEXTURES = [monster1Url, monster2Url, monster3Url, monster4Url, monster5Url];

interface Bullet {
  x: number; z: number; y: number;
  dx: number; dz: number;
  life: number;
  weapon: number;
}

// Find all cells of a given type
function findCell(value: number): [number, number] {
  for (let z = 0; z < MAZE_MAP.length; z++)
    for (let x = 0; x < MAZE_MAP[z].length; x++)
      if (MAZE_MAP[z][x] === value) return [x, z];
  return [1, 1];
}

function findAllCells(value: number): [number, number][] {
  const result: [number, number][] = [];
  for (let z = 0; z < MAZE_MAP.length; z++)
    for (let x = 0; x < MAZE_MAP[z].length; x++)
      if (MAZE_MAP[z][x] === value) result.push([x, z]);
  return result;
}

// Doors and health pickups are passable
function isWall(x: number, z: number): boolean {
  const gz = Math.floor(z / CELL_SIZE);
  const gx = Math.floor(x / CELL_SIZE);
  if (gz < 0 || gz >= MAZE_MAP.length || gx < 0 || gx >= MAZE_MAP[0].length) return true;
  const cell = MAZE_MAP[gz][gx];
  return cell === 1; // doors (4) are passable when opened
}

// Dynamic wall check that accounts for opened doors
function isBlocked(x: number, z: number, openedDoors: Set<string>): boolean {
  const gz = Math.floor(z / CELL_SIZE);
  const gx = Math.floor(x / CELL_SIZE);
  if (gz < 0 || gz >= MAZE_MAP.length || gx < 0 || gx >= MAZE_MAP[0].length) return true;
  const cell = MAZE_MAP[gz][gx];
  if (cell === 1) return true;
  if (cell === 4 && !openedDoors.has(`${gx},${gz}`)) return true;
  return false;
}

function canMoveDynamic(x: number, z: number, openedDoors: Set<string>): boolean {
  return (
    !isBlocked(x - PLAYER_RADIUS, z - PLAYER_RADIUS, openedDoors) &&
    !isBlocked(x + PLAYER_RADIUS, z - PLAYER_RADIUS, openedDoors) &&
    !isBlocked(x - PLAYER_RADIUS, z + PLAYER_RADIUS, openedDoors) &&
    !isBlocked(x + PLAYER_RADIUS, z + PLAYER_RADIUS, openedDoors)
  );
}

function canMove(x: number, z: number): boolean {
  return (
    !isWall(x - PLAYER_RADIUS, z - PLAYER_RADIUS) &&
    !isWall(x + PLAYER_RADIUS, z - PLAYER_RADIUS) &&
    !isWall(x - PLAYER_RADIUS, z + PLAYER_RADIUS) &&
    !isWall(x + PLAYER_RADIUS, z + PLAYER_RADIUS)
  );
}

export const inputState = {
  forward: false, backward: false, left: false, right: false,
  jump: false, rotateLeft: false, rotateRight: false, shoot: false,
};

export const gameState = {
  health: 3,
  kills: 0,
  gameOver: false,
  won: false,
  shooting: false,
  weapon: 1,
  openedDoors: new Set<string>(),
  pickedUpHealth: new Set<string>(),
  monsters: MONSTER_SPAWNS.map((s, i) => ({
    x: s[0] * CELL_SIZE + CELL_SIZE / 2,
    z: s[1] * CELL_SIZE + CELL_SIZE / 2,
    alive: true,
    texIndex: i,
  })),
  bullets: [] as Bullet[],
};

export function resetGameState() {
  gameState.health = 3;
  gameState.kills = 0;
  gameState.gameOver = false;
  gameState.won = false;
  gameState.shooting = false;
  gameState.weapon = 1;
  gameState.openedDoors = new Set();
  gameState.pickedUpHealth = new Set();
  gameState.monsters = MONSTER_SPAWNS.map((s, i) => ({
    x: s[0] * CELL_SIZE + CELL_SIZE / 2,
    z: s[1] * CELL_SIZE + CELL_SIZE / 2,
    alive: true,
    texIndex: i,
  }));
  gameState.bullets = [];
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

/* ─── Floor ─── */
function Floor() {
  const width = MAZE_MAP[0].length * CELL_SIZE;
  const height = MAZE_MAP.length * CELL_SIZE;
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
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[width / 2, 0, height / 2]}>
      <planeGeometry args={[width, height]} />
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

/* ─── Door ─── */
function Door({ x, z, playerRef }: { x: number; z: number; playerRef: React.MutableRefObject<{ x: number; z: number }> }) {
  const key = `${x},${z}`;
  const worldX = x * CELL_SIZE + CELL_SIZE / 2;
  const worldZ = z * CELL_SIZE + CELL_SIZE / 2;
  const meshRef = useRef<THREE.Mesh>(null);
  const [opened, setOpened] = useState(false);
  const openProgress = useRef(0);

  useFrame(() => {
    const px = playerRef.current.x;
    const pz = playerRef.current.z;
    const dist = Math.sqrt((px - worldX) ** 2 + (pz - worldZ) ** 2);
    
    if (dist < DOOR_OPEN_DIST && !opened) {
      setOpened(true);
      gameState.openedDoors.add(key);
    }

    if (opened && openProgress.current < 1) {
      openProgress.current = Math.min(1, openProgress.current + 0.03);
    }

    if (meshRef.current) {
      meshRef.current.position.y = WALL_HEIGHT / 2 + openProgress.current * WALL_HEIGHT;
      meshRef.current.scale.y = 1 - openProgress.current * 0.9;
    }
  });

  if (openProgress.current >= 1) return null;

  return (
    <mesh ref={meshRef} position={[worldX, WALL_HEIGHT / 2, worldZ]}>
      <boxGeometry args={[CELL_SIZE * 0.9, WALL_HEIGHT, 0.2]} />
      <meshStandardMaterial color="hsl(30, 60%, 35%)" roughness={0.6} />
    </mesh>
  );
}

/* ─── Health Pickup (heart) ─── */
function HealthPickup({ x, z, playerRef, onPickup }: { 
  x: number; z: number; 
  playerRef: React.MutableRefObject<{ x: number; z: number }>; 
  onPickup: () => void;
}) {
  const key = `${x},${z}`;
  const worldX = x * CELL_SIZE + CELL_SIZE / 2;
  const worldZ = z * CELL_SIZE + CELL_SIZE / 2;
  const ref = useRef<THREE.Mesh>(null);
  const [collected, setCollected] = useState(false);

  useFrame(({ clock }) => {
    if (collected || gameState.pickedUpHealth.has(key)) return;
    if (ref.current) {
      ref.current.position.y = 0.6 + Math.sin(clock.elapsedTime * 3) * 0.15;
      ref.current.rotation.y = clock.elapsedTime * 2;
    }

    const px = playerRef.current.x;
    const pz = playerRef.current.z;
    const dist = Math.sqrt((px - worldX) ** 2 + (pz - worldZ) ** 2);
    if (dist < 1.0 && gameState.health < 3) {
      gameState.health = Math.min(3, gameState.health + 1);
      gameState.pickedUpHealth.add(key);
      setCollected(true);
      playPickup();
      onPickup();
    }
  });

  if (collected || gameState.pickedUpHealth.has(key)) return null;

  return (
    <mesh ref={ref} position={[worldX, 0.6, worldZ]}>
      <octahedronGeometry args={[0.25]} />
      <meshStandardMaterial color="hsl(0, 80%, 55%)" emissive="hsl(0, 80%, 40%)" emissiveIntensity={2} />
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
    meshRef.current.position.set(m.x, 1.2, m.z);
    meshRef.current.lookAt(playerRef.current.x, 1.2, playerRef.current.z);
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

/* ─── Bullets renderer ─── */
function Bullets() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    for (let i = gameState.bullets.length - 1; i >= 0; i--) {
      const b = gameState.bullets[i];
      b.x += b.dx * BULLET_SPEED;
      b.z += b.dz * BULLET_SPEED;
      b.life--;

      if (isWall(b.x, b.z)) {
        gameState.bullets.splice(i, 1);
        continue;
      }

      let hit = false;
      for (const m of gameState.monsters) {
        if (!m.alive) continue;
        const d = Math.sqrt((b.x - m.x) ** 2 + (b.z - m.z) ** 2);
        if (d < 0.6) {
          m.alive = false;
          gameState.kills++;
          playHit();
          hit = true;
          break;
        }
      }
      if (hit || b.life <= 0) {
        gameState.bullets.splice(i, 1);
      }
    }

    if (groupRef.current) {
      while (groupRef.current.children.length > gameState.bullets.length) {
        groupRef.current.remove(groupRef.current.children[groupRef.current.children.length - 1]);
      }
    }
  });

  return (
    <group ref={groupRef}>
      {gameState.bullets.map((b, i) => (
        <group key={i}>
          <mesh position={[b.x, b.y, b.z]}>
            <sphereGeometry args={[b.weapon === 2 ? 0.15 : 0.06, 8, 8]} />
            <meshStandardMaterial
              color={b.weapon === 2 ? "#ff6600" : "#ffff00"}
              emissive={b.weapon === 2 ? "#ff4400" : "#ffaa00"}
              emissiveIntensity={3}
            />
          </mesh>
          {/* Rocket trail */}
          {b.weapon === 2 && (
            <>
              <mesh position={[b.x - b.dx * 0.3, b.y, b.z - b.dz * 0.3]}>
                <sphereGeometry args={[0.1, 6, 6]} />
                <meshStandardMaterial color="#ff4400" emissive="#ff2200" emissiveIntensity={2} transparent opacity={0.7} />
              </mesh>
              <mesh position={[b.x - b.dx * 0.6, b.y, b.z - b.dz * 0.6]}>
                <sphereGeometry args={[0.07, 6, 6]} />
                <meshStandardMaterial color="#ff6600" emissive="#ff4400" emissiveIntensity={1.5} transparent opacity={0.4} />
              </mesh>
            </>
          )}
        </group>
      ))}
    </group>
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
  playerPosRef: React.MutableRefObject<{ x: number; z: number }>;
}

function Player({ onWin, onDamage, onKill, onGameOver, onShootAnim, resetKey, playerPosRef }: PlayerProps) {
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
      if (e.button === 0) inputState.shoot = true;
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
    if (canMoveDynamic(nx, nz, gameState.openedDoors)) { pos.current.x = nx; pos.current.z = nz; }
    else if (canMoveDynamic(nx, pos.current.z, gameState.openedDoors)) { pos.current.x = nx; }
    else if (canMoveDynamic(pos.current.x, nz, gameState.openedDoors)) { pos.current.z = nz; }

    playerPosRef.current = { x: pos.current.x, z: pos.current.z };

    if (moving) {
      stepTimer.current++;
      if (stepTimer.current % 15 === 0) playStep();
    }

    if (inputState.jump && onGround.current) { velY.current = JUMP_FORCE; onGround.current = false; }
    velY.current -= GRAVITY;
    posY.current += velY.current;
    if (posY.current <= 1.5) { posY.current = 1.5; velY.current = 0; onGround.current = true; }

    camera.position.set(pos.current.x, posY.current, pos.current.z);
    camera.rotation.set(0, yaw.current, 0);

    shootCooldown.current = Math.max(0, shootCooldown.current - 1);
    if (inputState.shoot && shootCooldown.current === 0) {
      const w = gameState.weapon;
      shootCooldown.current = w === 2 ? 30 : w === 0 ? 10 : 20;
      playShoot(w);
      onShootAnim();

      if (w === 0) {
        const dir = new THREE.Vector3(-sin, 0, -cos).normalize();
        for (const m of gameState.monsters) {
          if (!m.alive) continue;
          const toM = new THREE.Vector3(m.x - pos.current.x, 0, m.z - pos.current.z);
          const dist = toM.length();
          if (dist > 2.5) continue;
          toM.normalize();
          if (dir.dot(toM) > 0.85) {
            m.alive = false;
            gameState.kills++;
            playHit();
            onKill();
          }
        }
      } else {
        gameState.bullets.push({
          x: pos.current.x - sin * 0.5,
          z: pos.current.z - cos * 0.5,
          y: 1.2,
          dx: -sin,
          dz: -cos,
          life: BULLET_LIFE,
          weapon: w,
        });
      }
      inputState.shoot = false;
    }

    const prevKills = gameState.kills;

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

    if (gameState.kills > prevKills) {
      onKill();
    }

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
  const [sx, sz] = findCell(2);
  playerPos.current = { x: sx * CELL_SIZE + CELL_SIZE / 2, z: sz * CELL_SIZE + CELL_SIZE / 2 };

  const doorCells = useMemo(() => findAllCells(4), []);
  const healthCells = useMemo(() => findAllCells(5), []);

  const handleHealthPickup = () => {
    onDamage(); // reuse to sync health display
  };

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
      <Bullets />
      {doorCells.map(([x, z]) => (
        <Door key={`door-${x}-${z}-${resetKey}`} x={x} z={z} playerRef={playerPos} />
      ))}
      {healthCells.map(([x, z]) => (
        <HealthPickup key={`hp-${x}-${z}-${resetKey}`} x={x} z={z} playerRef={playerPos} onPickup={handleHealthPickup} />
      ))}
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
        playerPosRef={playerPos}
      />
    </Canvas>
  );
}
