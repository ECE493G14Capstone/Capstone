import Phaser from "phaser";
import { BOARD_SIZE } from "common/shared";
import { Socket } from "socket.io-client";

import {
    ToClientEvents,
    ToServerEvents,
} from "common/messages/sceneWaitingRoom";
import { WebFontFile } from "../plugins/WebFontFile";
import { GameState } from "../GameState";

import TitleScreen from "../assets/TitleScreen.svg";

type SocketWaitingRoom = Socket<ToClientEvents, ToServerEvents>;

interface SceneDataWaitingRoom {
    gameState: GameState;
}

export class SceneWaitingRoom extends Phaser.Scene {
    private playersNeededText!: Phaser.GameObjects.Text;
    private headerText!: Phaser.GameObjects.Text;
    private button!: Phaser.GameObjects.Text;
    private socket!: SocketWaitingRoom;
    private gameState!: GameState;

    constructor() {
        super("SceneWaitingRoom");
    }

    init(data: SceneDataWaitingRoom) {
        this.gameState = data.gameState;
        this.socket = this.gameState.socket;
    }

    preload() {
        this.load.addFile(new WebFontFile(this.load, "VT323"));

        this.load.svg("titleScreenArt", TitleScreen);
    }

    create() {
        this.initListeners();
        this.socket.emit("requestCurrentScene");
    }

    /**
     * Render in the waiting room only if we receive confirmation form the server that this is the currently active scene.
     */
    private renderWaitingRoom() {
        this.add.image(BOARD_SIZE * 10, BOARD_SIZE * 10, "titleScreenArt");

        this.add
            .text(BOARD_SIZE * 7.2, BOARD_SIZE * 2.5, "TETRIX", {
                fontSize: "92px",
                fontFamily: "VT323",
            })
            .setTint(0xff00d4);

        this.headerText = this.add
            .text(
                BOARD_SIZE * 5,
                BOARD_SIZE * 7.5,
                "Click the button below to join",
                { fontSize: "32px", fontFamily: "VT323" }
            )
            .setTint(0x7fa832);

        this.button = this.add
            .text(BOARD_SIZE * 6.6, BOARD_SIZE * 9, "> Join <", {
                fontSize: "82px",
                fontFamily: "VT323",
            })
            .setTint(0x53bb74)
            .setInteractive({ useHandCursor: true })
            .on("pointerover", () => {
                this.isHovered(this.button, true);
            })
            .on("pointerout", () => {
                this.isHovered(this.button, false);
            })
            .on("pointerdown", () => {
                this.requestJoinGame();
            });

        this.playersNeededText = this.add
            .text(
                BOARD_SIZE * 6.9,
                BOARD_SIZE * 12,
                "Waiting on 4 more player(s)",
                { fontSize: "22px", fontFamily: "VT323" }
            )
            .setTint(0x32a4a8);

        // Request the # of remaining players needed to start the game.
        this.socket.emit("requestRemainingPlayers");
    }

    /**
     * Initialize event listeners.
     */
    private initListeners() {
        // Remove old listeners to avoid accumulation.
        this.socket.removeListener("updateRemainingPlayers");
        this.socket.removeListener("toSceneWaitingRoom");
        this.socket.removeListener("toSceneGameArena");
        this.socket.removeListener("toSceneGameOver");

        // Assign the new listeners.
        this.socket.on("updateRemainingPlayers", (remainingPlayers: number) => {
            this.playersNeededText.setText(
                `Waiting on ${remainingPlayers} more player(s)`
            );
        });

        this.socket.on("toSceneWaitingRoom", () => {
            this.renderWaitingRoom();
        });

        this.socket.on("toSceneGameArena", () => {
            this.scene.start("SceneGameArena", { gameState: this.gameState });
        });

        this.socket.on("toSceneGameOver", (playerPoints) => {
            this.scene.start("SceneGameOver", {
                gameState: this.gameState,
                playerPoints,
            });
        });
    }

    /**
     * Modifies the color of text based off whether a cursor is over the element.
     * @param button The text element.
     * @param isHovered Whether a cursor is hovering over it.
     */
    private isHovered(button: Phaser.GameObjects.Text, isHovered: boolean) {
        if (isHovered) {
            button.setTint(0xd4cb22);
        } else {
            button.setTint(0x53bb74);
        }
    }

    /**
     * If the join button was clicked, erase it from screen and send a request to the server to join the queue.
     */
    private requestJoinGame() {
        this.button.destroy();
        this.socket.emit("joinQueue");
        this.headerText
            .setText("Your request has been sent!")
            .setTint(0x50a832)
            .setPosition(BOARD_SIZE * 5.5, BOARD_SIZE * 7.5);
    }
}
