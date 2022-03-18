import { GameState } from "../GameState";
import Phaser, { GameObjects } from "phaser";
import { RenderedTetromino } from "../RenderedTetromino";
import { BOARD_SIZE } from "common/shared";
import { TetrominoType } from "common/TetrominoType";
import { Tetromino } from "../Tetromino";
import { ScoreboardUI } from "../scene/ScoreboardUI";
import { SpectatorUI } from "../scene/SpectatorUI";
import { WebFontFile } from "../plugins/WebFontFile";

import { Socket } from "socket.io-client";

import { ToClientEvents, ToServerEvents } from "common/messages/sceneGameArena";
import { TILE_SIZE } from "common/shared";
import { ControlsUI } from "./ControlsUI";

import KEY_A from "../assets/controls/KEY_A.svg";
import KEY_D from "../assets/controls/KEY_D.svg";
import KEY_S from "../assets/controls/KEY_S.svg";
import KEY_Q from "../assets/controls/KEY_Q.svg";
import KEY_E from "../assets/controls/KEY_E.svg";

type SocketGame = Socket<ToClientEvents, ToServerEvents>;

interface SceneDataGameArena {
    gameState: GameState;
}

export class SceneGameArena extends Phaser.Scene {
    FRAMERATE: number = 12;

    /* eslint-disable @typescript-eslint/no-explicit-any */
    keys!: any; // Phaser doesn't provide nice typing for keyboard.addKeys
    gameState!: GameState;
    socket!: SocketGame;
    fallRateTimer!: Phaser.Time.TimerEvent | null;

    currentTetro!: RenderedTetromino;
    otherTetros!: Array<RenderedTetromino>;
    renderedBoard!: Array<Array<GameObjects.Rectangle | null>>;

    scoreboard!: ScoreboardUI;
    spectator!: SpectatorUI;
    controls!: ControlsUI | null;

    frameTimeElapsed: number = 0; // the ms time since the last frame is drawn

    constructor() {
        super("SceneGameArena");
    }

    preload() {
        this.load.addFile(new WebFontFile(this.load, "VT323"));

        this.load.svg("keyA", KEY_A);
        this.load.svg("keyD", KEY_D);
        this.load.svg("keyS", KEY_S);
        this.load.svg("keyE", KEY_E);
        this.load.svg("keyQ", KEY_Q);
    }

    init(data: SceneDataGameArena) {
        this.gameState = data.gameState;
        this.socket = this.gameState.socket;
    }

    create() {
        this.scoreboard = new ScoreboardUI(this, this.socket, true);
        this.spectator = new SpectatorUI(this, this.socket);
        // NOTE: need to make sure playerId is valid when this scene is started
        this.controls = new ControlsUI(this, [
            "keyA",
            "keyD",
            "keyS",
            "keyQ",
            "keyE",
        ]);

        // Initialize the fall rate to 1000 until we get confirmation from the server.
        this.updateFallTimer(1000);

        // initialize an empty rendered board
        this.renderedBoard = [];
        for (let row = 0; row < BOARD_SIZE; row++) {
            const r = [];
            for (let col = 0; col < BOARD_SIZE; col++) {
                r.push(null);
            }
            this.renderedBoard.push(r);
        }

        // keyboard input
        this.keys = this.input.keyboard.addKeys(
            "w,up,a,left,s,down,d,right,q,z,e,x"
        );

        // falling, controllable tetromino
        this.currentTetro = new RenderedTetromino(
            this.gameState.currentTetromino
        );
        this.otherTetros = [];
        for (let i = 0; i < 3; i++) {
            this.otherTetros.push(
                new RenderedTetromino(this.gameState.otherTetrominoes[i])
            );
        }

        this.socket.emit("requestFallRate");

        this.initListeners();
    }

    private initListeners() {
        // Clean out any old listeners to avoid accumulation.
        this.socket.removeListener("toSceneGameOver");
        this.socket.removeListener("updateFallRate");

        this.socket.on("updateFallRate", (fallRate) => {
            this.updateFallTimer(fallRate);
        });

        this.socket.on("toSceneGameOver", (playerPoints) => {
            this.scene.start("SceneGameOver", {
                gameState: this.gameState,
                playerPoints: playerPoints,
            });
        });
    }

    update(time: number, delta: number) {
        this.frameTimeElapsed += delta;

        // 12 fps
        if (this.frameTimeElapsed > 1000 / this.FRAMERATE) {
            this.updateUserInput();
            this.updateDrawBoard();
            this.updateDrawPlayers();

            // start next frame
            this.frameTimeElapsed = 0;
        }
    }

    private updateFallTimer(interval: number) {
        if (this.fallRateTimer) {
            this.time.removeEvent(this.fallRateTimer);
        }

        this.fallRateTimer = this.time.addEvent({
            delay: interval,
            callback: () => this.updateFalling(),
            loop: true,
        });
    }

    private updateUserInput() {
        let moved = false;
        if (this.keys.a.isDown || this.keys.left.isDown) {
            moved = this.gameState.moveIfCan(
                Tetromino.slide(-1) // left
            );
        } else if (this.keys.d.isDown || this.keys.right.isDown) {
            moved = this.gameState.moveIfCan(
                Tetromino.slide(1) // right
            );
        } else if (this.keys.q.isDown || this.keys.z.isDown) {
            moved = this.gameState.moveIfCan(
                Tetromino.rotateCCW // counter clock wise
            );
        } else if (this.keys.e.isDown || this.keys.x.isDown) {
            moved = this.gameState.moveIfCan(
                Tetromino.rotateCW // clock wise
            );
        }

        if (moved) {
            this.gameState.emitPlayerMove();
        }
    }

    private updateDrawBoard() {
        // re-render the board
        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                this.renderedBoard[row][col]?.destroy();
                if (this.gameState.board[row][col]) {
                    const x = (col + 0.5) * TILE_SIZE;
                    const y = (row + 0.5) * TILE_SIZE;
                    this.renderedBoard[row][col] = this.add.rectangle(
                        x,
                        y,
                        TILE_SIZE,
                        TILE_SIZE,
                        0xffee00
                    );
                }
            }
        }
    }

    private updateDrawPlayers() {
        this.currentTetro.draw(this);
        for (const tetromino of this.otherTetros) {
            tetromino.draw(this);
        }
    }

    private updateFalling() {
        if (this.gameState.moveIfCan(Tetromino.fall)) {
            this.gameState.emitPlayerMove();
        } else {
            this.gameState.emitAndPlaceCurrentTetromino();
            this.currentTetro = new RenderedTetromino(
                this.gameState.currentTetromino
            );
        }
    }
}
