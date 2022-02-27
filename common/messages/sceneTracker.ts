import { ColoredScore } from "../shared";

export interface ToClientEvents {
    toSceneWaitingRoom: () => void;
    toSceneGameArena: () => void;
    toSceneGameOver: (data: Array<ColoredScore>) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ToServerEvents {}
