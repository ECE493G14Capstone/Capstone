import { GameState } from "../GameState";
import Phaser from "phaser";
import { Tetromino, TetrominoLookahead } from "../Tetromino";
import { ScoreboardUI } from "../scene/ScoreboardUI";
import { SpectatorUI } from "../scene/SpectatorUI";
import { KeyThrottleManager } from "../KeyThrottleManager";

import { Socket } from "socket.io-client";

import { TILE_SCALE } from "common/shared";
import { ToClientEvents, ToServerEvents } from "common/messages/sceneGameArena";
import { ControlsUI } from "./ControlsUI";
import { ActiveEventsUI } from "./ActiveEventsUI";

import { TradeUI } from "./TradeUI";
import { TradeState } from "common/TradeState";

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

    scoreboard!: ScoreboardUI;

    trade!: TradeUI;
    spectator?: SpectatorUI;
    keyThrottleManager?: KeyThrottleManager;

    frameTimeElapsed: number = 0; // the ms time since the last frame is drawn

    constructor() {
        super("SceneGameArena");
    }

    preload() {
        this.load.image("arena-border", "assets/arena-border.png");
        this.load.image("container-controls", "assets/container-controls.png");
        this.load.image("container-voting", "assets/container-voting.png");
        this.load.image(
            "container-trade-controls",
            "assets/container-trade-controls.png"
        );

        this.load.bitmapFont(
            "brawl",
            "assets/barcade-brawl.png",
            "assets/barcade-brawl.xml"
        );

        this.load.spritesheet("monomino", "assets/monomino.png", {
            frameWidth: 8,
            frameHeight: 8,
        });

        this.load.image("key-shift", "assets/key-shift.png");
        this.load.spritesheet("key", "assets/keys.png", {
            frameWidth: 13,
            frameHeight: 13,
        });
    }

    init(data: SceneDataGameArena) {
        this.gameState = data.gameState;
        this.socket = this.gameState.socket;
    }

    create() {
        this.add
            .image(0, 0, "arena-border")
            .setOrigin(0, 0)
            .setScale(TILE_SCALE);

        this.trade = new TradeUI(this, this.gameState.playerId);
        this.scoreboard = new ScoreboardUI(this, this.socket);
        new ActiveEventsUI(this, this.socket);
        if (this.gameState.playerId != null) {
            new ControlsUI(this);
            this.initControls();
        } else {
            this.spectator = new SpectatorUI(this, this.socket);
        }

        // Initialize the fall rate to 1000 until we get confirmation from the server.
        this.updateFallTimer(1000);
        this.socket.emit("requestFallRate");

        this.initListeners();
        // Initial board drawing
        this.gameState.board.forEach((row) =>
            row.forEach((monomino) => {
                if (monomino) {
                    monomino.draw(this);
                }
            })
        );
    }

    private initControls() {
        this.input.keyboard.removeAllKeys();
        this.keyThrottleManager = new KeyThrottleManager(this);
        this.keys = this.input.keyboard.addKeys(
            "w,up,a,left,s,down,d,right,q,z,e,x,shift",
            undefined,
            true
        );
        const { a, left, d, right, s, down, q, z, x, shift, e } = this.keys;

        const executeMove = (
            movement: (tetro: Tetromino) => TetrominoLookahead
        ) => {
            if (this.gameState.isInOppositeSection()) {
                return null;
            }
            const moved = this.gameState.moveIfCan(movement);
            if (moved) {
                this.gameState.emitPlayerMove();
            }

            return moved;
        };

        this.keyThrottleManager.register([a, left], "left", () => {
            executeMove(Tetromino.slide(-1));
        });

        this.keyThrottleManager.register([d, right], "right", () => {
            executeMove(Tetromino.slide(1));
        });

        this.keyThrottleManager.register([s, down], "down", () => {
            this.gameState.updateFalling();
        });

        this.keyThrottleManager.register([q, z], "rotateCCW", () => {
            executeMove(Tetromino.rotateCCW);
        });

        this.keyThrottleManager.register([e, x], "rotateCW", () => {
            executeMove(Tetromino.rotateCW);
        });

        this.keyThrottleManager.register([shift], "trade", () => {
            if (
                this.gameState.currentTetromino.isTraded ||
                this.gameState.tradeState == TradeState.Offered ||
                this.gameState.tradeState == TradeState.Accepted
            ) {
                return;
            }

            if (this.gameState.tradeState == TradeState.NoTrade) {
                this.gameState.tradeState = TradeState.Offered;
                this.gameState.tradeTetrominoType =
                    this.gameState.currentTetromino.getType();
            } else if (this.gameState.tradeState == TradeState.Pending) {
                this.gameState.tradeState = TradeState.Accepted;
            }

            // UI updated on next update cycle
            this.gameState.emitTrade();
        });
    }

    private initListeners() {
        // Clean out any old listeners to avoid accumulation.
        this.socket.removeListener("toSceneGameOver");
        this.socket.removeListener("updateFallRate");
        this.socket.removeListener("initPlayer");
        this.socket.removeListener("updateBoard");

        this.socket.on("initPlayer", (playerId) => {
            this.trade.addControls(playerId);
            new ControlsUI(this);
            this.spectator?.destroy();
            this.spectator = undefined;
            this.gameState.initializePlayer(playerId);
            this.initControls();
        });

        this.socket.on("updateFallRate", (fallRate) => {
            this.updateFallTimer(fallRate);
        });

        this.socket.on("toSceneGameOver", (playerPoints) => {
            this.scene.start("SceneGameOver", {
                gameState: this.gameState,
                playerPoints: playerPoints,
            });
        });

        this.socket.on("updateBoard", (boardState: any) => {
            this.gameState.fromBoardState(boardState);
        });

        // request to sync with other players
        this.socket.emit("requestBoard");
    }

    update(time: number, delta: number) {
        this.frameTimeElapsed += delta;
        // 12 fps
        if (this.frameTimeElapsed > 1000 / this.FRAMERATE) {
            this.updateDrawPlayers();
            this.updateDrawBoard();
            this.updateTradeUI();
            // start next frame
            this.frameTimeElapsed = 0;
        }
    }

    private updateDrawBoard() {
        this.gameState.board.forEach((row) =>
            row.forEach((monomino) => {
                if (monomino) {
                    monomino.draw(this);
                }
            })
        );
    }

    private updateFallTimer(interval: number) {
        if (this.fallRateTimer) {
            this.time.removeEvent(this.fallRateTimer);
        }

        this.fallRateTimer = this.time.addEvent({
            delay: interval,
            callback: () => this.gameState.updateFalling(),
            loop: true,
        });
    }

    private updateDrawPlayers() {
        if (this.gameState.playerId != null)
            this.gameState.currentTetromino.draw(this);
        this.gameState.otherTetrominoes.forEach((tetromino) =>
            tetromino.draw(this)
        );
    }

    private updateTradeUI() {
        this.trade.update(
            this.gameState.tradeState,
            !this.gameState.currentTetromino?.isTraded || false,
            this.gameState.tradeTetrominoType,
            this.gameState.tradingPlayerId
        );
    }
}
