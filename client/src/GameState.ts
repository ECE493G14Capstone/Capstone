import { Socket } from "socket.io-client";
import { TetrominoType } from "common/TetrominoType";
import { Tetromino } from "./Tetromino";
import { BOARD_SIZE } from "common/shared";
import { ToServerEvents, ToClientEvents } from "common/messages/game";
import { TradeState } from "./scene/TradeUI";

type GameSocket = Socket<ToClientEvents, ToServerEvents>;

export class GameState {
    // used for synchronization. not related to rendering (no sprites, scene, phaser3 stuff)
    socket: GameSocket;

    // frozen board is the board without moving players, NOTE: frozenBoard is the truth of placed blocks
    frozenBoard: Array<Array<TetrominoType | null>>;
    // board is the final product being rendered. contains all 3 other players
    board: Array<Array<TetrominoType | null>>;
    tradeState!: TradeState;
    // synced to server
    currentTetromino: Tetromino;
    // synced from server, ordered by increasing, circular player numbers
    // i.e. if you are player 1, these are of player 2, then 3, then 0
    otherPieces: Array<Tetromino>;
    playerId!: 0 | 1 | 2 | 3;
    tradingPlayerId: 0 | 1 | 2 | 3 | null = null;

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
        this.tradeState = TradeState.NoTrade;

        this.currentTetromino = new Tetromino(TetrominoType.T);
        // other player's moving piece, TODO this is synchronized with the server
        // how they are rendered is not concerned.
        this.otherPieces = [
            // FIXME not good?
            new Tetromino(TetrominoType.T),
            new Tetromino(TetrominoType.T),
            new Tetromino(TetrominoType.T),
        ];

        this.socket.on("initPlayer", (playerId) => {
            this.playerId = playerId;
            console.log("playerId: ", playerId);
        });

        this.socket.on("playerMove", (playerId, state) => {
            const i = (3 - this.playerId + playerId) % 4; // Circular distance
            this.otherPieces[i].setType(state.type);
            this.otherPieces[i].setRotatedPosition(state.position, i + 1);
            this.otherPieces[i].setRotation(i + 1 + state.rotation);
        });
        this.socket.on("playerTrade", (playerId, _, otherTradeState) => {   
            if (otherTradeState == TradeState.Offered) {
                this.tradeState = TradeState.Pending;
                this.tradingPlayerId = playerId;
            } else if (otherTradeState == TradeState.Accepted) {
                this.tradeState = TradeState.NoTrade;
                this.tradingPlayerId = null;
            }
        });
        this.socket.on("sendTradePiece", (tetrominoType) => {
            this.currentTetromino.swapPiece(tetrominoType);
            this.currentTetromino.isTraded = true;
            this.tradeState = TradeState.NoTrade;
            this.tradingPlayerId = null;
            this.socket.emit("clearTrade")
        })
        
    }
            public emitTrade() {
            this.socket.emit("playerTrade", this.playerId,
                this.currentTetromino.type, 
                this.tradeState)
            
            
        }
}
