import { Socket } from "socket.io-client";

import {
    BoardState,
    BOARD_SIZE,
    PRIVATE_AREA_LENGTH,
    WALL_SIZE,
} from "common/shared";
import { TetrominoType } from "common/TetrominoType";
import { ToServerEvents, ToClientEvents } from "common/messages/game";
import { TradeState } from "common/TradeState";

import { Tetromino, TetrominoLookahead } from "./Tetromino";
import { Monomino } from "./Monomino";
import { RandomBag } from "./RandomBag";

type GameSocket = Socket<ToClientEvents, ToServerEvents>;

enum LineCheckAxis {
    Row,
    Column,
}

type LineCheckTask = {
    axis: LineCheckAxis;
    direction: -1 | 1;
    range: Array<number>;
};

if (import.meta.env.VITE_DEBUG_ENABLE_FRAMEDRAWING) {
    console.log("drawing board per frame is enabled");
}

export class GameState {
    socket: GameSocket;

    tradeState!: TradeState;
    // false indicates the corner area that pieces cannot enter
    board!: Array<Array<Monomino | false | null>>;
    randomBag!: RandomBag;

    // synced to server
    currentTetromino!: Tetromino;
    // synced from server, ordered by increasing, circular player numbers
    // i.e. if you are player 1, these are of player 2, then 3, then 0

    tradingPlayerId!: 0 | 1 | 2 | 3 | null;
    otherTetrominoes!: Array<Tetromino>;
    playerId!: 0 | 1 | 2 | 3 | null;

    public monominoesToDraw: Array<Monomino> = [];

    lineCheckSequence!: Array<LineCheckTask>;
    // template used to generate lineCheckSequence once playerId is received
    static LineCheckTemplate: Array<LineCheckTask> = [
        {
            axis: LineCheckAxis.Row,
            direction: 1,
            range: [],
        },
        {
            axis: LineCheckAxis.Column,
            direction: -1,
            range: [],
        },
        {
            axis: LineCheckAxis.Row,
            direction: -1,
            range: [],
        },
        {
            axis: LineCheckAxis.Column,
            direction: 1,
            range: [],
        },
    ];

    /**
     * reset all states in GameState, as if re-constructed
     * NOTE: make sure to call this function before receiving "initPlayer"
     */
    public initialize() {
        this.tradeState = TradeState.NoTrade;
        this.tradingPlayerId = null;
        this.playerId = null;
        this.initBoard();
        this.randomBag = new RandomBag(this.socket);

        this.otherTetrominoes = [
            // TODO: perhaps avoid initializing until we know peers' types?
            new Tetromino(TetrominoType.T, null),
            new Tetromino(TetrominoType.T, null),
            new Tetromino(TetrominoType.T, null),
            new Tetromino(TetrominoType.T, null), // this tetromino will be eliminated once current client is assigned a playerId
        ];

        this.updateLineCheckSequence();
        // initial rotation
        this.otherTetrominoes.forEach((tetro, i) => {
            tetro.setRotatedPosition(tetro.position, i + 1);
            tetro.updateFromLookahead(Tetromino.rotate(tetro, i + 1));
        });
    }

    private updateLineCheckSequence() {
        const sequence = GameState.LineCheckTemplate;
        const distanceToPlayer0 = (4 - (this.playerId || 0)) % 4;
        // rotate the line checking sequence to always start from player 0
        for (let i = 0; i < distanceToPlayer0; i++) {
            sequence.push(sequence.shift()!);
        }

        // for each task, generate the range of lines to check with, i.e. rows from top to center (before rotation)
        // e.g. for current player it will be [0..19], for opposite it's [39..20]
        const halfBoard = [...Array(BOARD_SIZE / 2).keys()];
        this.lineCheckSequence = sequence.map(({ axis, direction }) => {
            if (direction > 0)
                return { axis, direction, range: halfBoard.slice() };
            return {
                axis,
                direction,
                range: halfBoard.map((i) => BOARD_SIZE - 1 - i),
            };
        });
    }

    private initBoard() {
        this.board = new Array(BOARD_SIZE);
        for (let r = 0; r < BOARD_SIZE; r++) {
            this.board[r] = new Array(BOARD_SIZE).fill(null);
        }

        const centerTopLeft = BOARD_SIZE / 2 - 1;
        [0, 1].forEach((row_off) => {
            [0, 1].forEach((col_off) => {
                const row = centerTopLeft + row_off;
                const col = centerTopLeft + col_off;
                this.board[row][col] = new Monomino(
                    TetrominoType.O,
                    [row, col],
                    null
                );
            });
        });

        // generate walls
        // 0..14 and 25..39
        const wallInds = [...Array(WALL_SIZE).keys()].concat(
            [...Array(WALL_SIZE).keys()].map((x) => BOARD_SIZE - 1 - x)
        );
        wallInds.forEach((row) => {
            wallInds.forEach((col) => {
                this.board[row][col] = false;
            });
        });
    }

