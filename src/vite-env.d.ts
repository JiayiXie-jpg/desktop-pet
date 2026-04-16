/// <reference types="vite/client" />

interface ElectronAPI {
  setIgnoreMouseEvents: (ignore: boolean) => void;
  showPetWindow: () => void;
  closeSetupWindow: () => void;
  getBackendUrl: () => Promise<string>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
