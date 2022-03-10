import Phaser from "phaser";
import { Socket } from "socket.io-client";
import { GameState } from "../GameState";
import { ScoreboardUI } from "./ScoreboardUI";

import { ToClientEvents, ToServerEvents } from "common/messages/sceneGameOver";
import { ColoredScore } from "common/shared";
import { resetSharedStates } from "../sharedStates";

type SocketGameOver = Socket<ToClientEvents, ToServerEvents>;

interface SceneDataGameOver {
    playerPoints: Array<ColoredScore>;
}

export class SceneGameOver extends Phaser.Scene {
    private playerData!: Array<ColoredScore>;
    private scoreboard!: ScoreboardUI;
    private gameState!: GameState;
    private socket!: SocketGameOver;

    constructor() {
        super("SceneGameOver");
    }

    init(data: SceneDataGameOver) {
        this.playerData = data.playerPoints;
    }

    create() {
        // Add in the updated UI.
        this.scoreboard = new ScoreboardUI(this, this.socket);
        this.scoreboard.createFullscreenScoreboard(this.playerData);

        // Clean out any old listeners to avoid accumulation.
        this.socket.removeListener("toSceneWaitingRoom");

        this.socket.on("toSceneWaitingRoom", () => {
            resetSharedStates();
            this.scene.start("SceneWaitingRoom");
        });
    }
}