    private getPlayerIndex(playerId: number) {
        return (3 - (this.playerId || 0) + playerId) % 4;
    }

    public toBoardState(): BoardState {
        const board = this.board.map((row) => {
            return row.map((el) => {
                if (!el) {
                    return el;
                }
                return el.toMonominoState();
            });
        });

        const reverseRotations = (this.playerId || 0) % 4;
        const boardFromPlayer0 = board.map((row) => row.slice());
        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                const [newRow, newCol] = Tetromino.rotateCoords(
                    [row, col],
                    BOARD_SIZE,
                    reverseRotations
                );
                boardFromPlayer0[newRow][newCol] = board[row][col];
                const newBlock = boardFromPlayer0[newRow][newCol];
                if (newBlock) {
                    newBlock.position = [newRow, newCol];
                }
            }
        }
        return boardFromPlayer0;
    }

    public fromBoardState(boardState: BoardState): Array<Monomino> {
        const needRedraw = [];
        const ccRotations = 4 - ((this.playerId || 0) % 4);

        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                const [newRow, newCol] = Tetromino.rotateCoords(
                    [row, col],
                    BOARD_SIZE,
                    ccRotations
                );
                // the future state of the monomino at [row, col]
                const monominoState = boardState[row][col];
                if (!monominoState) {
                    // erase existing monomino if it should now be null
                    const existingMonomino = this.board[newRow][newCol];
                    if (existingMonomino) {
                        existingMonomino.destroy();
                    }
                    this.board[newRow][newCol] = monominoState;
                } else {
                    monominoState.position = [newRow, newCol];
                    const [monomino, shouldRedraw] =
                        Monomino.updateFromMonominoState(
                            monominoState,
                            this.board[newRow][newCol]
                        );
                    this.board[newRow][newCol] = monomino;
                    if (shouldRedraw) {
                        needRedraw.push(monomino);
                    }
                }
            }
        }
        return needRedraw;
    }

    constructor(socket: GameSocket) {
        this.socket = socket;
        this.initialize();

        this.socket.on(
            "reportBoard",
            (callback: (boardState: BoardState) => void) => {
                callback(this.toBoardState());
            }
        );

        this.socket.on("initPlayer", (playerId) => {
            this.initializePlayer(playerId);
        });

        this.socket.on("playerMove", (playerId, state) => {
            const i = this.getPlayerIndex(playerId);
            this.otherTetrominoes[i].updateFromState(state, i + 1);
            if (this.otherTetrominoes[i].getOwnerId() !== playerId) {
                this.otherTetrominoes[i].setOwnerId(playerId);
            }
        });

        this.socket.on("playerPlace", (playerId, state) => {
            // place the tetro on our board
            const i = this.getPlayerIndex(playerId);
            const tetroToPlace = this.otherTetrominoes[i];
            tetroToPlace.updateFromState(state, i + 1);
            this.placeTetromino(tetroToPlace);
            tetroToPlace.dropSprites();

            // if the other tetromino is bumping into us, freeze ours too.
            if (
                this.playerId != null &&
                this.adjacentWithPlayers(this.currentTetromino, [
                    this.otherTetrominoes[i],
                ])
            ) {
                this.emitAndPlaceCurrentTetromino();
            }

            // push to monomino array waiting to draw
            this.updateLineClearing();
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
            this.swapTetromino(tetrominoType);
            this.clearTradeAndEmit();
            this.emitPlayerMove();
        });

        this.socket.on("clearTrade", () => {
            this.clearLocalTrade();
        });
        this.socket.on(
            "randomTrade",
            (playerIds: [number, number], pairNum: 1 | 2) => {
                if (
                    this.playerId != null &&
                    playerIds.includes(this.playerId)
                ) {
                    this.socket.emit(
                        "sendRandomPiece",
                        this.currentTetromino.getType(),
                        pairNum
                    );
                }
            }
        );
        this.socket.on("sendRandomPiece", (tetrominoType: TetrominoType) => {
            this.swapTetromino(tetrominoType);
            if (this.tradeState === TradeState.Offered) {
                this.clearTradeAndEmit();
            }
            this.emitPlayerMove();
        });
    }
    private swapTetromino(tetrominoType: TetrominoType) {
        this.currentTetromino.destroy();
        this.currentTetromino = new Tetromino(tetrominoType, this.playerId);
        this.currentTetromino.isTraded = true;
    }
    private clearLocalTrade() {
        this.tradeState = TradeState.NoTrade;
        this.tradingPlayerId = null;
    }
    private clearTradeAndEmit() {
        this.clearLocalTrade();
        this.socket.emit("clearTrade");
    }

    public initializePlayer(playerId: 0 | 1 | 2 | 3) {
        if (this.otherTetrominoes.length > 3) {
            this.otherTetrominoes.pop();
        }
        this.playerId = playerId;
        // Owner ID set on initPlayer
        this.currentTetromino = new Tetromino(
            this.randomBag.getNextType(),
            null
        );
        this.currentTetromino.setOwnerId(playerId);
        this.otherTetrominoes.forEach((tetromino, i) =>
            tetromino.setOwnerId(<0 | 1 | 2 | 3>((playerId + i + 1) % 4))
        );
        this.updateLineCheckSequence();
    }

    public emitPlayerMove() {
        if (this.playerId == null) {
            return;
        }
        this.socket.emit(
            "playerMove",
            this.playerId,
            this.currentTetromino.reportState()
        );
    }

    public emitAndPlaceCurrentTetromino() {
        if (this.playerId == null) {
            return;
        }
        // place on board and emit events to the server
        this.socket.emit(
            "playerPlace",
            this.playerId,
            this.currentTetromino.reportState()
        );
        this.placeTetromino(this.currentTetromino);
        this.currentTetromino.dropSprites();

        if (this.tradeState === TradeState.Offered) {
            //clear the trade if this user was offering a trade
            this.clearTradeAndEmit();
        }
        this.spawnNewTetromino();
    }

    private spawnNewTetromino() {
        // start a new tetromino from the top
        this.currentTetromino = new Tetromino(
            this.randomBag.getNextType(),
            this.playerId
        );

        if (
            this.overlapWithBoard(this.currentTetromino.toTetrominoLookahead())
        ) {
            this.socket.emit("endGame");
        }

        // broadcast new tetromino position
        this.emitPlayerMove();
    }

    public updateLineClearing(tetrominoOwner: 0 | 1 | 2 | 3 | null = null) {
        this.monominoesToDraw = this.monominoesToDraw.concat(
            this.lineCheckSequence
                .map((task) => {
                    const linesToClear = this.scanLinesToClear(task);
                    if (linesToClear.length === 0) {
                        return [];
                    }
                    // create a map to record by how much we should fall/offset each lines after removing
                    const linesToFall = this.prepareLinesToFall(
                        task,
                        linesToClear
                    );
                    this.removeLines(task, linesToClear);
                    const monominoesToDraw = this.fallLines(task, linesToFall);

                    if (
                        tetrominoOwner != null &&
                        this.playerId != null &&
                        this.playerId === tetrominoOwner
                    ) {
                        let score: 1 | 3 | 5 | 8 = 1;
                        switch (linesToClear.length) {
                            case 1:
                                score = 1;
                                break;
                            case 2:
                                score = 3;
                                break;
                            case 3:
                                score = 5;
                                break;
                            case 4:
                                score = 8;
                                break;
                        }
                        this.socket.emit("gainPoints", this.playerId, score);
                    }

                    return monominoesToDraw;
                })
                .reduce((total, curr) => [...total, ...curr])
        );
    }

    private removeLines(task: LineCheckTask, linesToClear: Array<number>) {
        const removeMonomino = (row: number, col: number) => {
            const monominoToRemove = this.board[row][col];
            if (monominoToRemove) {
                monominoToRemove.destroy();
            }
            this.board[row][col] = null;
        };
        if (task.axis === LineCheckAxis.Row) {
            for (const row of linesToClear) {
                // scan through each row
                for (let col = WALL_SIZE; col < BOARD_SIZE - WALL_SIZE; col++) {
                    removeMonomino(row, col);
                }
            }
        } else if (task.axis === LineCheckAxis.Column) {
            for (const col of linesToClear) {
                // scan through each col
                for (let row = WALL_SIZE; row < BOARD_SIZE - WALL_SIZE; row++) {
                    removeMonomino(row, col);
                }
            }
        }
    }

    private fallLines(
        task: LineCheckTask,
        linesToFall: Map<number, number>
    ): Array<Monomino> {
        const needRedraw: Array<Monomino> = [];
        const swapMonomino = (
            [oldRow, oldCol]: [number, number],
            [newRow, newCol]: [number, number]
        ) => {
            this.board[newRow][newCol] = this.board[oldRow][oldCol];
            this.board[oldRow][oldCol] = null;
            const monomino = this.board[newRow][newCol];
            if (monomino) {
                monomino.position = [newRow, newCol];
                needRedraw.push(monomino);
            }
        };

        task.range
            .slice()
            .reverse()
            .forEach((lineIndex) => {
                const offset =
                    task.direction * (linesToFall.get(lineIndex) || 0);
                if (offset === 0) {
                    return;
                }
                if (task.axis === LineCheckAxis.Row) {
                    const newRow = lineIndex + offset;
                    // swap line with the offset destination line
                    // the old line should always be null since it's cleared/propagated
                    for (
                        let col = WALL_SIZE;
                        col < BOARD_SIZE - WALL_SIZE;
                        col++
                    ) {
                        swapMonomino([lineIndex, col], [newRow, col]);
                    }
                } else if (task.axis === LineCheckAxis.Column) {
                    const newCol = lineIndex + offset;
                    for (
                        let row = WALL_SIZE;
                        row < BOARD_SIZE - WALL_SIZE;
                        row++
                    ) {
                        swapMonomino([row, lineIndex], [row, newCol]);
                    }
                }
            });
        return needRedraw;
    }

    private prepareLinesToFall(
        task: LineCheckTask,
        linesToClear: Array<number>
    ): Map<number, number> {
        const linesOffset = new Map<number, number>();
        let offset = 0;
        task.range
            .slice()
            .reverse()
            .forEach((lineIndex) => {
                if (lineIndex === linesToClear[0]) {
                    // this line is an empty, cleared line. all lines above should fall with one more offset
                    offset += 1;
                    linesToClear.push(linesToClear.shift()!);
                } else {
                    linesOffset.set(lineIndex, offset);
                }
            });
        return linesOffset;
    }

    private scanLinesToClear(task: LineCheckTask): Array<number> {
        const linesToClear = [];
        const scanRange = [...Array(BOARD_SIZE - 2 * WALL_SIZE).keys()].map(
            (x) => WALL_SIZE + x
        );
        if (task.axis === LineCheckAxis.Row) {
            for (const row of task.range) {
                // scan through each row
                const canClear = scanRange.every((col) => {
                    return this.board && this.board[row][col] != null;
                });
                if (canClear) {
                    linesToClear.push(row);
                }
            }
        } else if (task.axis === LineCheckAxis.Column) {
            for (const col of task.range) {
                // scan through each col
                const canClear = scanRange.every((row) => {
                    return this.board && this.board[row][col] != null;
                });
                if (canClear) {
                    linesToClear.push(col);
                }
            }
        }

        return linesToClear.reverse();
    }

    public placeTetromino(tetromino: Tetromino) {
        this.monominoesToDraw = this.monominoesToDraw.concat(
            tetromino.monominoes.map((monomino) => {
                this.board[monomino.position[0]][monomino.position[1]] =
                    monomino;
                return monomino;
            })
        );
    }

    public emitTrade() {
        if (this.playerId != null) {
            this.socket.emit(
                "playerTrade",
                this.playerId,
                this.currentTetromino.getType(),
                this.tradeState
            );
        }
    }

    public moveIfCan(
        movement: (tetro: Tetromino) => TetrominoLookahead
    ): boolean {
        // look-ahead for the next tetromino state after movement
        const lookahead = movement(this.currentTetromino);

        if (
            lookahead.tiles.some(([row, _]) => {
                return row >= BOARD_SIZE;
            }) &&
            this.playerId != null &&
            this.playerId === this.currentTetromino.ownerId
        ) {
            this.currentTetromino.destroy();
            this.spawnNewTetromino();
            this.socket.emit("losePoints", this.playerId);
            return true;
        }

        if (
            this.isInNeighborSection(lookahead) ||
            this.overlapWithBoard(lookahead) ||
            this.overlapWithPlayers(lookahead, this.otherTetrominoes)
        ) {
            return false;
        }

        this.currentTetromino.updateFromLookahead(lookahead);
        return true;
    }

    private isInNeighborSection(lookahead: TetrominoLookahead): boolean {
        return lookahead.tiles.some(([_, col]) => {
            return (
                col < PRIVATE_AREA_LENGTH ||
                col >= BOARD_SIZE - PRIVATE_AREA_LENGTH
            );
        });
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
     * @returns True if the current Tetromino is in the opposite players section.
     */
    public isInOppositeSection() {
        return this.currentTetromino.monominoes.every(
            (monomino) => monomino.position[0] >= 25
        );
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
            return tetro.monominoes.some((monomino) => {
                const [row, col] = monomino.position;
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

        // No out of bounds check because overlapWithPlayers doesn't index board
        lookahead.tiles = lookahead.tiles
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
