export type KartDirectionPose = {
    frame: string;
    flipX: boolean;
    angle: number;
};

// Pose order matches 8 sectors from atan2 in screen-space:
// 0 E, 1 SE, 2 S, 3 SW, 4 W, 5 NW, 6 N, 7 NE
export const KART_DIRECTION_POSES: KartDirectionPose[] = [
    { frame: 'kart_blue_base_left', flipX: true, angle: 0 },       // E (mirror left)
    { frame: 'kart_blue_base_down_left', flipX: false, angle: 0 },  // SE (mirror SW)
    { frame: 'kart_blue_base_down', flipX: false, angle: 0 },      // S (native)
    { frame: 'kart_blue_base_down_left', flipX: true, angle: 0 }, // SW (mirror SE)
    { frame: 'kart_blue_base_left', flipX: false, angle: 0 },      // W (native)
    { frame: 'kart_blue_base_up_left', flipX: false, angle: 0 },   // NW (native)
    { frame: 'kart_blue_base_up', flipX: false, angle: 0 },        // N (native)
    { frame: 'kart_blue_base_up_left', flipX: true, angle: 0 }     // NE (mirror NW)
];

export const KART_SPIN_POSE_ORDER = [2, 1, 0, 7, 6, 5, 4, 3];

export const getDirectionPoseIndex = (dx: number, dy: number): number | null => {
    if (dx === 0 && dy === 0) {
        return null;
    }

    const angle = Math.atan2(dy, dx);
    const sector = Math.round(angle / (Math.PI / 4));
    return (sector + 8) % 8;
};

export const applyDirectionPose = (sprite: Phaser.GameObjects.Sprite, poseIndex: number) => {
    const pose = KART_DIRECTION_POSES[((poseIndex % 8) + 8) % 8];
    sprite.setFrame(pose.frame);
    sprite.setFlipX(pose.flipX);
    sprite.setAngle(pose.angle);
};
