import { TetrominoType } from "common/TetrominoType";
import { BOARD_SIZE } from "common/shared";
import { TetrominoState } from "common/message";
import { RandomBag } from "./randomBag";
import { ToServerEvents, ToClientEvents } from "common/messages/tetromino";

import { Socket } from "socket.io-client";

type TetrominoSocket = Socket<ToClientEvents, ToServerEvents>;

type Shape = {
    width: number;
    tiles: Array<[number, number]>;
};

export type TetrominoLookahead = {
    position: [number, number];
    tiles: Array<[number, number]>;
    rotation: 0 | 1 | 2 | 3;
};

export class Tetromino {
    static readonly shapes: { [key in TetrominoType]: Shape } = {
        [TetrominoType.I]: {
            width: 4,
            tiles: [
                [1, 0],
                [1, 1],
                [1, 2],
                [1, 3],
            ],
        },
        [TetrominoType.J]: {
            width: 3,
            tiles: [
                [0, 0],
                [1, 0],
                [1, 1],
                [1, 2],
            ],
        },
        [TetrominoType.L]: {
            width: 3,
            tiles: [
                [0, 2],
                [1, 0],
                [1, 1],
                [1, 2],
            ],
        },
        [TetrominoType.O]: {
            width: 2,
            tiles: [
                [0, 0],
                [0, 1],
                [1, 0],
                [1, 1],
            ],
        },
        [TetrominoType.S]: {
            width: 3,
            tiles: [
                [0, 1],
                [0, 2],
                [1, 0],
                [1, 1],
            ],
        },
        [TetrominoType.T]: {
            width: 3,
            tiles: [
                [0, 1],
                [1, 0],
                [1, 1],
                [1, 2],
            ],
        },
        [TetrominoType.Z]: {
            width: 3,
            tiles: [
                [0, 0],
                [0, 1],
                [1, 1],
                [1, 2],
            ],
        },
    };

    /**
     * @param coords A `[row, column]` coordinate pair
     * @param size The grid size in which the coordinates exist
     * @param ccRotations The number of clockwise rotations to perform
     * @returns The rotated coordinates
     */
    static rotateCoords(
        coords: [number, number],
        size: number,
        ccRotations: number
    ): [number, number] {
        const maxCoord = size - 1;
        switch (ccRotations % 4) {
            case 1: // 90 degree clockwise
                return [coords[1], maxCoord - coords[0]];
            case 2: // 180 degree
                return [maxCoord - coords[0], maxCoord - coords[1]];
            case 3: // 90 degree counterclockwise
                return [maxCoord - coords[1], coords[0]];
            default:
                // 0 degree
                return coords;
        }
    }

    type!: TetrominoType;
    position: [number, number];
    rotation: 0 | 1 | 2 | 3;
    tiles!: Array<[number, number]>;
    randomBag!: RandomBag;
    votedTetroToSpawn!: number | null;

    constructor() {
        this.randomBag = new RandomBag();
        const type = this.randomBag.returnNextPiece();
        this.position = [
            0,
            Math.round((BOARD_SIZE - Tetromino.shapes[type].width) / 2),
        ];
        this.setType(type);
        this.rotation = 0; // default (no rotation)
    }

    public initListeners(socket: TetrominoSocket) {
        socket.on("votedTetroToSpawn", (type) => {
            this.votedTetroToSpawn = type;
            setTimeout(() => {
                this.votedTetroToSpawn = null;
            }, 20000);
        });
    }

    respawn() {
        // TODO generate from a sequence iterator (another singleton class?)
        // use respawn instead of `new Tetromino` because right now rendered tetromino will lose reference if inner is created anew. FIXME this is not true when using extension style rendered tetromino
        this.position = [
            0,
            Math.round((BOARD_SIZE - Tetromino.shapes[this.type].width) / 2),
        ];
        if (this.votedTetroToSpawn) {
            this.setType(this.votedTetroToSpawn);
        } else {
            this.setType(this.randomBag.returnNextPiece());
        }
        this.rotation = 0; // default (no rotation)
    }

