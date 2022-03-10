import { Socket } from "socket.io-client";
import { TetrominoType } from "common/TetrominoType";
import { Tetromino } from "./Tetromino";
import { BOARD_SIZE } from "common/shared";
import { ToServerEvents, ToClientEvents } from "common/messages/game";
import { Game } from "phaser";

type GameSocket = Socket<ToClientEvents, ToServerEvents>;

export class GameState {
    // used for synchronization. not related to rendering (no sprites, scene, phaser3 stuff)
    socket: GameSocket;

    // frozen board is the board without moving players, NOTE: frozenBoard is the truth of placed blocks
    frozenBoard: Array<Array<TetrominoType | null>>;
    // board is the final product being rendered. contains all 3 other players
    board: Array<Array<TetrominoType | null>>;

    // synced to server
    currentTetromino: Tetromino;
    // synced from server, ordered by increasing, circular player numbers
    // i.e. if you are player 1, these are of player 2, then 3, then 0
    otherPieces: Array<Tetromino>;
    playerId!: 0 | 1 | 2 | 3;

    private blankBoard() {
        const board = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            const row = [];
            for (let c = 0; c < BOARD_SIZE; c++) {
                row.push(null);
            }
            board.push(row);
        }
        return board;
    }

    constructor(socket: GameSocket) {
        this.socket = socket;
        this.board = this.blankBoard();
        this.frozenBoard = this.blankBoard();

        this.currentTetromino = new Tetromino(TetrominoType.T);
        // other player's moving piece, TODO this is synchronized with the server
        // how they are rendered is not concerned.
        this.otherPieces = [
            // FIXME not good?
            new Tetromino(TetrominoType.T),
            new Tetromino(TetrominoType.T),
            new Tetromino(TetrominoType.T),
        ];

        // initial rotation
        this.otherPieces.map((tetro, i) => {
            tetro.setRotatedPosition(tetro.position, i + 1);
            tetro.setRotation(i + 1);
        });

        this.socket.on("initPlayer", (playerId) => {
            this.playerId = playerId;
        });

        this.socket.on("playerMove", (playerId, state) => {
            const i = (3 - this.playerId + playerId) % 4; // Circular distance
            this.otherPieces[i].position = state.position; // position before rotation
            this.otherPieces[i].setType(state.type);
            this.otherPieces[i].setRotatedPosition(state.position, i + 1);
            this.otherPieces[i].setRotation(i + 1 + state.rotation);
        });

        this.socket.on("playerPlace", (playerId, state) => {
            if (playerId == this.playerId) {
                // the placing event is emitted by this very client, who already handled the local board during emitting
                return;
            }

            // place the tetro on our board
            const i = (3 - this.playerId + playerId) % 4; // Circular distance
            const tetroToPlace = Tetromino.createFromState(state);
            // local rotate
            tetroToPlace.setRotation(i + 1 + tetroToPlace.rotation);
            tetroToPlace.setRotatedPosition(tetroToPlace.position, i + 1);
            // place on frozen board
            tetroToPlace.tiles.forEach((tile) => {
                const [row, col] = [
                    tetroToPlace.position[0] + tile[0],
                    tetroToPlace.position[1] + tile[1],
                ];
                this.frozenBoard[row][col] = tetroToPlace.type;
            });
        });
    }
}
