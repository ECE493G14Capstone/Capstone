import { SceneGameArena } from "./SceneGameArena";
import { BOARD_SIZE } from "common/shared";
import { SceneGameOver } from "./SceneGameOver";
import { TextConfig } from "../TextConfig";

import { Socket } from "socket.io-client";
import { ToServerEvents, ToClientEvents } from "common/messages/scoreboard";
import { ColoredScore } from "common/shared";
import { TILE_SIZE } from "common/shared";

type SocketScoreboard = Socket<ToClientEvents, ToServerEvents>;

export class ScoreboardUI {
    private scene: SceneGameArena | SceneGameOver;
    private listOfScores: Array<Phaser.GameObjects.Text>;
    private regularTextConfig: TextConfig;
    private socket: SocketScoreboard;

    constructor(
        SceneGameArena: SceneGameArena | SceneGameOver,
        socket: SocketScoreboard,
        shouldLoadScoreboard = false
    ) {
        this.scene = SceneGameArena;
        this.listOfScores = [];
        this.socket = socket;
        this.initListeners();

        this.regularTextConfig = {
            fontSize: `${BOARD_SIZE / 2}px`,
            fontFamily: "VT323",
        };

        if (shouldLoadScoreboard) {
            this.loadScoreboard();
        }

        this.requestScoreboardData();
    }

    /**
     * Request scoreboard data from the server.
     */
    private requestScoreboardData() {
        this.socket.emit("requestScoreboardData");
    }

    /**
     * Initialize listeners
     */
    private initListeners() {
        if (this.socket == null) {
            return;
        }

        this.socket.on("updateScoreboard", (scores) => {
            this.updateScoreboard(scores);
        });
    }

    /**
     * Load in the scoreboard.
     */
    public loadScoreboard() {
        this.scene.add.image(
            BOARD_SIZE * 16.5,
            BOARD_SIZE * 3,
            "leaderboardFrame"
        );

        // Add in the individual player scores (initially 0).
        const y: number = BOARD_SIZE * 1.5;
        this.listOfScores[0] = this.scene.add
            .text(
                14 * BOARD_SIZE + 50,
                y,
                "Orange".padEnd(11) + "0",
                this.regularTextConfig
            )
            .setTint(0xffa500);

        this.listOfScores[1] = this.scene.add
            .text(
                14 * BOARD_SIZE + 50,
                y + 30,
                "Green".padEnd(11) + "0",
                this.regularTextConfig
            )
            .setTint(0x00ff00);

        this.listOfScores[2] = this.scene.add
            .text(
                14 * BOARD_SIZE + 50,
                y + 60,
                "Pink".padEnd(11) + "0",
                this.regularTextConfig
            )
            .setTint(0xff00ff);

        this.listOfScores[3] = this.scene.add
            .text(
                14 * BOARD_SIZE + 50,
                y + 90,
                "Blue".padEnd(11) + "0",
                this.regularTextConfig
            )
            .setTint(0x00bfff);

        this.listOfScores[4] = this.scene.add
            .text(
                14 * BOARD_SIZE + 50,
                y + 120,
                "Level".padEnd(11) + "1",
                this.regularTextConfig
            )
            .setTint(0xffffff);
    }

    /**
     * Update the mini scoreboard found on the main game arena.
     * @param playerPts The array of objects containing player data (name + points + hex-color).
     */
    public updateScoreboard(playerPts: Array<ColoredScore>) {
        for (let i = 0; i < playerPts.length; i++) {
            const text =
                `${playerPts[i].color}`.padEnd(11) + `${playerPts[i].points}`;
            this.listOfScores[i].setText(text).setTint(playerPts[i].hex);
        }
    }

    /**
     * Create a fullscreen scoreboard for the game over scene.
     * @param TILE_SIZE The block size defined in the game arena.
     * @param playerData The array of objects containing player data (name + points + hex-color).
     */
    public createFullscreenScoreboard(playerData: Array<ColoredScore>) {
        this.scene.add
            .text(
                (BOARD_SIZE * TILE_SIZE) / 4,
                (BOARD_SIZE * TILE_SIZE) / 4,
                "Game Over!",
                { fontSize: "82px", fontFamily: "VT323" }
            )
            .setTint(0xff0000);

        let y: number = 12 * TILE_SIZE;
        for (const element of playerData) {
            y += 50;
            const text = `${element.color}`.padEnd(20) + `${element.points}`;
            this.scene.add
                .text(11 * TILE_SIZE, y, text, {
                    fontSize: "32px",
                    fontFamily: "VT323",
                })
                .setTint(element.hex);
        }

        this.scene.add
            .text(5 * TILE_SIZE, y + 70, "New game starting in 30 seconds", {
                fontSize: "42px",
                fontFamily: "VT323",
            })
            .setTint(0xff0000);
    }
}
