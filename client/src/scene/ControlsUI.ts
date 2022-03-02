import { SceneGameArena } from "./SceneGameArena";
import { BOARD_SIZE } from "common/shared";

export class ControlsUI {
    constructor(scene: SceneGameArena, keys: Array<string>) {
        let y = 615;
        let index = 0;
        const controlInfo = [
            "Move Left",
            "Move Right",
            "Move Down",
            "Rotate CCW",
            "Rotate CW",
        ];

        scene.add
            .image(BOARD_SIZE * 3, BOARD_SIZE * 17, "controlFrame")
            .setScale(1.1);

        for (const key of keys) {
            scene.add.image(70, y, key).setScale(0.2);

            scene.add
                .text(90, y - 10, controlInfo[index++], {
                    fontSize: `20px`,
                    fontFamily: "VT323",
                })
                .setTint(0xffffff);

            y += 40;
        }
    }
}
