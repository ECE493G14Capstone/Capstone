import {
    ToClientEvents,
    ToServerEvents,
} from "common/messages/sceneWaitingRoom";
import { Socket } from "socket.io";
import { broadcast } from "./broadcast";

type SocketQueue = Socket<ToServerEvents, ToClientEvents>;

export class PlayerQueue {
    private queue: Array<SocketQueue>;
    private broadcastRemainingPlayers: broadcast["remainingPlayers"];
    private broadcastToSceneGameArena: broadcast["toSceneGameArena"];

    constructor(
        remainingPlayersEvent: broadcast["remainingPlayers"],
        toSceneGameArenaEvent: broadcast["toSceneGameArena"]
    ) {
        this.queue = [];
        this.broadcastRemainingPlayers = remainingPlayersEvent;
        this.broadcastToSceneGameArena = toSceneGameArenaEvent;
    }

    public initSocketListeners(socket: SocketQueue) {
        socket.on("joinQueue", () => {
            this.addToQueue(socket);

            this.broadcastRemainingPlayers(this.getRemainingPlayers());

            // 4 valid connections are found. Start the game.
            if (this.getRemainingPlayers() === 0) {
                for (let playerIndex = 0; playerIndex < 4; playerIndex++) {
                    this.queue[playerIndex].emit(
                        "initPlayer",
                        playerIndex as 0 | 1 | 2 | 3
                    );
                }
                this.broadcastToSceneGameArena();
            }
        });

        socket.on("requestRemainingPlayers", () => {
            socket.emit("updateRemainingPlayers", this.getRemainingPlayers());
        });

        socket.on("disconnect", () => {
            this.removeFromQueue(socket);
            this.broadcastRemainingPlayers(this.getRemainingPlayers());
        });
    }

    /**
     * Add a player to the queue.
     * @param socket The socket to add to the queue.
     */
    public addToQueue(socket: SocketQueue) {
        this.queue.push(socket);
    }

    /**
     * Remove a player from the queue.
     * @param socket The socket to be removed from the queue.
     */
    public removeFromQueue(socket: SocketQueue) {
        /* eslint-disable @typescript-eslint/no-unused-vars */
        this.queue = this.queue.filter(function (value, index, arr) {
            return value != socket;
        });
    }

    /**
     * Empty the queue.
     */
    public resetQueue() {
        this.queue = [];
    }

    /**
     * @returns Returns the number of players needed to start the game.
     */
    public getRemainingPlayers(): number {
        return Math.max(0, 4 - this.queue.length);
    }
}
