import { GameState } from "../GameState";
import Phaser, { GameObjects } from "phaser";
import { RenderedTetromino } from "../RenderedTetromino";
import { BOARD_SIZE } from "common/shared";
import { cloneDeep } from "lodash";
import { TetrominoType } from "common/TetrominoType";
import { Tetromino } from "../Tetromino";
import { ScoreboardUI } from "../scene/ScoreboardUI";
import { SpectatorUI } from "../scene/SpectatorUI";
import { WebFontFile } from "../plugins/WebFontFile";
import { gameState, socket } from "../sharedStates";

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

    keys!: any; // Phaser doesn't provide nice typing for keyboard.addKeys
    gameState!: GameState;
    socket!: SocketGame;

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

    create() {
        // import shared states
        this.gameState = gameState;
        this.socket = socket;

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

        this.initListeners();
    }

    private initListeners() {
        // Clean out any old listeners to avoid accumulation.
        this.socket.removeListener("toSceneGameOver");

        this.socket.on("toSceneGameOver", (playerPoints) => {
            this.scene.start("SceneGameOver", {
                playerPoints: playerPoints,
            });
        });
    }

    update(time: number, delta: number) {
        this.frameTimeElapsed += delta;

        // 12 fps
        if (this.frameTimeElapsed > 1000 / this.FRAMERATE) {
            this.updateBoardFromFrozen(this, this.gameState.otherPieces);
            this.updateUserInput(this);
            this.updateDrawBoard(this.gameState, this);
            this.updateDrawPlayer(this);

            // start next frame
            this.frameTimeElapsed = 0;
        }
    }

    // the frozen board is all blocks that are placed. the board contains dynamic player blocks.
    // this function sync the board with frozenboard, and add players on top
    private updateBoardFromFrozen(
        scene: SceneGameArena,
        otherTetros: Array<Tetromino>
    ) {
        scene.gameState.board = cloneDeep(scene.gameState.frozenBoard);
        for (let i = 0; i < 3; i++) {
            const tetro = otherTetros[i];

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
            moved = scene.gameState.currentTetromino.moveIfCan(
                scene.gameState.board,
                (tetro) => {
                    tetro.position[1] -= 1;
                }
            );
        } else if (scene.keys.d.isDown || scene.keys.right.isDown) {
            moved = scene.gameState.currentTetromino.moveIfCan(
                scene.gameState.board,
                (tetro) => {
                    tetro.position[1] += 1;
                }
            );
        } else if (scene.keys.q.isDown || scene.keys.z.isDown) {
            moved = scene.gameState.currentTetromino.moveIfCan(
                scene.gameState.board,
                (tetro) => {
                    tetro.rotateCCW();
                }
            );
        } else if (scene.keys.e.isDown || scene.keys.x.isDown) {
            moved = scene.gameState.currentTetromino.moveIfCan(
                scene.gameState.board,
                (tetro) => {
                    tetro.rotateCW();
                }
            );
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
        // NOTE: other players' tetrominoes are treated as static blocks, although they are synced shortly before this function

        const state = scene.gameState;
        const board = state.board;
        const tetro = state.currentTetromino;

        if (
            tetro.moveIfCan(board, (tetro) => {
                tetro.position[0] += 1;
                if (tetro.position[0] > BOARD_SIZE) {
                    tetro.position[0] = 0;
                }
                return tetro;
            })
        ) {
            scene.gameState.socket.emit(
                "playerMove",
                scene.gameState.playerId,
                scene.gameState.currentTetromino.reportPosition()
            );
        } else {
            // place on state.board and emit events to the server
            scene.gameState.socket.emit(
                "playerPlace",
                scene.gameState.playerId,
                scene.gameState.currentTetromino.reportPosition()
            );

            // convert the tetromino to static blocks
            scene.gameState.currentTetromino.tiles.forEach((tile) => {
                const [row, col] = [
                    scene.gameState.currentTetromino.position[0] + tile[0],
                    scene.gameState.currentTetromino.position[1] + tile[1],
                ];
                scene.gameState.frozenBoard[row][col] =
                    scene.gameState.currentTetromino.type;
            });
            // start a new tetromino from the top
            scene.gameState.currentTetromino = new Tetromino(TetrominoType.T);
            this.currentTetro = new RenderedTetromino(
                scene.gameState.currentTetromino
            );
        }
    }
}
