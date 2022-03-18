import * as sceneWaitingRoomMsgs from "./messages/sceneWaitingRoom";
import * as sceneGameArenaMsgs from "./messages/sceneGameArena";
import * as gameMsgs from "./messages/game";
import * as scoreboardMsgs from "./messages/scoreboard";
import * as spectatorMsgs from "./messages/spectator";
import * as sceneGameOverMsgs from "./messages/sceneGameOver";
import * as tetrominoMsgs from "./messages/tetromino";
import { TetrominoType } from "./TetrominoType";

export type ServerToClientEvents = sceneWaitingRoomMsgs.ToClientEvents &
    sceneGameArenaMsgs.ToClientEvents &
    gameMsgs.ToClientEvents &
    scoreboardMsgs.ToClientEvents &
    spectatorMsgs.ToClientEvents &
    sceneGameOverMsgs.ToClientEvents &
    tetrominoMsgs.ToClientEvents;

export type ClientToServerEvents = sceneWaitingRoomMsgs.ToServerEvents &
    sceneGameArenaMsgs.ToServerEvents &
    gameMsgs.ToClientEvents &
    scoreboardMsgs.ToServerEvents &
    spectatorMsgs.ToServerEvents &
    sceneGameOverMsgs.ToServerEvents &
    tetrominoMsgs.ToServerEvents;

export type PlayerID = 0 | 1 | 2 | 3;

export type TetrominoState = {
    type: TetrominoType;
    position: [number, number];
    rotation: 0 | 1 | 2 | 3;
};
