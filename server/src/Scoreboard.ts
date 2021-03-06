import { PlayerColor } from "common/PlayerAttributes";
import { PlayerID } from "common/message";
import { Level } from "./Level";
import { broadcast } from "./broadcast";

import { ToServerEvents, ToClientEvents } from "common/messages/scoreboard";
import { ColoredScore } from "common/shared";
import { Socket } from "socket.io";

type SocketScoreboard = Socket<ToServerEvents, ToClientEvents>;

export class Scoreboard {
    private _accumulatedScore: number;
    private scoreMap!: Array<ColoredScore>;
    private _finalScores: Array<ColoredScore>;
    private broadcastUpdateScoreboard: broadcast["updateScoreboard"];

    constructor(updateScoreboardEvent: broadcast["updateScoreboard"]) {
        this._accumulatedScore = 0;
        this.broadcastUpdateScoreboard = updateScoreboardEvent;
        this._finalScores = [];
        this.newScoreMap();
    }

    public initSocketListeners(socket: SocketScoreboard, level: Level) {
        socket.on("requestScoreboardData", () => {
            const clonedData = Object.assign([], this.scoreMap);
            clonedData.push({
                color: "level",
                points: level.currentLevel,
            });

            socket.emit("updateScoreboard", clonedData);
        });
    }

    get orangeScore(): number {
        return this.scoreMap[PlayerColor.Orange].points;
    }

    get greenScore(): number {
        return this.scoreMap[PlayerColor.Green].points;
    }

    get pinkScore(): number {
        return this.scoreMap[PlayerColor.Pink].points;
    }

    get blueScore(): number {
        return this.scoreMap[PlayerColor.Blue].points;
    }

    get currentTeamScore(): number {
        return (
            this.orangeScore + this.greenScore + this.pinkScore + this.blueScore
        );
    }

    get finalScores(): Array<ColoredScore> {
        return this._finalScores;
    }

    get accumulatedScore(): number {
        return this._accumulatedScore;
    }

    /**
     * Reset the scoremap & ensure proper ordering of the player->sore. i.e., scoremap[0].points belongs to player orange.
     */
    private newScoreMap() {
        this.scoreMap = [];
        this.scoreMap.push({
            color: "orange",
            points: 0,
        });

        this.scoreMap.push({
            color: "green",
            points: 0,
        });

        this.scoreMap.push({
            color: "pink",
            points: 0,
        });

        this.scoreMap.push({
            color: "blue",
            points: 0,
        });
    }

    /**
     * Reset all scores.
     */
    public resetScores() {
        this.newScoreMap();
        this._accumulatedScore = 0;
        this._finalScores = [];
    }

    /**
     * Increment the score of a given player.
     * @param playerIndex The player index number (representing a color).
     * @param value The amount to award the player.
     * @param level The level object. Used to *possibly* increase the level of the game.
     */
    public incrementScore(playerIndex: PlayerID, value: number, level: Level) {
        this._accumulatedScore += value;

        this.scoreMap[playerIndex].points += value;

        // Reset the score if the level was incremented.
        if (level.checkUpdateLevel(this._accumulatedScore)) {
            this._accumulatedScore = 0;
        }

        this.updateScoreboardUI(level.currentLevel);
    }

    /**
     * Decrease the score of a given player.
     * @param playerIndex The player index number (representing a color).
     * @param value The value to decrememnt the score by.
     * @param currentLevel The current level of the game.
     */
    public decrementScore(
        playerIndex: PlayerID,
        value: number,
        currentLevel: number
    ) {
        this.scoreMap[playerIndex].points -= value;
        if (this.scoreMap[playerIndex].points <= 0) {
            this.scoreMap[playerIndex].points = 0;
        }

        this.updateScoreboardUI(currentLevel);
    }

    /**
     * Notifies the client of the updated scoreboard.
     */
    public updateScoreboardUI(currentLevel: number) {
        // Temporary clone of the data so that we can append the level of the game.
        const clonedData = Object.assign([], this.scoreMap);
        clonedData.push({
            color: "level",
            points: currentLevel,
        });

        // Notify all connected users.
        this.broadcastUpdateScoreboard(clonedData);
    }

    /**
     * Get the final player scores.
     * @returns The final scores of the players.
     */
    public getFinalScores() {
        // Sort in descending order.
        this.scoreMap.sort((a, b) => {
            return b.points - a.points;
        });

        this._finalScores = Object.assign([], this.scoreMap);
        this._finalScores.push({
            color: "total",
            points: this.currentTeamScore,
        });

        return this._finalScores;
    }
}