    reportState(): TetrominoState {
        return {
            type: this.type,
            position: this.position,
            rotation: this.rotation,
        };
    }

    updateFromState(state: TetrominoState, ccRotations: number) {
        this.setType(state.type);
        this.setRotatedPosition(state.position, ccRotations);
        this.updateFromLookahead(
            Tetromino.rotate(this, ccRotations + state.rotation)
        );
    }

    updateFromLookahead(lookahead: TetrominoLookahead) {
        this.position = lookahead.position;
        this.tiles = lookahead.tiles;
        this.rotation = lookahead.rotation;
    }

    toTetrominoLookahead(): TetrominoLookahead {
        return {
            position: [...this.position],
            tiles: this.tiles,
            rotation: this.rotation,
        };
    }

    setType(type: TetrominoType) {
        if (this.type == type) {
            return;
        }
        this.type = type;
        this.tiles = Tetromino.shapes[type].tiles.map(([row, col]) => [
            this.position[0] + row,
            this.position[1] + col,
        ]);
        this.rotation = 0;
    }

    setRotatedPosition(position: [number, number], ccRotations: number) {
        ccRotations %= 4;
        let [newRow, newCol] = Tetromino.rotateCoords(
            position,
            BOARD_SIZE,
            ccRotations
        );
        // Compensate for position needing to be at top left
        const adjustment = Tetromino.shapes[this.type].width - 1;
        if (ccRotations == 1 || ccRotations == 2) {
            newCol -= adjustment;
        }
        if (ccRotations == 3 || ccRotations == 2) {
            newRow -= adjustment;
        }

        this.tiles = this.tiles
            .map(([row, col]) => [
                row - this.position[0],
                col - this.position[1],
            ])
            .map(([offsetRow, offsetCol]) => [
                offsetRow + newRow,
                offsetCol + newCol,
            ]);
        this.position = [newRow, newCol];
    }

    static rotate(tetromino: Tetromino, rotation: number): TetrominoLookahead {
        const lookahead = tetromino.toTetrominoLookahead();
        if (tetromino.rotation == rotation % 4) {
            return lookahead;
        }

        lookahead.tiles = lookahead.tiles
            .map((tile) => {
                return Tetromino.rotateCoords(
                    [
                        tile[0] - lookahead.position[0],
                        tile[1] - lookahead.position[1],
                    ],
                    Tetromino.shapes[tetromino.type].width,
                    4 - lookahead.rotation + rotation // circular distance
                );
            })
            .map((tile) => {
                return [
                    tile[0] + lookahead.position[0],
                    tile[1] + lookahead.position[1],
                ];
            });
        lookahead.rotation = <0 | 1 | 2 | 3>(rotation % 4);
        return lookahead;
    }

    static rotateCW(tetromino: Tetromino): TetrominoLookahead {
        return Tetromino.rotate(tetromino, tetromino.rotation + 1);
    }

    static rotateCCW(tetromino: Tetromino): TetrominoLookahead {
        return Tetromino.rotate(tetromino, tetromino.rotation - 1);
    }

    static fall(tetromino: Tetromino): TetrominoLookahead {
        const lookahead = tetromino.toTetrominoLookahead();
        // fall down by 1
        lookahead.position[0] += 1;
        lookahead.tiles = lookahead.tiles.map(([row, col]) => [row + 1, col]);
        return lookahead;
    }

    static slide(direction: -1 | 1): (tetro: Tetromino) => TetrominoLookahead {
        // move left/right by 1
        return (tetromino) => {
            const lookahead = tetromino.toTetrominoLookahead();
            lookahead.position[1] += direction;
            lookahead.tiles = lookahead.tiles.map(([row, col]) => [
                row,
                col + direction,
            ]);
            return lookahead;
        };
    }
}
