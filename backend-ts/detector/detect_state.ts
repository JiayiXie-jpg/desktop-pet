import fs from 'fs';
import path from 'path';
import { VOLC_BASE_URL, VISION_MODEL, getHeaders, ASSETS_DIR, PetState } from '../config';

const CAMERA_FRAME_PATH = path.join(ASSETS_DIR, 'camera_frame.jpg');

const SYSTEM_PROMPT =
  'You are a behavior classifier. Given a camera image, determine what the subject (pet or child) is doing. ' +
  'Reply with exactly one word: sleeping, sitting, eating, or moving. ' +
  'Rules: ' +
  '- sleeping: eyes closed, lying still, sleeping posture ' +
  '- eating: head lowered toward food/bowl/plate, chewing, holding food ' +
  '- moving: walking, running, jumping, playing, crawling ' +
  '- sitting: everything else (standing, sitting, looking around, resting with eyes open)';

/**
 * Read the latest camera frame and classify subject state via Vision LLM.
 * Returns null if no frame available or on error.
 */
export async function detectPetState(): Promise<PetState | null> {
  if (!fs.existsSync(CAMERA_FRAME_PATH)) {
    return null;
  }

  // Check frame freshness (skip if older than 30s)
  const stat = fs.statSync(CAMERA_FRAME_PATH);
  const ageMs = Date.now() - stat.mtimeMs;
  if (ageMs > 30_000) {
    console.log(`  [Detect] Frame too old (${Math.round(ageMs / 1000)}s), skipping`);
    return null;
  }

  const b64 = fs.readFileSync(CAMERA_FRAME_PATH).toString('base64');
  const dataUri = `data:image/jpeg;base64,${b64}`;

  const payload = {
    model: VISION_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUri } },
          { type: 'text', text: 'What is the subject doing?' },
        ],
      },
    ],
    max_tokens: 10,
  };

  try {
    const res = await fetch(`${VOLC_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn(`  [Detect] Vision API error: ${res.status} - ${text.slice(0, 100)}`);
      return null;
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content?.trim().toLowerCase() || '';

    // Extract the state word
    const validStates: PetState[] = ['sleeping', 'sitting', 'eating', 'moving'];
    const detected = validStates.find((s) => raw.includes(s));

    if (detected) {
      console.log(`  [Detect] State: ${detected} (raw: "${raw}")`);
      return detected;
    }

    console.log(`  [Detect] Unrecognized response: "${raw}", defaulting to sitting`);
    return 'sitting';
  } catch (err: any) {
    console.warn(`  [Detect] Error: ${err.message}`);
    return null;
  }
}
