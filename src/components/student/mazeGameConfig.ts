import monster1Url from "@/assets/monster1.webp";
import monster2Url from "@/assets/monster2.jpg";
import monster3Url from "@/assets/monster3.png";
import monster4Url from "@/assets/monster4.jpg";
import monster5Url from "@/assets/monster5.jpg";

// Cell types: 0=empty, 1=wall, 2=player spawn, 3=exit, 4=door, 5=health pickup
export const MAZE_MAP = [
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

export const WALL_HEIGHT = 2.8;
export const CELL_SIZE = 2;
export const PLAYER_RADIUS = 0.3;
export const MOVE_SPEED = 0.08;
export const ROTATE_SPEED = 0.03;
export const JUMP_FORCE = 0.12;
export const GRAVITY = 0.006;
export const MONSTER_SPEED = 0.015;
export const MONSTER_ATTACK_DIST = 0.8;
export const SHOOT_RANGE = 16;
export const BULLET_SPEED = 0.5;
export const BULLET_LIFE = 60;
export const DOOR_OPEN_DIST = 2.5;

export const MONSTER_SPAWNS: [number, number][] = [
  [6, 6], [2, 10], [10, 8], [8, 12], [4, 15],
];
export const MONSTER_TEXTURES = [monster1Url, monster2Url, monster3Url, monster4Url, monster5Url];

export interface Bullet {
  x: number; z: number; y: number;
  dx: number; dz: number;
  life: number;
  weapon: number;
}

export function findCell(value: number): [number, number] {
  for (let z = 0; z < MAZE_MAP.length; z++)
    for (let x = 0; x < MAZE_MAP[z].length; x++)
      if (MAZE_MAP[z][x] === value) return [x, z];
  return [1, 1];
}

export function findAllCells(value: number): [number, number][] {
  const result: [number, number][] = [];
  for (let z = 0; z < MAZE_MAP.length; z++)
    for (let x = 0; x < MAZE_MAP[z].length; x++)
      if (MAZE_MAP[z][x] === value) result.push([x, z]);
  return result;
}

export function isWall(x: number, z: number): boolean {
  const gz = Math.floor(z / CELL_SIZE);
  const gx = Math.floor(x / CELL_SIZE);
  if (gz < 0 || gz >= MAZE_MAP.length || gx < 0 || gx >= MAZE_MAP[0].length) return true;
  return MAZE_MAP[gz][gx] === 1;
}

export function isBlocked(x: number, z: number, openedDoors: Set<string>): boolean {
  const gz = Math.floor(z / CELL_SIZE);
  const gx = Math.floor(x / CELL_SIZE);
  if (gz < 0 || gz >= MAZE_MAP.length || gx < 0 || gx >= MAZE_MAP[0].length) return true;
  const cell = MAZE_MAP[gz][gx];
  if (cell === 1) return true;
  if (cell === 4 && !openedDoors.has(`${gx},${gz}`)) return true;
  return false;
}

export function canMoveDynamic(x: number, z: number, openedDoors: Set<string>): boolean {
  return (
    !isBlocked(x - PLAYER_RADIUS, z - PLAYER_RADIUS, openedDoors) &&
    !isBlocked(x + PLAYER_RADIUS, z - PLAYER_RADIUS, openedDoors) &&
    !isBlocked(x - PLAYER_RADIUS, z + PLAYER_RADIUS, openedDoors) &&
    !isBlocked(x + PLAYER_RADIUS, z + PLAYER_RADIUS, openedDoors)
  );
}

export function canMove(x: number, z: number): boolean {
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
