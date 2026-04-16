import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, globalShortcut } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';

let setupWindow: BrowserWindow | null = null;
let petWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let backendProcess: ChildProcess | null = null;

const isDev = !app.isPackaged;
const BACKEND_PORT = 8765;

// --- Config persistence for pet window size ---
function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'pet-config.json');
}

function loadConfig(): { width?: number; height?: number } {
  try { return JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8')); }
  catch { return {}; }
}

function saveConfig(config: Record<string, any>) {
  const existing = loadConfig();
  fs.writeFileSync(getConfigPath(), JSON.stringify({ ...existing, ...config }, null, 2));
}

// Windows requires this for transparent windows to work properly
if (process.platform === 'win32') {
  app.disableHardwareAcceleration();
}

// Remote server URL — when set, Electron connects to remote backend instead of spawning local one
const REMOTE_BACKEND_URL = 'http://118.196.36.27:8765';

function getBackendUrl(): string {
  return REMOTE_BACKEND_URL || `http://127.0.0.1:${BACKEND_PORT}`;
}

async function startBackend() {
  // If using remote backend, just verify it's reachable
  if (REMOTE_BACKEND_URL) {
    try {
      const res = await fetch(`${REMOTE_BACKEND_URL}/api/pets`);
      console.log(`[Backend] Remote server ${REMOTE_BACKEND_URL} is ${res.ok ? 'ready' : 'responding'}`);
    } catch {
      console.log(`[Backend] Remote server ${REMOTE_BACKEND_URL} not reachable, will retry...`);
    }
    return;
  }

  // Check if backend is already running
  try {
    const res = await fetch(`http://127.0.0.1:${BACKEND_PORT}/api/manifest`);
    if (res.ok) {
      console.log('[Backend] Already running, skipping spawn');
      return;
    }
  } catch {}

  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const serverPath = path.join(__dirname, '..', 'backend-ts', 'server.ts');

  backendProcess = spawn(npxCmd, ['tsx', serverPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: path.join(__dirname, '..'),
  });

  backendProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[Backend] ${data.toString().trim()}`);
  });

  backendProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[Backend] ${data.toString().trim()}`);
  });

  backendProcess.on('exit', (code: number | null) => {
    console.log(`[Backend] Exited with code ${code}`);
  });
}

function createSetupWindow(reupload = false) {
  setupWindow = new BrowserWindow({
    width: 600,
    height: 800,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    show: false,
  });

  // Disable all caching for remote URLs
  setupWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    details.requestHeaders['Pragma'] = 'no-cache';
    callback({ requestHeaders: details.requestHeaders });
  });

  const setupHash = reupload ? '/redeem' : '/';
  if (REMOTE_BACKEND_URL) {
    setupWindow.loadURL(`${REMOTE_BACKEND_URL}/?_t=${Date.now()}#${setupHash}`);
  } else if (isDev) {
    setupWindow.loadURL(`http://localhost:5173/#${setupHash}`);
  } else {
    setupWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
      hash: setupHash,
    });
  }

  setupWindow.once('ready-to-show', () => {
    setupWindow?.show();
  });

  setupWindow.on('closed', () => {
    setupWindow = null;
  });
}

