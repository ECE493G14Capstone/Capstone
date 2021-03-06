import { Level } from "./Level";
import { broadcast } from "./broadcast";

import { TetrominoType } from "common/TetrominoType";
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
    private _randTetros: Array<TetrominoType>;
    private _countdownValue: number;
    private _secondVotingRoundSelection: string;
    private _isGameRunning: boolean;
    private votingInterval!: NodeJS.Timer;
    private broadcastShowVotingSequence: broadcast["showVotingSequence"];
    private broadcastHideVotingSequence: broadcast["hideVotingSequence"];
    private broadcastVotedTetroToSpawn: broadcast["votedTetroToSpawn"];
    private broadcastFinalDecision: broadcast["decision"];
    private broadcastRandomTrade: broadcast["randomTrade"];

    constructor(
        showVotingSequenceEvent: broadcast["showVotingSequence"],
        hideVotingSequenceEvent: broadcast["hideVotingSequence"],
        votedTetroToSpawn: broadcast["votedTetroToSpawn"],
        finalDecision: broadcast["decision"],
        randomTrade: broadcast["randomTrade"]
    ) {
        this._isFirstRoundVoting = true;
        this._isAcceptingVotes = false;
        this._isVoteRunning = false;
        this._previouslyVotedOption = "null";
        this._votingMap = {
            noAction: 0,
            option1: 0,
            option2: 0,
            option3: 0,
        };
        this._randTetros = [];
        this._countdownValue = 10;
        this._secondVotingRoundSelection = "null";
        this._isGameRunning = false;
        this.broadcastShowVotingSequence = showVotingSequenceEvent;
        this.broadcastHideVotingSequence = hideVotingSequenceEvent;
        this.broadcastVotedTetroToSpawn = votedTetroToSpawn;
        this.broadcastFinalDecision = finalDecision;
        this.broadcastRandomTrade = randomTrade;
    }

    get countdownValue(): number {
        return this._countdownValue;
    }

    get randTetros(): Array<TetrominoType> {
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
     * For the duration of the game, spawn in a new voting sequence every 40 seconds.
     * @param level The level object.
     */
    public startVotingLoop(level: Level) {
        this._isGameRunning = true;
        this.votingInterval = setInterval(() => {
            this.generateFirstVotingSequence(level);
        }, 44000);
    }

    /**
     * Stop the voting loop (server stops requesting votes from spectators).
     */
    public stopVotingLoop() {
        this._isGameRunning = false;
        clearInterval(this.votingInterval);
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

        this.broadcastShowVotingSequence("initialDisplay", this._randTetros);
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
            if (this._countdownValue == -1 || !this._isGameRunning) {
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

        this.broadcastShowVotingSequence(votingSet, this._randTetros);
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
        if (!this._isGameRunning) {
            return;
        }

        this.broadcastHideVotingSequence();
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
                    this.broadcastFinalDecision("increased fall rate");
                } else if (this._previouslyVotedOption == "option2") {
                    this.broadcastVotedTetroToSpawn(this._randTetros[0]);
                    this.broadcastFinalDecision(
                        `spawning ${TetrominoType[
                            this._randTetros[0]
                        ].toLowerCase()} pieces`
                    );
                }
                break;
            case "option2":
                if (this._isFirstRoundVoting) {
                    this.getRandTetros();
                    this.generateSecondVotingSequence(
                        "tetrominoSelection",
                        level
                    );
                } else if (this._previouslyVotedOption == "option1") {
                    level.spectatorDecreaseFallRate();
                    this.broadcastFinalDecision("decreased fall rate");
                } else if (this._previouslyVotedOption == "option2") {
                    this.broadcastVotedTetroToSpawn(this._randTetros[1]);
                    this.broadcastFinalDecision(
                        `spawning ${TetrominoType[
                            this._randTetros[1]
                        ].toLowerCase()} pieces`
                    );
                }
                break;
            case "option3":
                if (this._isFirstRoundVoting) {
                    const [playerPair1, playerPair2] = this.getRandomPlayers();
                    this.broadcastRandomTrade(playerPair1, 1);
                    this.broadcastRandomTrade(playerPair2, 2);
                    this.broadcastFinalDecision("random block swap");
                } else if (this._previouslyVotedOption == "option2") {
                    this.broadcastVotedTetroToSpawn(this._randTetros[2]);
                    this.broadcastFinalDecision(
                        `spawning ${TetrominoType[
                            this._randTetros[2]
                        ].toLowerCase()} pieces`
                    );
                }
                break;
        }
    }

    /**
     * Selects 3 random index's from the TetrominoType enum.
     * Saves index's to the _randTetro[] array.
     */
    private getRandTetros() {
        this._randTetros = [];

        let enumIndexs = <TetrominoType[]>(
            Object.values(TetrominoType).filter((x) => typeof x === "number")
        );

        while (this._randTetros.length != 3) {
            const randomIndex =
                enumIndexs[Math.floor(Math.random() * enumIndexs.length)];
            enumIndexs = enumIndexs.filter((index) => index !== randomIndex);
            this._randTetros.push(randomIndex);
        }
    }
    /**
     * Shuffle helper function
     */
    private shuffleArr(arr: Array<number>) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    /**
     * Returns two random pairs of of players
     */
    private getRandomPlayers(): [[number, number], [number, number]] {
        const shuffledPlayers = this.shuffleArr([0, 1, 2, 3]);
        return [
            [shuffledPlayers[0], shuffledPlayers[1]],
            [shuffledPlayers[2], shuffledPlayers[3]],
        ];
    }
}
