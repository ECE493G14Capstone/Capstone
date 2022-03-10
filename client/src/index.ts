import Phaser from "phaser";

import { SceneWaitingRoom } from "./scene/SceneWaitingRoom";
import { SceneGameArena } from "./scene/SceneGameArena";
import { SceneGameOver } from "./scene/SceneGameOver";
import { BOARD_SIZE, TILE_SIZE } from "common/shared";

const config = {
    type: Phaser.AUTO,
    parent: "root",
    width: BOARD_SIZE * TILE_SIZE,
    height: BOARD_SIZE * TILE_SIZE,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: import.meta.env.VITE_DISABLE_WAITING_ROOM
        ? [SceneGameArena, SceneGameOver]
        : [SceneWaitingRoom, SceneGameArena, SceneGameOver],
};

const game = new Phaser.Game(config);

if (import.meta.env.VITE_DISABLE_WAITING_ROOM) {
    game.scene.start("SceneGameArena");
} else {
    game.scene.start("SceneWaitingRoom");
}
