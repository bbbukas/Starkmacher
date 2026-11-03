/// <reference types="vite/client" />
import type { StarkmacherApi } from '@shared/api';

declare global {
  interface Window {
    /** Gibt es nur im Programm (src/preload). */
    starkmacher?: StarkmacherApi;
  }
}
