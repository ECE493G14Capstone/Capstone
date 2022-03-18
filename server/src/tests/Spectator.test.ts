import { Spectator } from "../Spectator";
import { Level } from "../Level";

describe("Testing 'Spectator'", () => {
    let spectator: Spectator;
    const level: Level = new Level(jest.fn());

    jest.useFakeTimers();
    jest.spyOn(global, "setTimeout");

    beforeEach(() => {
        spectator = new Spectator(jest.fn(), jest.fn());
    });

    test("Test if Voting State is Maintained", () => {
        expect(spectator.isVoteRunning()).toBe("");
        spectator.generateFirstVotingSequence(level);
        expect(spectator.isVoteRunning()).toBe("initialDisplay");
    });

    test("Test First Voting Sequence", () => {
        expect(spectator.countdownValue).toBe(10);
        spectator.generateFirstVotingSequence(level);

        // Run the countdown to completion. Should expect it to go from 10 -> -1.
        jest.runAllTimers();
        expect(spectator.countdownValue).toBe(-1);

        expect(setTimeout).toHaveBeenCalled();
        expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 10000);
    });

    test("Test Second Voting Sequence", () => {
        expect(spectator.countdownValue).toBe(10);
        spectator.generateSecondVotingSequence("", level);

        // Run the countdown to completion. Should expect it to go from 10 -> -1.
        jest.runAllTimers();
        expect(spectator.countdownValue).toBe(-1);

        expect(setTimeout).toHaveBeenCalled();
        expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 10000);
    });

    test("Test Ensure Voting Sequence is Reset When Starting a Voting Sequence", () => {
        const resetVotingRound = jest.spyOn(
            Spectator.prototype as any,
            "resetVotingRound"
        );

        spectator.generateFirstVotingSequence(level);
        expect(resetVotingRound).toHaveBeenCalled();

        spectator.generateSecondVotingSequence("", level);
        expect(resetVotingRound).toHaveBeenCalled();
    });

    test("Test Voting Decision Making", () => {
        const increaseFallRate = jest.spyOn(level, "spectatorIncreaseFallRate");
        const secondVotingSequence = jest.spyOn(
            spectator,
            "generateSecondVotingSequence"
        );

        expect(spectator.isVoteRunning()).toBe("");
        spectator.generateFirstVotingSequence(level);
        spectator.getResult("option1");
        spectator.makeDecision(level);

        // Second voting round should commence.
        expect(secondVotingSequence).toHaveBeenCalled();

        // Simulate a vote on "option1" (increase fall rate).
        spectator.getResult("option1");
        spectator.makeDecision(level);

        expect(increaseFallRate).toHaveBeenCalled();
    });
});
