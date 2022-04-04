/// <reference types="vite/client" />

// https://vitejs.dev/guide/env-and-mode.html#intellisense-for-typescript
interface ImportMetaEnv {
    readonly VITE_BACKEND_URL: string;
    readonly VITE_DISABLE_WAITING_ROOM: boolean;
    readonly VITE_DEBUG_ENABLE_FRAMEDRAWING: boolean;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