function createPetWindow(petId = 'default') {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
  const config = loadConfig();
  const petSize = config.width || 240;

  petWindow = new BrowserWindow({
    width: petSize,
    height: petSize,
    x: screenW - petSize - 50,
    y: screenH - petSize - 50,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Show window once content has loaded — prevents invisible blank window
  petWindow.once('ready-to-show', () => {
    console.log(`[PetWindow] Ready to show (petId: ${petId})`);
    petWindow?.show();
  });

  // Fallback: if ready-to-show doesn't fire within 8s, force show
  const showTimeout = setTimeout(() => {
    if (petWindow && !petWindow.isVisible()) {
      console.log('[PetWindow] Timeout — force showing window');
      petWindow.show();
    }
  }, 8000);

  petWindow.once('show', () => clearTimeout(showTimeout));

  // Log load failures
  petWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[PetWindow] Failed to load: ${errorCode} ${errorDescription} (${validatedURL})`);
  });

  petWindow.setVisibleOnAllWorkspaces(true);
  petWindow.setIgnoreMouseEvents(true, { forward: true });

  // Poll cursor position to toggle mouse events for dragging
  let petMouseInside = false;
  const pollInterval = setInterval(() => {
    if (!petWindow) { clearInterval(pollInterval); return; }
    const cursor = screen.getCursorScreenPoint();
    const bounds = petWindow.getBounds();
    const inside = cursor.x >= bounds.x && cursor.x <= bounds.x + bounds.width
      && cursor.y >= bounds.y && cursor.y <= bounds.y + bounds.height;
    if (inside && !petMouseInside) {
      petMouseInside = true;
      petWindow.setIgnoreMouseEvents(false);
    } else if (!inside && petMouseInside) {
      petMouseInside = false;
      petWindow.setIgnoreMouseEvents(true, { forward: true });
    }
  }, 50);

  // Zoom helper
  const zoomPet = (delta: number) => {
    if (!petWindow) return;
    const [w, h] = petWindow.getSize();
    // Don't zoom when panel is open
    if (h > w + 20) return;
    const newSize = Math.max(150, Math.min(800, w + delta));
    console.log(`[Zoom] ${w} -> ${newSize}`);
    petWindow.setSize(newSize, newSize);
    saveConfig({ width: newSize, height: newSize });
  };

  // Right-click context menu on pet window
  petWindow.webContents.on('context-menu', (e) => {
    e.preventDefault();
    const menu = Menu.buildFromTemplate([
      {
        label: '放大 ➕',
        click: () => zoomPet(40),
      },
      {
        label: '缩小 ➖',
        click: () => zoomPet(-40),
      },
      { type: 'separator' },
      {
        label: '重新上传照片',
        click: () => {
          if (petWindow) {
            petWindow.close();
            petWindow = null;
          }
          if (setupWindow) {
            setupWindow.close();
            setupWindow = null;
          }
          createSetupWindow(true);
        },
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => app.quit(),
      },
    ]);
    menu.popup();
  });

  // Disable default context menu in renderer + debug wheel events
  petWindow.webContents.on('did-finish-load', () => {
    petWindow?.webContents.executeJavaScript(
      `document.addEventListener('contextmenu', e => e.preventDefault());
       document.addEventListener('wheel', e => console.log('[wheel:injected]', e.deltaY), { passive: true });`
    );
  });

  // Handle zoom directly in main process via scroll-input-event
  // This is more reliable than injecting into the renderer
  petWindow.webContents.on('input-event', (_event, input) => {
    if (!petWindow) return;
    if ((input as any).type === 'mouseWheel') {
      const wheel = input as any;
      const [w, h] = petWindow.getSize();
      const panelOpen = h > w + 20;
      console.log(`[Zoom:main] mouseWheel deltaY=${wheel.deltaY} size=${w}x${h} panelOpen=${panelOpen}`);
      if (panelOpen) return;

      const deltaY = wheel.deltaY || 0;
      if (deltaY === 0) return;
      const delta = deltaY < 0 ? 20 : -20;
      const newSize = Math.max(150, Math.min(800, w + delta));
      petWindow.setSize(newSize, newSize);
      saveConfig({ width: newSize, height: newSize });
    }
  });

  petWindow.on('closed', () => {
    clearInterval(pollInterval);
    petWindow = null;
  });

  const DEFAULT_PET_ID = petId;
  if (REMOTE_BACKEND_URL) {
    petWindow.loadURL(`${REMOTE_BACKEND_URL}/?_t=${Date.now()}#/pet/${DEFAULT_PET_ID}`);
  } else if (isDev) {
    petWindow.loadURL(`http://localhost:5173/#/pet/${DEFAULT_PET_ID}`);
  } else {
    petWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
      hash: `/pet/${DEFAULT_PET_ID}`,
    });
  }

}

