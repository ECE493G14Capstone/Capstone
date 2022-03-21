import { Spectator } from "../Spectator";
import { Level } from "../Level";

describe("Testing 'Spectator'", () => {
    let spectator: Spectator;
    const level: Level = new Level(jest.fn());

    jest.useFakeTimers();
    jest.spyOn(global, "setTimeout");
    jest.spyOn(global, "setInterval");

    beforeEach(() => {
        spectator = new Spectator(jest.fn(), jest.fn(), jest.fn());
    });

    test("Test if Voting State is Maintained", () => {
        expect(spectator.isVoteRunning()).toBe("");
        spectator.generateFirstVotingSequence(level);
        expect(spectator.isVoteRunning()).toBe("initialDisplay");
    });

    test("Test First Voting Sequence", () => {
        expect(spectator.countdownValue).toBe(10);
        spectator.generateFirstVotingSequence(level);

        jest.runAllTimers();
        expect(spectator.countdownValue).toBe(9);

        expect(setTimeout).toHaveBeenCalled();

        // From the client's perspective, they still get a voting option for 10 seconds.
        // The server makes a decision in 12 seconds to give a small buffer between voting rounds.
        expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 12000);
    });

    test("Test Second Voting Sequence", () => {
        expect(spectator.countdownValue).toBe(10);
        spectator.generateSecondVotingSequence("", level);

        jest.runAllTimers();
        expect(spectator.countdownValue).toBe(9);

        expect(setTimeout).toHaveBeenCalled();

        // From the client's perspective, they still get a voting option for 10 seconds.
        // The server makes a decision in 12 seconds to give a small buffer between voting rounds.
        expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 12000);
    });

    test("Test Voting Loop", () => {
        spectator.startVotingLoop(level);
        expect(setInterval).toHaveBeenCalled();
        expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 44000);
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
        spectator.startVotingLoop(level);
        spectator.generateFirstVotingSequence(level);
        expect(spectator.isVoteRunning()).toBe("initialDisplay");
        spectator.getResult("option1");
        spectator.makeDecision(level);
        expect(spectator.isVoteRunning()).toBe("fallRate");

        // Second voting round should commence.
        expect(secondVotingSequence).toHaveBeenCalled();

        // Simulate a vote on "option1" (increase fall rate).
        spectator.getResult("option1");
        spectator.makeDecision(level);

        expect(increaseFallRate).toHaveBeenCalled();
    });
});
