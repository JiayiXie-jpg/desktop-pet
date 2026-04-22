import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DATA_DIR, PETS_BASE_DIR } from '../config';

// Safe alphabet (no 0/O/1/I/L)
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ID_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

export function readJSON<T>(filename: string): T {
  const filepath = path.join(DATA_DIR, filename);
  ensureDir(DATA_DIR);
  if (!fs.existsSync(filepath)) return {} as T;
  return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
}

export function writeJSON(filename: string, data: any) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
}

function randomString(length: number, chars: string): string {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes).map(b => chars[b % chars.length]).join('');
}

export function generatePetId(): string {
  return randomString(8, ID_CHARS);
}

export function generateCode(): string {
  return randomString(8, CODE_CHARS);
}

// --- Codes ---

export interface CodeRecord {
  createdAt: string;
  usedBy: string | null;
  usedAt: string | null;
}

export function getCodes(): Record<string, CodeRecord> {
  return readJSON<Record<string, CodeRecord>>('codes.json');
}

export function saveCodes(codes: Record<string, CodeRecord>) {
  writeJSON('codes.json', codes);
}

// --- Pets ---

export interface PetRecord {
  id: string;
  name: string;
  code: string;
  status: 'pending' | 'generating' | 'ready' | 'error';
  createdAt: string;
  ownerId?: string;
}

export function getPets(): Record<string, PetRecord> {
  return readJSON<Record<string, PetRecord>>('pets.json');
}

export function savePets(pets: Record<string, PetRecord>) {
  writeJSON('pets.json', pets);
}

export function getPetDir(petId: string): string {
  return path.join(PETS_BASE_DIR, petId);
}

// --- Likes ---

export interface LikeRecord {
  count: number;
  voters: string[]; // clientId entries (same ID can appear up to 3 times)
}

export function getLikes(): Record<string, LikeRecord> {
  return readJSON<Record<string, LikeRecord>>('likes.json');
}

export function saveLikes(likes: Record<string, LikeRecord>) {
  writeJSON('likes.json', likes);
}

// --- Reminders ---

export interface Reminder {
  id: string;
  petId: string;
  label: string;
  message: string;
  type: 'fixed' | 'interval';
  time?: string;          // HH:MM for fixed
  intervalMinutes?: number; // for interval
  enabled: boolean;
  createdAt: string;
}

export function getReminders(): Record<string, Reminder> {
  return readJSON<Record<string, Reminder>>('reminders.json');
}

export function saveReminders(reminders: Record<string, Reminder>) {
  writeJSON('reminders.json', reminders);
}


// --- Users ---

export interface UserRecord {
  id: string;
  username: string;
  password: string;
  petIds: string[];
  createdAt: string;
  migratedFrom?: string;
}

export function getUsers(): Record<string, UserRecord> {
  return readJSON<Record<string, UserRecord>>('users.json');
}

export function saveUsers(users: Record<string, UserRecord>) {
  writeJSON('users.json', users);
}

export function generateUserId(): string {
  return randomString(8, ID_CHARS);
}
export function ensurePetDir(petId: string): string {
  const dir = getPetDir(petId);
  ensureDir(dir);
  ensureDir(path.join(dir, 'uploads'));
  return dir;
}

// --- DIY Tasks ---
export interface DiyTask {
  id: string;
  userId: string;
  username: string;
  status: "pending" | "processing" | "done" | "failed";
  stage: "queued" | "describe" | "seedream" | "seedance" | "matting" | "complete";
  progress: number;
  message: string;
  avatarName: string;
  result?: {
    states: string[];
  };
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export function getDiyTasks(): Record<string, DiyTask> {
  return readJSON<Record<string, DiyTask>>("diy_tasks.json");
}

export function saveDiyTasks(tasks: Record<string, DiyTask>) {
  writeJSON("diy_tasks.json", tasks);
}

export function generateTaskId(): string {
  return randomString(8, ID_CHARS);
}
