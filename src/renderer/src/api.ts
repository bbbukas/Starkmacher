import type { StarkmacherApi } from '@shared/api';

/** Die Brücke zum Hauptprozess (src/preload). */
export const api = (typeof window === 'undefined' ? {} : window.starkmacher) as StarkmacherApi;
