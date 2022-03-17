import { TetrominoType } from "common/TetrominoType";

export class RandomBag {
    bagStack: Array<TetrominoType>;

    constructor() {
        this.bagStack = [];
    }

    //using the Fisher Yates algorithm
    private shuffle() {
        let currIdx = this.bagStack.length - 1;

        while (currIdx > 0) {
            const randIdx = Math.floor(Math.random() * currIdx);
            [this.bagStack[currIdx], this.bagStack[randIdx]] = [
                this.bagStack[randIdx],
                this.bagStack[currIdx],
            ];
            currIdx--;
        }
        return this.bagStack;
    }

    private createBag() {
        this.bagStack = [
            TetrominoType.I,
            TetrominoType.J,
            TetrominoType.L,
            TetrominoType.O,
            TetrominoType.S,
            TetrominoType.T,
            TetrominoType.Z,
        ];
        this.shuffle();
    }

    public returnNextPiece() {
        if (this.bagStack.length == 0) {
            this.createBag();
        }
        const nextPiece: TetrominoType =
            this.bagStack[this.bagStack.length - 1];
        this.bagStack.pop();
        return nextPiece;
    }
}
