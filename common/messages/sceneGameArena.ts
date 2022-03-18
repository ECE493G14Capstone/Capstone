import { ColoredScore } from "../shared";

export interface ToClientEvents {
    toSceneGameOver: (data: Array<ColoredScore>) => void;
    updateFallRate: (fallRate: number) => void;
}

export interface ToServerEvents {
    requestFallRate: () => void;
}
