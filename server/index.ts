// Import the express in typescript file
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import { Level } from "./typescript/Level";
import { Scoreboard } from "./typescript/Scoreboard";
import path from "path";

import { ServerToClientEvents, ClientToServerEvents } from "common/message";

interface InterServerEvents {
  ping: () => void;
}

interface SocketData {
  name: string;
  age: number;
}
// =================== grab from tutorial ==============

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

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(server, {
  cors: {
    origin: "*",
  },
});

console.log("Server started");
let playerCounter: 0 | 1 | 2 | 3 = 0;
let scoreboard = new Scoreboard();
let level = new Level();

// Emit to all sockets.
export function broadcastUpdateScoreboard(msg: any) {
  io.sockets.emit("updateScoreboard", msg);
}

// Emit to all sockets.
export function broadcastEndSequence(msg: any) {
  io.sockets.emit("endSequence", msg);
}

// Emit to all sockets.
export function broadcastStartSequence() {
  io.sockets.emit("startSequence");
}

io.on("connection", (socket) => {
  socket.emit("initPlayer", playerCounter)
  playerCounter += 1
  playerCounter %= 4

  // Notify the client of the current scores of the players.
  // FIXME: This should check if a game is currently running before calling this function.
  scoreboard.updateScoreboardUI(level.currentLevel);

  // Uncomment the following to view the scoreboard update:
  setTimeout(() => {
    scoreboard.incrementScore(4, 5, level);
    scoreboard.incrementScore(2, 2, level);
    scoreboard.incrementScore(3, 1, level);
  }, 1000);

  // Uncomment to view the game end sequence:
  // setTimeout(() => {
  //   scoreboard.displayFullScreenUI();
  // }, 2000);

  // works when broadcast to all
  // io.emit("noArg");
  // works when broadcasting to a room
  // io.to("room1").emit("basicEmit", 1, "2", Buffer.from([3]));

  socket.on("playerMove", (...args) => {
    socket.broadcast.emit("playerMove", ...args);
  });

  socket.on("scoreboardData", () => {
    let clonedData = Object.assign([], scoreboard.scoreMap);
    clonedData.push({
      color: "Level",
      hex: 0xFFFFFF,
      points: level.currentLevel
    });

    socket.emit("updateScoreboard", clonedData)
  });

  // socket.on("playerAction", ({event, playerId}) => {
  //   console.log(`received event: `, event, ", from id: ", playerId)
  //   socket.broadcast.emit("playerAction", {event, playerId})
  // })
});
