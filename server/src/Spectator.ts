import { Level } from "./Level";
import { TetrominoType } from "common/TetrominoType";
import {
    broadcastHideVotingSequence,
    broadcastShowVotingSequence,
} from "../index";

import { ToServerEvents, ToClientEvents } from "common/messages/spectator";
import { Socket } from "socket.io";

type SocketSpectator = Socket<ToServerEvents, ToClientEvents>;

export class Spectator {
    private _isFirstRoundVoting: boolean;
    private _isAcceptingVotes: boolean;
    private _isVoteRunning: boolean;
    private _previouslyVotedOption: string;
    private _votingMap: {
        noAction: number;
        option1: number;
        option2: number;
        option3: number;
    };
    private _countdownValue: number;
    private _secondVotingRoundSelection: string;
    private _randTetros: Array<string>;

    constructor() {
        this._isFirstRoundVoting = true;
        this._isAcceptingVotes = false;
        this._isVoteRunning = false;
        this._randTetros = [];
        this._previouslyVotedOption = "null";
        this._votingMap = {
            noAction: 0,
            option1: 0,
            option2: 0,
            option3: 0,
        };
        this._countdownValue = 10;
        this._secondVotingRoundSelection = "null";
    }

    get countdownValue(): number {
        return this._countdownValue;
    }

    get randTetros(): Array<string> {
        return this._randTetros;
    }

    initSocketListeners(socket: SocketSpectator) {
        socket.on("vote", (votingResult: string) => {
            this.getResult(votingResult);
        });

        socket.on("requestVotingSequence", () => {
            const currentSequence = this.isVoteRunning();
            if (currentSequence) {
                socket.emit(
                    "showVotingSequence",
                    currentSequence,
                    this._randTetros
                );
            }
        });

        socket.on("requestVotingCountdown", () => {
            if (this.isVoteRunning()) {
                socket.emit("sendVotingCountdown", this.countdownValue);
            }
        });
    }

    /**
     * Reset voting counters and any other states.
     */
    private resetVotingRound() {
        this._votingMap.noAction = 0;
        this._votingMap.option1 = 0;
        this._votingMap.option2 = 0;
        this._votingMap.option3 = 0;

        this._isAcceptingVotes = true;
        this._isVoteRunning = true;
        this._countdownValue = 10;
    }

    /**
     * If a vote is currently running, then notify the client to display the voting UI.
     */
    public isVoteRunning(): string {
        if (this._isVoteRunning) {
            if (this._isFirstRoundVoting) {
                return "initialDisplay";
            } else {
                return this._secondVotingRoundSelection;
            }
        }
        return "";
    }

    /**
     * Generate the initial voting display.
     * This voting period will last for 10 seconds.
     * @param level The current level pf the game.
     */
    public generateFirstVotingSequence(level: Level) {
        this._isFirstRoundVoting = true;
        this._previouslyVotedOption = "null";
        this._secondVotingRoundSelection = "null";
        this.resetVotingRound();

        broadcastShowVotingSequence("initialDisplay");
        this.startCountdown();

        setTimeout(() => {
            this.makeDecision(level);
        }, 12000);
    }

    /**
     * Starts a countdown. This is primairly used for clients to sync up with.
     */
    private startCountdown() {
        const interval = setInterval(() => {
            this._countdownValue--;

            // Stop emitting the countdown if it hits -1 (we send '0' and then stop the interval).
            if (this._countdownValue == -1) {
                clearInterval(interval);
            }
        }, 1000);
    }

    /**
     * Generate the second voting sequence based off the past vote.
     * This voting sequence lasts for 10 seconds.
     * @param votingSet Helps the client to know which buttons to display in the new voting sequence.
     * @param level The current level of the game.
     */
    public generateSecondVotingSequence(votingSet: string, level: Level) {
        this._isFirstRoundVoting = false;
        this._secondVotingRoundSelection = votingSet;
        this.resetVotingRound();

        broadcastShowVotingSequence(votingSet);
        this.startCountdown();

        setTimeout(() => {
            this.makeDecision(level);
        }, 12000);
    }

    /**
     * Receive a vote from the client. Keep a running total of the votes.
     * @param vote The vote they selected.
     */
    public getResult(vote: string) {
        if (!this._isAcceptingVotes) {
            return;
        }

        switch (vote) {
            case "noAction":
                this._votingMap.noAction++;
                break;
            case "option1":
                this._votingMap.option1++;
                break;
            case "option2":
                this._votingMap.option2++;
                break;
            case "option3":
                this._votingMap.option3++;
                break;
        }
    }

    /**
     * Using the running total for the votes retreived from the clients,
     * select the highest voted option (or do a random tie break).
     * @param level The current level of the game.
     */
    public makeDecision(level: Level) {
        // FIXME: Ensure the game is still running before continuing.

        broadcastHideVotingSequence();
        this._isAcceptingVotes = false;
        this._isVoteRunning = false;

        // Get value of the most voted option.
        const array: number[] = Object.values(this._votingMap);
        const maxVal = Math.max(...array);

        // Collect all keys that have a matching value (need to tie-break).
        const allOptions = [];
        for (let i = 0; i < Object.keys(this._votingMap).length; i++) {
            if (array[i] == maxVal) {
                allOptions.push(Object.keys(this._votingMap)[i]);
            }
        }

        // Randomly select one of the options.
        const selectedIndex = Math.floor(Math.random() * allOptions.length);

        if (this._isFirstRoundVoting) {
            // If no option was voted on, then don't continue.
            if (maxVal == 0) {
                return;
            }

            // Keep note of the selected option (it may be used in a different voting sequence).
            this._previouslyVotedOption = allOptions[selectedIndex];
        }

        // The option "noAction" will perform no actions. As such, it is excluded from the following switch statement.
        switch (allOptions[selectedIndex]) {
            case "option1":
                if (this._isFirstRoundVoting) {
                    this.generateSecondVotingSequence("fallRate", level);
                } else if (this._previouslyVotedOption == "option1") {
                    level.spectatorIncreaseFallRate();
                } else if (this._previouslyVotedOption == "option2") {
                    // let type = Object.keys(Object.keys(TetrominoType).indexOf(this._randTetros[0]));
                    console.log("Spawning in tetromino"); // FIXME: Need to spawn in a tetromino for the players for 20 seconds.
                }
                break;
            case "option2":
                if (this._isFirstRoundVoting) {
                    this.generateRandTetros(TetrominoType);
                    this.generateSecondVotingSequence(
                        "tetrominoSelection",
                        level
                    );
                } else if (this._previouslyVotedOption == "option1") {
                    level.spectatorDecreaseFallRate();
                } else if (this._previouslyVotedOption == "option2") {
                    console.log("Spawning in tetromino option 2 ..."); // FIXME: Spawn in tetrominos for players for 20 seconds.
                }
                break;
            case "option3":
                if (this._isFirstRoundVoting) {
                    console.log("Randomizing player blocks"); // FIXME: Randomize player blocks.
                } else if (this._previouslyVotedOption == "option2") {
                    console.log("Spawning in tetromino option 3..."); // FIXME: Spawn in tetrominos for players for 20 seconds.
                }
                break;
        }
    }

    private generateRandTetros(tetroTypes: typeof TetrominoType) {
        let enumValues = Object.keys(tetroTypes).filter((item) => {
            return isNaN(Number(item));
        });

        this._randTetros = [];

        while (this._randTetros.length != 3) {
            const randomKey =
                enumValues[Math.floor(Math.random() * enumValues.length)];
            this._randTetros.push(randomKey);
            enumValues = enumValues.filter((e) => e !== randomKey);
        }
    }
}
