import fs from 'fs';
import path from 'path';
import { VOLC_BASE_URL, SEEDREAM_MODEL, getHeaders, SubjectType } from '../config';

function loadImageAsDataUri(imagePath: string): string {
  const ext = path.extname(imagePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  const b64 = fs.readFileSync(imagePath).toString('base64');
  return `data:${mime};base64,${b64}`;
}

/**
 * Generate ONE base image of the pet in sitting pose.
 * @param petPhotoPath - User's pet photo (used as reference_image)
 * @param petDescription - Auto-detected description from Vision LLM,
 *   e.g. "a gray-white tabby cat with big round eyes"
 */
export async function generateBaseImage(
  petPhotoPath: string,
  outputDir: string,
  petDescription: string,
  subjectType: SubjectType = 'pet',
): Promise<string> {
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'base.png');

  if (fs.existsSync(outputPath)) {
    console.log('  [Seedream] base.png already exists, skipping');
    return outputPath;
  }

  const refUri = loadImageAsDataUri(petPhotoPath);

  const text = petDescription.toLowerCase();
  let prompt: string;

  if (subjectType === 'child') {
    prompt = `Same child as reference image, ${petDescription}, sitting on the floor, looking at camera, happy expression, solid light background, full body, centered`;
  } else if (subjectType === 'character') {
    prompt = `Same character as reference image, ${petDescription}, standing perfectly still, looking at camera, solid plain background, full body, centered, anime style`;
  } else if (/fish|fins|piranha|whale/.test(text)) {
    prompt = `Same animal as reference image, ${petDescription}, swimming perfectly still, solid white background, full body, centered`;
  } else if (/scales|gecko|lizard|turtle|tortoise|elephant/.test(text)) {
    prompt = `Same animal as reference image, ${petDescription}, crawling perfectly still, looking at camera, solid light gray background, full body, centered`;
  } else if (/dog|bichon|retriever|sheepadoodle|schnauzer|poodle|corgi|husky|labrador|pomeranian|bulldog|terrier|shepherd|beagle|dachshund|chihuahua|puppy/.test(text)) {
    prompt = `Same animal as reference image, ${petDescription}, sitting perfectly still, happy expression, solid gray background, full body, centered`;
  } else if (/cat|kitten|tabby/.test(text)) {
    prompt = `Same animal as reference image, ${petDescription}, sitting perfectly still, looking at camera, solid yellow background, full body, centered`;
  } else if (/bird|parrot|parakeet|canary|finch|cockatiel/.test(text)) {
    prompt = `Same animal as reference image, ${petDescription}, standing on a perch, looking at camera, solid light background, full body, centered`;
  } else {
    prompt = `Same animal as reference image, ${petDescription}, standing perfectly still, looking at camera, solid plain background, full body, centered`;
  }

  const payload: Record<string, any> = {
    model: SEEDREAM_MODEL,
    prompt,
    image: [refUri],
    reference_strength: 0.9,
    size: '2K',
    n: 1,
    response_format: 'url',
  };

  console.log(`  [Seedream] Generating base.png ...`);
  console.log(`  [Seedream] Prompt: ${prompt}`);

  const res = await fetch(`${VOLC_BASE_URL}/images/generations`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Seedream API error: ${res.status} - ${text.slice(0, 300)}`);
  }

  const result = await res.json();
  const imgUrl = result?.data?.[0]?.url;
  if (!imgUrl) {
    throw new Error(`Seedream returned no image URL: ${JSON.stringify(result)}`);
  }

  const imgRes = await fetch(imgUrl);
  const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
  fs.writeFileSync(outputPath, imgBuffer);

  console.log(`  [Seedream] Saved: ${outputPath} (${Math.round(imgBuffer.length / 1024)} KB)`);
  return outputPath;
}

/**
 * Generate an eating-pose image with a food bowl, using the base image as reference.
 */
export async function generateEatingImage(
  baseImagePath: string,
  outputDir: string,
  petDescription: string,
  subjectType: SubjectType = 'pet',
): Promise<string> {
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'eating.png');

  if (fs.existsSync(outputPath)) {
    console.log('  [Seedream] eating.png already exists, skipping');
    return outputPath;
  }

  const refUri = loadImageAsDataUri(baseImagePath);

  const text = petDescription.toLowerCase();
  let foodItem = 'food bowl';
  if (subjectType === 'child') {
    foodItem = 'a small plate of snacks';
  } else if (subjectType === 'character') {
    foodItem = 'a plate of food';
  } else if (/cat|kitten|tabby/.test(text)) {
    foodItem = 'a small food bowl with fish';
  } else if (/dog|puppy|pomeranian|retriever|bulldog|terrier|poodle|corgi|husky|labrador|schnauzer|beagle|dachshund|chihuahua|bichon|sheepadoodle|shepherd/.test(text)) {
    foodItem = 'a food bowl with bone';
  } else if (/bird|parrot|parakeet|canary|finch|cockatiel/.test(text)) {
    foodItem = 'a small dish of seeds';
  } else if (/rabbit|hamster/.test(text)) {
    foodItem = 'a small bowl with carrot';
  } else if (/fish|whale|piranha/.test(text)) {
    foodItem = 'fish food flakes';
  } else if (/turtle|tortoise|lizard|gecko/.test(text)) {
    foodItem = 'a small dish of leaves';
  }

  const stylePrefix = subjectType === 'character' ? 'Anime style illustration' : 'Realistic photo';
  const prompt =
    `${stylePrefix}, same character as reference image, ${petDescription}, ` +
    `lowering head to eat from ${foodItem} on the ground, ` +
    `full body visible, centered composition, sharp details, ` +
    `clean simple background, soft lighting`;

  const payload: Record<string, any> = {
    model: SEEDREAM_MODEL,
    prompt,
    image: [refUri],
    reference_strength: 0.9,
    size: '2K',
    n: 1,
    response_format: 'url',
  };

  console.log(`  [Seedream] Generating eating.png ...`);
  console.log(`  [Seedream] Prompt: ${prompt}`);

  const res = await fetch(`${VOLC_BASE_URL}/images/generations`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Seedream API error: ${res.status} - ${errText.slice(0, 300)}`);
  }

  const result = await res.json();
  const imgUrl = result?.data?.[0]?.url;
  if (!imgUrl) {
    throw new Error(`Seedream returned no image URL: ${JSON.stringify(result)}`);
  }

  const imgRes = await fetch(imgUrl);
  const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
  fs.writeFileSync(outputPath, imgBuffer);

  console.log(`  [Seedream] Saved: ${outputPath} (${Math.round(imgBuffer.length / 1024)} KB)`);
  return outputPath;
}
