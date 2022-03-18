// Import the express in typescript file
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { Level } from "./src/Level";
import { Scoreboard } from "./src/Scoreboard";
import { PlayerQueue } from "./src/PlayerQueue";
import { Spectator } from "./src/Spectator";
import { broadcast } from "./src/broadcast";
import path from "path";

import { ServerToClientEvents, ClientToServerEvents } from "common/message";
import { ColoredScore } from "common/shared";
import { SceneTracker } from "./src/SceneTracker";

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
    io.sockets.emit("toSceneGameArena");
};

const toSceneGameOver: broadcast["toSceneGameOver"] = (
    msg: Array<ColoredScore>
) => {
    scene.setScene("SceneGameOver");
    io.sockets.emit("toSceneGameOver", msg);
};

const showVotingSequence: broadcast["showVotingSequence"] = (
    votingSequence: string
) => {
    io.sockets.emit("showVotingSequence", votingSequence, spectator.randTetros);
};

const hideVotingSequence: broadcast["hideVotingSequence"] = () => {
    io.sockets.emit("hideVotingSequence");
};

const remainingPlayers: broadcast["remainingPlayers"] = (
    playersNeeded: number
) => {
    io.sockets.emit("updateRemainingPlayers", playersNeeded);
};

const fallRate: broadcast["fallRate"] = (fallRate: number) => {
    io.sockets.emit("updateFallRate", fallRate);
};
// ==============================================

console.log(`Server started at port ${port}`);
let playerCounter: 0 | 1 | 2 | 3 = 0; // FIXME: Remove this on final version.
const scoreboard = new Scoreboard(updateScoreboard);
const level = new Level(fallRate);
const queue = new PlayerQueue(remainingPlayers, toSceneGameArena);
const spectator = new Spectator(showVotingSequence, hideVotingSequence);
const scene = new SceneTracker();

/**
 * End the game.
 */
function gameOver() {
    // Show scoreboard to all connected users.
    toSceneGameOver(scoreboard.getFinalScores());

    // Return to starting scene after 30 seconds.
    setTimeout(() => {
        toSceneWaitingRoom();
    }, 30000);
}

io.on("connection", (socket) => {
    scoreboard.initSocketListeners(socket, level);
    spectator.initSocketListeners(socket);
    queue.initSocketListeners(socket);
    scene.initSocketListeners(socket, scoreboard.finalScores);
    level.initSocketListeners(socket);

    if (process.env.VITE_DISABLE_WAITING_ROOM) {
        socket.emit("initPlayer", playerCounter);
        playerCounter += 1;
        playerCounter %= 4;
    }

    socket.on("playerMove", (...args) => {
        socket.broadcast.emit("playerMove", ...args);
    });
    socket.on("playerPlace", (...args) => {
        console.log("player ", args[0], " placed.");
        socket.broadcast.emit("playerPlace", ...args);
    });
});
