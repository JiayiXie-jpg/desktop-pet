import path from 'path';

export const VOLC_API_KEY = process.env.VOLC_API_KEY || '';
export const VOLC_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

export const SEEDREAM_MODEL = 'doubao-seedream-4-5-251128';
export const IMAGE_SIZE = '1920x1920';

export const SEEDANCE_MODEL = 'doubao-seedance-1-5-pro-251215';

export const VISION_MODEL = 'doubao-1-5-vision-pro-32k-250115';

export const SERVER_HOST = '127.0.0.1';
export const SERVER_PORT = 8765;

export const ASSETS_DIR = path.join(__dirname, 'assets');
export const PETS_BASE_DIR = path.join(__dirname, 'pets');
export const DATA_DIR = path.join(__dirname, 'data');
export const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

export const PET_STATES = ['sleeping', 'sitting', 'eating', 'moving', 'talking', 'happy', 'cute', 'waving'] as const;
export type PetState = (typeof PET_STATES)[number];

export type SubjectType = 'pet' | 'child' | 'character';

export const DETECTION_INTERVAL = 4;

export function getHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${VOLC_API_KEY}`,
  };
}
