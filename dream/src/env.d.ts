/// <reference types="vite/client" />

import type { DreamAPI } from '../electron/preload/index'

declare global {
  interface Window {
    dreamAPI: DreamAPI
  }
}
