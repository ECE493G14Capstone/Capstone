import { GameState } from "../GameState";
import Phaser, { GameObjects } from "phaser";
import { RenderedTetromino } from "../RenderedTetromino";
import { BOARD_SIZE } from "common/shared";
import { cloneDeep } from "lodash";
import { TetrominoType } from "common/TetrominoType";
import { Tetromino } from "../Tetromino";
import { ScoreboardUI } from "../scene/ScoreboardUI";
import { SpectatorUI } from "../scene/SpectatorUI";
import { SharedState } from "..";
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
import LeaderboardFrame from "../assets/LeaderboardFrame.svg";

type SocketGame = Socket<ToClientEvents, ToServerEvents>;

export class SceneGameArena extends Phaser.Scene {
    FRAMERATE: number = 12;

    keys!: any; // Phaser doesn't provide nice typing for keyboard.addKeys
    sharedState!: SharedState;
    gameState!: GameState;
    socket!: SocketGame;

    currentTetro!: RenderedTetromino;
    otherTetros!: Array<RenderedTetromino>;
    renderedBoard!: Array<Array<GameObjects.Rectangle | null>>;

    scoreboard!: ScoreboardUI;
    spectator!: SpectatorUI;
    controls!: ControlsUI;

    frameTimeElapsed: number = 0; // the ms time since the last frame is drawn

    constructor() {
        super({
            key: "SceneGameArena",
        });
    }

    preload() {
        this.load.addFile(new WebFontFile(this.load, "VT323"));

        this.load.svg("keyA", KEY_A);
        this.load.svg("keyD", KEY_D);
        this.load.svg("keyS", KEY_S);
        this.load.svg("keyE", KEY_E);
        this.load.svg("keyQ", KEY_Q);
        this.load.svg("leaderboardFrame", LeaderboardFrame);
    }

    init(data: SharedState) {
        this.sharedState = data;
        this.gameState = data.gameState;
        this.socket = data.socket;
    }

    create() {
        this.scoreboard = new ScoreboardUI(this, this.sharedState.socket, true);
        this.spectator = new SpectatorUI(this, this.sharedState.socket);

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
                new RenderedTetromino(this.gameState.otherPieces[i])
            );
        }

        // 1s interval falling rate, TODO put inside update()?
        this.time.addEvent({
            delay: 1000,
            callback: () => this.updateFalling(this),
            loop: true,
        });

        this.socket.on("toSceneGameOver", (playerPoints) => {
            this.scene.start("SceneGameOver", {
                ...this.sharedState,
                playerPoints: playerPoints,
                gameState: this.gameState,
            });
        });
    }

    update(time: number, delta: number) {
        this.frameTimeElapsed += delta;

        // FIXME: Is this still needed after a proper queue is implemented? We can call the startGameArena event after
        // the player has received their playerID & guarantee the scene has that data.
        // Load in the controlsUI for players. Placed here due to a potential time delay for receiving the playerID.
        if (this.controls == null && this.gameState.playerId != null) {
            this.controls = new ControlsUI(this, [
                "keyA",
                "keyD",
                "keyS",
                "keyQ",
                "keyE",
            ]);
        }

        // 12 fps
        if (this.frameTimeElapsed > 1000 / this.FRAMERATE) {
            this.updateBoardFromFrozen(this);
            this.updateUserInput(this);
            this.updateDrawBoard(this.gameState, this);
            this.updateDrawPlayer(this);

            // start next frame
            this.frameTimeElapsed = 0;
        }
    }

    // the frozen board is all blocks that are placed. the board contains dynamic player blocks.
    // this function sync the board with frozenboard, and add players on top
    private updateBoardFromFrozen(scene: SceneGameArena) {
        scene.gameState.board = cloneDeep(scene.gameState.frozenBoard);
        for (let i = 0; i < 3; i++) {
            const tetro = scene.otherTetros[i].inner;
            for (const tile of tetro.tiles) {
                const row = tile[0] + tetro.position[0];
                const col = tile[1] + tetro.position[1];
                scene.gameState.board[row][col] = tetro.type;
            }
        }
    }

    // TODO
    // 1. these update functions can have unified interface
    // 2. they have duplicate logic with the Phaser.Scene.time.addEvent, consider moving the falling down here, but we need a internal state/class instance for each of them to track time delta in order to have a different function
    private updateUserInput(scene: SceneGameArena) {
        let moved = false;
        if (scene.keys.a.isDown || scene.keys.left.isDown) {
            moved = scene.gameState.currentTetromino.move(-1);
        } else if (scene.keys.d.isDown || scene.keys.right.isDown) {
            moved = scene.gameState.currentTetromino.move(1);
        } else if (scene.keys.q.isDown || scene.keys.z.isDown) {
            moved = scene.gameState.currentTetromino.rotateCCW();
        } else if (scene.keys.e.isDown || scene.keys.x.isDown) {
            moved = scene.gameState.currentTetromino.rotateCW();
        }

        if (moved) {
            scene.gameState.socket.emit(
                "playerMove",
                scene.gameState.playerId,
                scene.gameState.currentTetromino.reportPosition()
            );
        }
    }

    private updateDrawBoard(state: GameState, scene: SceneGameArena) {
        // re-render the board
        const board = state.board;
        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                scene.renderedBoard[row][col]?.destroy();
                if (board[row][col]) {
                    const x = (col + 0.5) * TILE_SIZE;
                    const y = (row + 0.5) * TILE_SIZE;
                    scene.renderedBoard[row][col] = scene.add.rectangle(
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

    private updateDrawPlayer(scene: SceneGameArena) {
        scene.currentTetro.draw(scene);
    }

    private updateFalling(scene: SceneGameArena) {
        // fall the tetromino
        // if (can fall)
        //    fall
        // else
        //    TODO place on board

        // NOTE: other players' tetrominoes are treated as static blocks, although they are synced shortly before this function

        const state = scene.gameState;
        const board = state.board;
        const tetro = state.currentTetromino;

        if (this.canTetroFall(tetro, board)) {
            tetro.position[0] += 1;

            scene.gameState.socket.emit(
                "playerMove",
                scene.gameState.playerId,
                scene.gameState.currentTetromino.reportPosition()
            );
        } else {
            console.log(tetro, "cannot fall!");
            // TODO place on state.board and emit events to the server
        }
    }

    private canTetroFall(
        tetro: Tetromino,
        board: Array<Array<TetrominoType | null>>
    ): boolean {
        // if the blocks right below this tetro are all empty, it can fall.
        const bottomRelative = Math.max(...tetro.tiles.map((tile) => tile[0])); // the lowest block in the tetro tiles, ranging from 0-3
        const bottomAbsolute = tetro.position[0] + bottomRelative; // the row of which the lowest block of the tetro is at in the board

        if (bottomAbsolute + 1 >= board.length) return false;

        return tetro.tiles.every(
            (tile: any) =>
                tile[0] < bottomRelative || // either the tile is not the bottom tiles which we don't care
                board[bottomAbsolute + 1][tetro.position[1] + tile[1]] == null // or the room below it has to be empty
        );
    }
}
