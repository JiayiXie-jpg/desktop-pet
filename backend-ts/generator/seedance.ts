import fs from 'fs';
import path from 'path';
import { VOLC_BASE_URL, VOLC_API_KEY, SEEDANCE_MODEL, getHeaders, SubjectType } from '../config';

// All videos use the SAME base image as first_frame AND last_frame.
// The motion prompt is the ONLY thing that differs between states.
const PET_STATE_PROMPTS: Record<string, string> = {
  sleeping: 'slowly closes eyes, head gently droops down, dozing off peacefully, then opens eyes again',
  sitting: 'occasional slow blink, very subtle ear twitch, body stays completely still',
  eating: 'a food bowl appears on the ground, the animal lowers head down to the bowl and eats from it, chewing gently, then raises head back to original position, the bowl must be clearly visible throughout',
  moving: 'takes a few playful steps, gentle tail wag, then returns to original position',
};

const CHILD_STATE_PROMPTS: Record<string, string> = {
  sleeping: 'slowly closes eyes, head gently nods down, dozing off peacefully, gentle breathing, then opens eyes again',
  sitting: 'occasional slow blink, subtle head tilt, body stays still, looking around curiously',
  eating: 'a small plate of snacks appears, the child picks up food and eats it, chewing happily, then puts hands down',
  moving: 'takes a few wobbly steps forward, arms out for balance, then sits back down',
};

const CHARACTER_STATE_PROMPTS: Record<string, string> = {
  sleeping: 'slowly closes eyes, head gently droops down, dozing off peacefully, then opens eyes again',
  sitting: 'occasional slow blink, subtle body sway, stays mostly still, looking forward',
  eating: 'a plate of food appears on the ground, the character bends down to eat from it, then stands back up',
  moving: 'takes a few steps forward with a confident pose, then returns to original position',
};

function getStatePrompts(subjectType: SubjectType): Record<string, string> {
  if (subjectType === 'child') return CHILD_STATE_PROMPTS;
  if (subjectType === 'character') return CHARACTER_STATE_PROMPTS;
  return PET_STATE_PROMPTS;
}

// Props/objects that appear in each state's video (used for matting)
export const STATE_PROPS: Record<string, string[]> = {
  sleeping: [],
  sitting: [],
  eating: ['bowl', 'food', 'plate', 'dish'],
  moving: [],
};

function loadImageAsDataUri(imagePath: string): string {
  const ext = path.extname(imagePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  const b64 = fs.readFileSync(imagePath).toString('base64');
  return `data:${mime};base64,${b64}`;
}

async function submitVideoTask(
  firstImagePath: string,
  lastImagePath: string,
  motionPrompt: string,
  duration: number = 5,
): Promise<string> {
  const firstUri = loadImageAsDataUri(firstImagePath);
  const lastUri = loadImageAsDataUri(lastImagePath);
  const promptText = `${motionPrompt}, fixed camera, static shot, no camera movement --duration ${duration} --watermark false`;

  const content: any[] = [
    { type: 'text', text: promptText },
    { type: 'image_url', image_url: { url: firstUri }, role: 'first_frame' },
    { type: 'image_url', image_url: { url: lastUri }, role: 'last_frame' },
  ];

  const res = await fetch(`${VOLC_BASE_URL}/contents/generations/tasks`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ model: SEEDANCE_MODEL, content }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Seedance submit error: ${res.status} - ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const taskId = data?.id;
  if (!taskId) throw new Error(`Seedance returned no task ID: ${JSON.stringify(data)}`);
  return taskId;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadVideo(videoUrl: string, outputPath: string): Promise<void> {
  const res = await fetch(videoUrl);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outputPath, buf);
}

type ProgressCallback = (current: number, total: number, message: string) => void;

interface TaskEntry {
  taskId: string | null;
  outputPath: string;
  label: string;
}

/**
 * Generate all state videos using the SAME base image as first_frame AND last_frame.
 * This ensures:
 * - Consistent character (no color/shape changes between states)
 * - Fixed camera (same composition in every video)
 * - Seamless looping (starts and ends on the same frame)
 */
export async function generateAllVideos(
  baseImagePath: string,
  outputDir: string,
  progressCallback?: ProgressCallback,
  subjectType: SubjectType = 'pet',
): Promise<{ idle: Record<string, string> }> {
  fs.mkdirSync(outputDir, { recursive: true });

  const tasks: TaskEntry[] = [];
  const statePrompts = getStatePrompts(subjectType);

  // All state videos: same base image as first_frame AND last_frame
  for (const [state, prompt] of Object.entries(statePrompts)) {
    const outPath = path.join(outputDir, `${state}.mp4`);
    if (fs.existsSync(outPath)) {
      console.log(`  [Seedance] ${state}.mp4 already exists, skipping`);
      tasks.push({ taskId: null, outputPath: outPath, label: state });
      continue;
    }
    const taskId = await submitVideoTask(baseImagePath, baseImagePath, prompt, 5);
    tasks.push({ taskId, outputPath: outPath, label: state });
    console.log(`  [Seedance] ${state}: task ${taskId}`);
  }

  // Poll all tasks
  let pending = tasks.filter((t) => t.taskId !== null);
  const total = tasks.length;
  let completed = total - pending.length;

  console.log(`\n  [Seedance] ${pending.length} tasks submitted, polling...`);

  const pollHeaders = { Authorization: `Bearer ${VOLC_API_KEY}` };

  while (pending.length > 0) {
    await sleep(5000);
    const stillPending: TaskEntry[] = [];

    for (const task of pending) {
      try {
        const res = await fetch(
          `${VOLC_BASE_URL}/contents/generations/tasks/${task.taskId}`,
          { headers: pollHeaders },
        );
        const data = await res.json();
        const status = data?.status;

        if (status === 'succeeded') {
          const videoUrl = data?.content?.video_url;
          if (videoUrl) {
            await downloadVideo(videoUrl, task.outputPath);
            completed++;
            const sizeKb = Math.round(fs.statSync(task.outputPath).size / 1024);
            console.log(`  [Seedance] ${task.label} downloaded (${sizeKb} KB)`);
            progressCallback?.(completed, total, `${task.label} done`);
          }
          continue;
        }
        if (status === 'failed') {
          const errMsg = data?.error?.message || 'unknown';
          console.log(`  [Seedance] ${task.label} FAILED: ${errMsg}`);
          completed++;
          continue;
        }
      } catch {
        // will retry
      }
      stillPending.push(task);
    }

    pending = stillPending;
    if (pending.length > 0) {
      console.log(`  [Seedance] ${completed}/${total} done, ${pending.length} pending...`);
    }
  }

  // Collect results
  const idle: Record<string, string> = {};
  for (const task of tasks) {
    if (fs.existsSync(task.outputPath)) {
      idle[task.label] = task.outputPath;
    }
  }

  return { idle };
}
