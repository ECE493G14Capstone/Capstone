import { Socket } from "socket.io-client";
import { TetrominoType } from "common/TetrominoType";
import { Tetromino } from "./Tetromino";
import { BOARD_SIZE } from "common/shared";
import { ToServerEvents, ToClientEvents } from "common/messages/game";
import { TetrominoLookahead } from "./Tetromino";

type GameSocket = Socket<ToClientEvents, ToServerEvents>;

export class GameState {
    // used for synchronization. not related to rendering (no sprites, scene, phaser3 stuff)
    socket: GameSocket;

    // board contains all placed monominoes (tiles)
    board: Array<Array<TetrominoType | null>>;

    // synced to server
    currentTetromino: Tetromino;
    // synced from server, ordered by increasing, circular player numbers
    // i.e. if you are player 1, these are of player 2, then 3, then 0
    otherTetrominoes: Array<Tetromino>;
    playerId!: 0 | 1 | 2 | 3;

    private newBoard() {
        const board = new Array(BOARD_SIZE);
        for (let r = 0; r < BOARD_SIZE; r++) {
            board[r] = new Array(BOARD_SIZE).fill(null);
        }

        const centerTopLeft = BOARD_SIZE / 2 - 1;
        board[centerTopLeft][centerTopLeft] = TetrominoType.O;
        board[centerTopLeft + 1][centerTopLeft] = TetrominoType.O;
        board[centerTopLeft][centerTopLeft + 1] = TetrominoType.O;
        board[centerTopLeft + 1][centerTopLeft + 1] = TetrominoType.O;
        return board;
    }

    private getPlayerIndex(playerId: number) {
        return (3 - this.playerId + playerId) % 4;
    }

    constructor(socket: GameSocket) {
        this.socket = socket;
        this.board = this.newBoard();
        this.currentTetromino = new Tetromino();
        // other player's moving piece, TODO this is synchronized with the server
        // how they are rendered is not concerned.
        this.otherTetrominoes = [
            // FIXME not good?
            new Tetromino(),
            new Tetromino(),
            new Tetromino(),
        ];

        // initial rotation
        this.otherTetrominoes.forEach((tetro, i) => {
            tetro.setRotatedPosition(tetro.position, i + 1);
            tetro.updateFromLookahead(Tetromino.rotate(tetro, i + 1));
        });

        this.socket.on("initPlayer", (playerId) => {
            this.playerId = playerId;
        });

        this.socket.on("playerMove", (playerId, state) => {
            const i = this.getPlayerIndex(playerId);
            this.otherTetrominoes[i].updateFromState(state, i + 1);
        });

        this.socket.on("playerPlace", (playerId, state) => {
            // place the tetro on our board
            const i = this.getPlayerIndex(playerId);
            const tetroToPlace = this.otherTetrominoes[i];
            tetroToPlace.updateFromState(state, i + 1);
            this.placeTetromino(tetroToPlace);
            this.otherTetrominoes[i] = tetroToPlace;

            // if the other tetromino is bumping into us, freeze ours too.
            if (
                this.adjacentWithPlayers(this.currentTetromino, [
                    this.otherTetrominoes[i],
                ])
            ) {
                this.emitAndPlaceCurrentTetromino();
            }
        });
    }

    public emitPlayerMove() {
        this.socket.emit(
            "playerMove",
            this.playerId,
            this.currentTetromino.reportState()
        );
    }

    public emitAndPlaceCurrentTetromino() {
        // place on board and emit events to the server
        this.socket.emit(
            "playerPlace",
            this.playerId,
            this.currentTetromino.reportState()
        );
        this.placeTetromino(this.currentTetromino);
        // start a new tetromino from the top
        this.currentTetromino.respawn();
        // broadcast new tetromino position
        this.emitPlayerMove();
    }

    public placeTetromino(tetromino: Tetromino) {
        tetromino.tiles.forEach(([row, col]) => {
            this.board[row][col] = tetromino.type;
        });
    }

    public moveIfCan(
        movement: (tetro: Tetromino) => TetrominoLookahead
    ): boolean {
        // look-ahead for the next tetromino state after movement
        const lookahead = movement(this.currentTetromino);

        if (
            this.overlapWithBoard(lookahead) ||
            this.overlapWithPlayers(lookahead, this.otherTetrominoes)
        ) {
            return false;
        }

        this.currentTetromino.updateFromLookahead(lookahead);
        return true;
    }

    /**
     * check against static board, see if lookahead is overlapping with static monominoes placed on board
     * @returns boolean - if `lookahead` tiles overlaps with any blocks on the board
     */
    private overlapWithBoard(lookahead: TetrominoLookahead): boolean {
        return lookahead.tiles.some(([row, col]) => {
            return this.board[row][col] != null;
        });
    }

    /**
     * check against other players' tetrominoes: see if lookahead tiles is overlapping with other existing players
     * @returns boolean - if `lookahead` tiles overlap with any of the `tetrominoes`
     */
    private overlapWithPlayers(
        lookahead: TetrominoLookahead,
        tetrominoes: Array<Tetromino>
    ): boolean {
        return tetrominoes.some((tetro) => {
            // if the bounding boxes are more than the-maximum-"manhattan distance" away in any axis
            const isFarAway =
                Math.abs(tetro.position[0] - lookahead.position[0]) > 4 ||
                Math.abs(tetro.position[1] - lookahead.position[1]) > 4; // 4 is the max width of a tetromino bounding box
            if (isFarAway) {
                return false;
            }

            // if lookahead has overlapping monominoes with those tetro
            return tetro.tiles.some(([row, col]) => {
                return lookahead.tiles.some(
                    ([newRow, newCol]) => newRow === row && newCol === col
                );
            });
        });
    }

    /**
     * Returns if `tetro` is adjacent to any of the tetrominoes in the `tetrominoes` list
     * @param tetro - The tetromino that is supposedly "currentTetromino", but can be any tetromino to be tested
     * @param tetrominoes - The array of tetrominoes to be scanned through and looked for adjacentness
     */
    private adjacentWithPlayers(
        tetro: Tetromino,
        tetrominoes: Array<Tetromino>
    ): boolean {
        const lookahead = tetro.toTetrominoLookahead();
        lookahead.tiles = tetro.tiles
            // insert tiles and their expanded positions
            // No out of bounds check because overlapWithPlayers doesn't index board
            .map(([row, col]) => {
                return [
                    [row, col],
                    [row + 1, col],
                    [row - 1, col],
                    [row, col + 1],
                    [row, col - 1],
                ];
            })
            // flatten
            .reduce((total, current) => [...total, ...current])
            // deduplicate
            .filter(
                (tile, index, tiles) =>
                    tiles.findIndex(
                        ([row, col]) => row === tile[0] && col === tile[1]
                    ) === index
            ) as [number, number][];

        // if the expanded tetromino is overlapping, then it's definitely adjacent, if not actually overlapping. (We don't have to care about excluding the actually overlapped case because that handles more scenarios when synchronization is not ideal.)
        return this.overlapWithPlayers(lookahead, tetrominoes);
    }
}
