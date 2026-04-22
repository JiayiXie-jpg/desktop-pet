import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { describeSubject } from './describe';
import { generateBaseImage } from './seedream';
import { generateAllVideos } from './seedance';

type ProgressCallback = (stage: string, progress: number, message: string) => void;

const MATTE_SCRIPT = path.join(__dirname, '..', 'matting', 'matte_video_sam3.py');

function matteVideo(inputMp4: string, outputWebm: string, description: string, state: string): void {
  console.log(`  [Matte] Processing: ${path.basename(inputMp4)} → ${path.basename(outputWebm)} (${state})`);
  execSync(`python3 "${MATTE_SCRIPT}" "${inputMp4}" "${outputWebm}" "${description}" "${state}"`, {
    stdio: 'inherit',
    timeout: 10 * 60 * 1000, // 10 min per video
  });
}

export async function generatePetAssets(
  petPhotoPath: string,
  outputDir: string,
  progressCallback?: ProgressCallback,
): Promise<Record<string, any>> {
  fs.mkdirSync(outputDir, { recursive: true });
  const imagesDir = path.join(outputDir, 'images');
  const videosDir = path.join(outputDir, 'videos');
  const mattedDir = path.join(outputDir, 'matted');
  const manifestPath = path.join(outputDir, 'manifest.json');

  // Clean old assets
  console.log('Cleaning old assets...');
  fs.rmSync(imagesDir, { recursive: true, force: true });
  fs.rmSync(videosDir, { recursive: true, force: true });
  fs.rmSync(mattedDir, { recursive: true, force: true });
  if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);

  // Stage 0: Use Vision LLM to identify the subject (pet or child)
  console.log('\n=== Stage 0: Identifying subject (Vision LLM) ===');
  progressCallback?.('vision', 0, 'Identifying subject...');
  const { description, subjectType } = await describeSubject(petPhotoPath);
  progressCallback?.('vision', 1.0, `Identified: ${subjectType} - ${description}`);

  // Stage 1: Generate ONE base image
  console.log('\n=== Stage 1: Generating base image (Seedream) ===');
  progressCallback?.('seedream', 0, 'Generating base image...');
  const baseImage = await generateBaseImage(petPhotoPath, imagesDir, description, subjectType);
  progressCallback?.('seedream', 1.0, 'Base image complete');

  // Stage 2: Generate 4 state videos
  console.log('\n=== Stage 2: Generating animations (Seedance) ===');
  progressCallback?.('seedance', 0, 'Generating animations...');
  const videos = await generateAllVideos(baseImage, videosDir, (current, total, message) => {
    progressCallback?.('seedance', current / total, message);
  }, subjectType);
  progressCallback?.('seedance', 1.0, 'Animations complete');

  // Stage 3: Matte all videos (SAM3 → WebM alpha)
  console.log('\n=== Stage 3: Video matting (SAM3) ===');
  fs.mkdirSync(mattedDir, { recursive: true });
  const mattedVideos: Record<string, string> = {};
  const states = Object.keys(videos.idle);
  let mattedCount = 0;

  for (const state of states) {
    const mp4Path = videos.idle[state];
    const webmPath = path.join(mattedDir, `${state}.webm`);

    if (fs.existsSync(webmPath)) {
      console.log(`  [Matte] ${state}.webm already exists, skipping`);
      mattedVideos[state] = webmPath;
      mattedCount++;
      continue;
    }

    progressCallback?.('matting', mattedCount / states.length, `Matting ${state}...`);

    try {
      // LLM extracts all keywords (subject + accessories + state props) automatically
      matteVideo(mp4Path, webmPath, description, state);
      mattedVideos[state] = webmPath;
    } catch (e: any) {
      console.error(`  [Matte] Failed for ${state}: ${e.message}`);
      // Fallback to original mp4
      mattedVideos[state] = mp4Path;
    }
    mattedCount++;
  }
  progressCallback?.('matting', 1.0, 'Matting complete');

  // Save manifest
  const manifest = {
    subject_type: subjectType,
    subject_description: description,
    pet_photo: petPhotoPath,
    pet_description: description, // kept for backward compat
    base_image: baseImage,
    videos: {
      idle: videos.idle,        // original mp4s
      matted: mattedVideos,     // webm with alpha
    },
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log('\n=== Asset generation complete ===');
  console.log(`Subject: ${subjectType} - ${description}`);
  console.log(`Output: ${outputDir}`);

  return manifest;
}
