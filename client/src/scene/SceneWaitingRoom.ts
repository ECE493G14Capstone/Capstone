import Phaser from "phaser";
import { BOARD_SIZE } from "common/shared";
import { SharedState } from "..";
import { Socket } from "socket.io-client";

import {
    ToClientEvents,
    ToServerEvents,
} from "common/messages/sceneWaitingRoom";
import { WebFontFile } from "../plugins/WebFontFile";

import TitleScreen from "../assets/TitleScreen.svg";

type SocketWaitingRoom = Socket<ToClientEvents, ToServerEvents>;

export class SceneWaitingRoom extends Phaser.Scene {
    private playersNeededText!: Phaser.GameObjects.Text;
    private headerText!: Phaser.GameObjects.Text;
    private button!: Phaser.GameObjects.Text;
    private socket!: SocketWaitingRoom;
    private sharedData!: SharedState;

    constructor() {
        super({
            key: "SceneWaitingRoom",
        });
    }

    init(data: SharedState) {
        this.sharedData = data;
        this.socket = this.sharedData.socket;
        this.initListeners();
    }

    preload() {
        this.load.addFile(new WebFontFile(this.load, "VT323"));

        this.load.svg("titleScreenArt", TitleScreen);
    }

    create() {
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

    private initListeners() {
        this.socket.on("updateRemainingPlayers", (remainingPlayers: number) => {
            console.log("update remaining: ", remainingPlayers);
            this.playersNeededText.setText(
                `Waiting on ${remainingPlayers} more player(s)`
            );
        });

        this.socket.on("toSceneGameArena", () => {
            this.scene.start("SceneGameArena", { ...this.sharedData });
        });

        this.socket.on("toSceneGameOver", (playerPoints) => {
            this.scene.start("SceneGameOver", {
                ...this.sharedData,
                playerPoints: playerPoints,
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
        this.button.setText("");
        this.socket.emit("joinQueue");
        this.headerText
            .setText("Your request has been sent!")
            .setTint(0x50a832)
            .setPosition(BOARD_SIZE * 5.5, BOARD_SIZE * 7.5);
    }
}
