import { io } from "socket.io-client";
import { GameState } from "./GameState";

// states that are shared across scenes as singletons
export const socket = io(
    (import.meta.env.PROD && window.location.origin) ||
        import.meta.env.VITE_BACKEND_URL ||
        "http://localhost:3001/"
);
export let gameState = new GameState(socket);

export function resetSharedStates() {
    socket.removeAllListeners();
    gameState = new GameState(socket);
}
