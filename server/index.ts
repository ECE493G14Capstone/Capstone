// Import the express in typescript file
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { Level } from "./src/Level";
import { Scoreboard } from "./src/Scoreboard";
import { PlayerQueue } from "./src/PlayerQueue";
import { Spectator } from "./src/Spectator";
import { BoardSync } from "./src/BoardSync";
import { broadcast } from "./src/broadcast";
import path from "path";
import { Watchdog } from "watchdog";
import { Trade } from "./src/Trade";

import { ServerToClientEvents, ClientToServerEvents } from "common/message";
import { ColoredScore, BoardState } from "common/shared";
import { SceneTracker } from "./src/SceneTracker";
import { TetrominoType } from "common/TetrominoType";

// Initialize the express engine
const app: express.Application = express();

app.use(function (_, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept"
    );
    next();
});

// host static frontend
app.use("/", express.static(path.join(__dirname, "public")));

const server = http.createServer(app);

// Take a port 3000 for running server.
const port = process.env.PORT || 80;

// Server setup
server.listen(port);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
    cors: {
        origin: "*",
    },
});

// =========== Emit to all sockets ================
const updateScoreboard: broadcast["updateScoreboard"] = (
    msg: Array<ColoredScore>
) => {
    io.sockets.emit("updateScoreboard", msg);
};

const toSceneWaitingRoom: broadcast["toSceneWaitingRoom"] = () => {
    queue.resetQueue();
    level.resetLevel();
    scoreboard.resetScores();
    scene.setScene("SceneWaitingRoom");
    io.sockets.emit("toSceneWaitingRoom");
};

const toSceneGameArena: broadcast["toSceneGameArena"] = () => {
    scene.setScene("SceneGameArena");
    spectator.startVotingLoop(level);
    io.sockets.emit("toSceneGameArena");

    watchdogTimer = new Watchdog(TIMEOUT);
    watchdogTimer.on("reset", () => gameOver());
};

const toSceneGameOver: broadcast["toSceneGameOver"] = (
    msg: Array<ColoredScore>
) => {
    scene.setScene("SceneGameOver");
    spectator.stopVotingLoop();
    io.sockets.emit("toSceneGameOver", msg);

    watchdogTimer.sleep();
};

const showVotingSequence: broadcast["showVotingSequence"] = (
    votingSequence: string,
    randTetros: Array<TetrominoType>
) => {
    io.sockets.emit("showVotingSequence", votingSequence, randTetros);
};

const hideVotingSequence: broadcast["hideVotingSequence"] = () => {
    io.sockets.emit("hideVotingSequence");
};

const remainingPlayers: broadcast["remainingPlayers"] = (
    playersNeeded: number
) => {
    io.sockets.emit("updateRemainingPlayers", playersNeeded);
};

//Currently, the Trade class does normal trades if not given a pair number
//And does random trades if given a pair number

const trader = new Trade(null);

//2 random traders for 2 pairs of random trades
//The pair num is passed to the client so that the client knows which pair its
//piece is to be sent to
const randTradePair = [new Trade(1), new Trade(2)];

const fallRate: broadcast["fallRate"] = (fallRate: number) => {
    io.sockets.emit("updateFallRate", fallRate);
};

const votedTetroToSpawn: broadcast["votedTetroToSpawn"] = (
    type: TetrominoType
) => {
    io.sockets.emit("votedTetroToSpawn", type);
};

const votedDecision: broadcast["decision"] = (votedDecision: string) => {
    io.sockets.emit("decision", votedDecision);
};
// ==============================================

const updateBoard: broadcast["updateBoard"] = (board: BoardState) => {
    io.sockets.emit("updateBoard", board);
};
const randomTrade: broadcast["randomTrade"] = (
    playerIds: [number, number],
    pairNum: 1 | 2
) => {
    io.sockets.emit("randomTrade", playerIds, pairNum);
};

// ==============================================
console.log(`Server started at port ${port}`);
let playerCounter: 0 | 1 | 2 | 3 = 0;
const TIMEOUT = 5000;
const scoreboard = new Scoreboard(updateScoreboard);
const level = new Level(fallRate);
const queue = new PlayerQueue(remainingPlayers, toSceneGameArena);
const spectator = new Spectator(
    showVotingSequence,
    hideVotingSequence,
    votedTetroToSpawn,
    votedDecision,
    randomTrade
);
const scene = new SceneTracker();
const boardSync = new BoardSync(updateBoard);
let isGameOver: boolean = false;

let watchdogTimer: Watchdog;
const watchdogFood = {
    data: "yummy",
    timeout: TIMEOUT,
};

function gameOver() {
    if (isGameOver) {
        return;
    }
    isGameOver = true;

    toSceneGameOver(scoreboard.getFinalScores());

    // Return to starting scene after 30 seconds.
    setTimeout(() => {
        toSceneWaitingRoom();
        isGameOver = false;
    }, 30000);
}

io.on("connection", (socket) => {
    scoreboard.initSocketListeners(socket, level);
    spectator.initSocketListeners(socket);
    queue.initSocketListeners(socket);
    scene.initSocketListeners(socket, scoreboard.finalScores);
    level.initSocketListeners(socket);
    boardSync.initSocketListeners(socket);

    if (process.env.VITE_DISABLE_WAITING_ROOM) {
        socket.emit("initPlayer", playerCounter);
        playerCounter += 1;
        playerCounter %= 4;

        if (watchdogTimer == null) {
            watchdogTimer = new Watchdog(TIMEOUT);
        }
    }

    socket.on("playerMove", (playerId, state) => {
        if (playerId == null) {
            return;
        }

        watchdogTimer.feed(watchdogFood);
        socket.broadcast.emit("playerMove", playerId, state);
    });
    socket.on("playerTrade", (...args) => {
        socket.broadcast.emit("playerTrade", ...args);
        const tetrominoType = args[1];
        trader.addTrade(socket, tetrominoType);
    });
    socket.on(
        "sendRandomPiece",
        (tetrominoType: TetrominoType, pairNum: 1 | 2) => {
            randTradePair[pairNum - 1].addTrade(socket, tetrominoType);
        }
    );
    socket.on("clearTrade", () => {
        trader.clearTrade();
        socket.broadcast.emit("clearTrade");
    });

    socket.on("playerPlace", (playerId, state) => {
        if (playerId == null) {
            return;
        }
        boardSync.updateLastPlacingTS();
        socket.broadcast.emit("playerPlace", playerId, state);
    });

    socket.on("endGame", () => {
        gameOver();
    });

    socket.on("gainPoints", (playerId, score) => {
        scoreboard.incrementScore(playerId, score, level);
    });

    socket.on("losePoints", (playerId) => {
        scoreboard.decrementScore(playerId, 3, level.currentLevel);
    });
});
