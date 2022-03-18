import { ColoredScore } from "common/shared";

export interface broadcast {
    updateScoreboard(msg: Array<ColoredScore>): void;
    toSceneWaitingRoom(): void;
    toSceneGameArena(): void;
    toSceneGameOver(msg: Array<ColoredScore>): void;
    showVotingSequence(votingSequence: string): void;
    hideVotingSequence(): void;
    remainingPlayers(playersNeeded: number): void;
    fallRate(fallRate: number): void;
}
