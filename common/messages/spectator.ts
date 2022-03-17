export interface ToClientEvents {
    showVotingSequence: (
        votingSequence: string,
        randTetros: Array<string>
    ) => void;
    hideVotingSequence: () => void;
    sendVotingCountdown: (secondsLeft: number) => void;
}

export interface ToServerEvents {
    requestVotingSequence: () => void;
    vote: (playerVote: "option1" | "option2" | "option3" | "noAction") => void;
    requestVotingCountdown: () => void;
}