function createTray() {
  // Use macOS system tray title as fallback — always visible
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAA' +
    'AQCAYAAAAf8/9hAAAA6ElEQVQ4y62TzQ3CMBCE3yYF0AEdQAdQAnRA' +
    'CSkhJVACHcSXnIgUKIES6IASOAAXy4mN+JGQRlrZ3pn5vLsBfqkwxj' +
    'AzB+ccACAi4pyLmDn4OgEAaq0PzByJSPTgR0QCAJCZEwB7rfVRKWVz' +
    'AkBEIqVUCGAvImER8bXWp0dyU4JIKRUy814pdSIi+8qygYhkNnkAgJ' +
    'nj7JYNAM7MHGutT9kzM8iffs8kvu9vAIRE5Ja/8X3/KCIxAPSBWwDO' +
    'uaB5v1NKJV8BXsHNYiKCiPQAQEQSEQlzzypAcR+1UkowcwgAfSK6/A' +
    'N/AIKMcT1MT/ETAAAAAElFTkSuQmCC'
  );
  tray = new Tray(icon);
  // Set title text as visible label next to icon
  tray.setTitle('🐾');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '返回首页',
      click: () => {
        if (setupWindow) {
          setupWindow.show();
        } else {
          createSetupWindow();
        }
      },
    },
    {
      label: '显示/隐藏宠物',
      click: () => {
        if (petWindow) {
          if (petWindow.isVisible()) {
            petWindow.hide();
          } else {
            petWindow.show();
          }
        } else {
          createPetWindow();
        }
      },
    },
    {
      label: '更换形象',
      click: () => {
        if (petWindow) {
          petWindow.close();
          petWindow = null;
        }
        if (setupWindow) {
          setupWindow.close();
          setupWindow = null;
        }
        createSetupWindow(true);
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Desktop Pet');
  tray.setContextMenu(contextMenu);
}

// IPC handlers
ipcMain.on('set-ignore-mouse-events', (_event, ignore: boolean) => {
  if (petWindow) {
    petWindow.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

ipcMain.on('move-pet-window', (_event, dx: number, dy: number) => {
  if (petWindow) {
    const [x, y] = petWindow.getPosition();
    petWindow.setPosition(x + dx, y + dy);
  }
});

ipcMain.on('resize-pet-window', (_event, width: number, height: number) => {
  if (!petWindow) return;
  const w = Math.max(150, Math.min(800, Math.round(width)));
  const h = Math.max(150, Math.min(800, Math.round(height)));
  petWindow.setSize(w, h);
  saveConfig({ width: w, height: h });
});

ipcMain.on('zoom-pet', (_event, delta: number) => {
  if (!petWindow) return;
  const [w, h] = petWindow.getSize();
  if (h > w + 20) return; // panel open
  const newSize = Math.max(150, Math.min(800, w + delta));
  console.log(`[Zoom:IPC] ${w} -> ${newSize}`);
  petWindow.setSize(newSize, newSize);
  saveConfig({ width: newSize, height: newSize });
});

ipcMain.on('show-pet-window', (_event, petId?: string) => {
  console.log(`[IPC] show-pet-window called, petId=${petId}, petWindow exists=${!!petWindow}`);
  if (!petWindow) {
    createPetWindow(petId || 'default');
  } else {
    // If petId changed, reload with new pet
    if (petId) {
      const url = REMOTE_BACKEND_URL
        ? `${REMOTE_BACKEND_URL}/?_t=${Date.now()}#/pet/${petId}`
        : isDev
          ? `http://localhost:5173/#/pet/${petId}`
          : '';
      if (url) {
        petWindow.loadURL(url);
      }
    }
    petWindow.show();
  }
});

ipcMain.on('close-setup-window', () => {
  console.log('[IPC] close-setup-window called');
  setupWindow?.close();
});

ipcMain.on('show-setup-window', () => {
  console.log('[IPC] show-setup-window called');
  if (setupWindow) {
    setupWindow.show();
  } else {
    createSetupWindow();
  }
});

ipcMain.handle('get-backend-url', () => {
  return getBackendUrl();
});

// App lifecycle
app.whenReady().then(async () => {
  // Aggressively clear ALL caches to ensure latest remote assets
  const { session: ses } = require('electron');
  await ses.defaultSession.clearCache();
  await ses.defaultSession.clearStorageData({ storages: ['cachestorage', 'serviceworkers'] });
  // Also delete cache directories on disk
  const cachePath = path.join(app.getPath('userData'), 'Cache');
  const codeCachePath = path.join(app.getPath('userData'), 'Code Cache');
  const gpuCachePath = path.join(app.getPath('userData'), 'GPUCache');
  for (const p of [cachePath, codeCachePath, gpuCachePath]) {
    try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
  }

  await startBackend();

  // Wait a bit for backend to start
  setTimeout(async () => {
    createTray();
    // Always start with setup window (home/gallery page)
    // User can pick a pet or create a new one
    createSetupWindow();
  }, 2000);
});

app.on('window-all-closed', () => {
  // Keep running in tray
});

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
});
