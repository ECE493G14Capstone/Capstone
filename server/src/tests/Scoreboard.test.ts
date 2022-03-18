import { Scoreboard } from "../Scoreboard";
import { Level } from "../Level";

describe("Testing 'Spectator'", () => {
    let board: Scoreboard;
    const level: Level = new Level(jest.fn());

    jest.useFakeTimers();
    jest.spyOn(global, "setTimeout");

    beforeEach(() => {
        board = new Scoreboard(jest.fn());
    });

    test("Test Increment User Scores", () => {
        const updateScoreboardUI = jest.spyOn(board, "updateScoreboardUI");

        expect(board.currentTeamScore).toBe(0);
        board.incrementScore(0, 10, level);

        expect(board.orangeScore).toBe(10);
        expect(board.currentTeamScore).toBe(10);
        expect(updateScoreboardUI).toHaveBeenCalled();
    });

    test("Test Resetting AccumulatedScore Upon Level Increment", () => {
        const updateLevel = jest.spyOn(level, "checkUpdateLevel");

        expect(board.accumulatedScore).toBe(0);
        board.incrementScore(0, 10, level);
        expect(board.accumulatedScore).toBe(10);

        board.incrementScore(1, 10, level);
        expect(updateLevel).toHaveBeenCalled();
        expect(board.accumulatedScore).toBe(0);
    });

    test("Test Decrement User Scores", () => {
        const updateScoreboardUI = jest.spyOn(board, "updateScoreboardUI");

        expect(board.orangeScore).toBe(0);
        board.decrementScore(0, 10, level.currentLevel);
        expect(board.orangeScore).toBe(0);

        board.incrementScore(0, 10, level);
        expect(board.orangeScore).toBe(10);

        board.decrementScore(0, 10, level.currentLevel);
        expect(board.orangeScore).toBe(0);
        expect(updateScoreboardUI).toHaveBeenCalled();
    });

    test("Test Get Final Scores", () => {
        expect(board.finalScores.length).toBe(0);
        expect(board.getFinalScores().length).toBe(5);

        // Increment the score and ensure its properly copied into the final scores.
        board.incrementScore(0, 10, level);
        expect(board.getFinalScores()[0].points).toBe(10);
    });
});
