import { EventBus } from '../EventBus';
import { Scene } from 'phaser';

type DirectionFrame = {
    frame: string;
    flipX: boolean;
};

export class Game extends Scene
{
    private readonly worldWidth = 3200;
    private readonly worldHeight = 2000;

    private readonly arena = {
        x: 360,
        y: 220,
        width: 2480,
        height: 1560
    };

    private player!: Phaser.Physics.Arcade.Sprite;
    private wallGroup!: Phaser.Physics.Arcade.StaticGroup;

    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private wasd!: {
        W: Phaser.Input.Keyboard.Key;
        A: Phaser.Input.Keyboard.Key;
        S: Phaser.Input.Keyboard.Key;
        D: Phaser.Input.Keyboard.Key;
    };

    private readonly speed = 420;

    // 8-way mapping using the available 7 blue frames.
    // Frame order from sprite sheet spin sequence is:
    // 01 E, 02 SE, 03 S, 04 SW, 05 W, 06 NW, 07 N, and NE mirrors NW.
    private readonly directionFrames: DirectionFrame[] = [
        { frame: 'kart_blue_01', flipX: false }, // E
        { frame: 'kart_blue_02', flipX: false }, // SE
        { frame: 'kart_blue_03', flipX: false }, // S
        { frame: 'kart_blue_04', flipX: false }, // SW
        { frame: 'kart_blue_05', flipX: false }, // W
        { frame: 'kart_blue_06', flipX: false }, // NW
        { frame: 'kart_blue_07', flipX: false }, // N
        { frame: 'kart_blue_06', flipX: true }   // NE (mirrored)
    ];

    constructor ()
    {
        super('Game');
    }

    create ()
    {
        this.physics.world.setBounds(0, 0, this.worldWidth, this.worldHeight);
        this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);

        this.buildGround();
        this.buildArenaWalls();
        this.buildCosmetics();
        this.createPlayer();
        this.setupInput();
        this.setupCamera();

        this.physics.add.collider(this.player, this.wallGroup);

        EventBus.emit('current-scene-ready', this);
    }

    update ()
    {
        const movingLeft = this.cursors.left.isDown || this.wasd.A.isDown;
        const movingRight = this.cursors.right.isDown || this.wasd.D.isDown;
        const movingUp = this.cursors.up.isDown || this.wasd.W.isDown;
        const movingDown = this.cursors.down.isDown || this.wasd.S.isDown;

        const rawX = Number(movingRight) - Number(movingLeft);
        const rawY = Number(movingDown) - Number(movingUp);

        if (rawX === 0 && rawY === 0)
        {
            this.player.setVelocity(0, 0);

            return;
        }

        const vector = new Phaser.Math.Vector2(rawX, rawY).normalize();
        this.player.setVelocity(vector.x * this.speed, vector.y * this.speed);

        this.updateKartDirection(vector.x, vector.y);
    }

    changeScene ()
    {
        this.scene.start('GameOver');
    }

    private buildGround ()
    {
        this.add.rectangle(this.worldWidth / 2, this.worldHeight / 2, this.worldWidth, this.worldHeight, 0x153827)
            .setDepth(0);

        const tileStep = 126;

        for (let y = 0; y < this.worldHeight + tileStep; y += tileStep)
        {
            for (let x = 0; x < this.worldWidth + tileStep; x += tileStep)
            {
                const noise = (x * 13 + y * 7 + x * y) % 100;
                const frame = noise > 73 ? 'tile_dirt' : 'tile_grass';

                const tile = this.add.image(x, y, 'sprite-sheet', frame)
                    .setOrigin(0)
                    .setDisplaySize(tileStep, tileStep)
                    .setDepth(1)
                    .setAlpha(frame === 'tile_dirt' ? 0.3 : 0.38);

                if (frame === 'tile_dirt')
                {
                    tile.setTint(0xcda266);
                }
            }
        }

        const centerX = this.arena.x + this.arena.width / 2;
        const centerY = this.arena.y + this.arena.height / 2;

        // Cosmetic dirt ring around the playable center.
        for (let i = 0; i < 16; i++)
        {
            const angle = (Math.PI * 2 * i) / 16;
            const patchX = centerX + Math.cos(angle) * 410;
            const patchY = centerY + Math.sin(angle) * 260;

            this.add.image(patchX, patchY, 'sprite-sheet', 'tile_dirt')
                .setDisplaySize(160, 120)
                .setDepth(2)
                .setAlpha(0.25);
        }
    }

    private buildArenaWalls ()
    {
        this.wallGroup = this.physics.add.staticGroup();

        const { x, y, width, height } = this.arena;
        const t = 60;

        // Outer rectangular border blockers (matching the sketch boundary).
        this.addWallBlock(x + width / 2, y + t / 2, width, t);
        this.addWallBlock(x + width / 2, y + height - t / 2, width, t);
        this.addWallBlock(x + t / 2, y + height / 2, t, height);
        this.addWallBlock(x + width - t / 2, y + height / 2, t, height);

        // Corner square wall blocks.
        const cornerSize = 210;
        this.addWallBlock(x + 250, y + 250, cornerSize, cornerSize, 'weapon_crate_a', 0xe7c58f);
        this.addWallBlock(x + width - 250, y + 250, cornerSize, cornerSize, 'weapon_crate_a', 0xe7c58f);
        this.addWallBlock(x + 250, y + height - 250, cornerSize, cornerSize, 'weapon_crate_b', 0xe7c58f);
        this.addWallBlock(x + width - 250, y + height - 250, cornerSize, cornerSize, 'weapon_crate_b', 0xe7c58f);

        // Inner L-shaped wall blockers.
        const cx = x + width / 2;
        const cy = y + height / 2;

        const leftX = cx - 340;
        const rightX = cx + 340;
        const topY = cy - 260;
        const bottomY = cy + 260;
        const arm = 240;
        const wallT = 58;

        // Top-left L
        this.addWallBlock(leftX + arm / 2, topY, arm, wallT);
        this.addWallBlock(leftX, topY + arm / 2, wallT, arm);

        // Top-right L
        this.addWallBlock(rightX - arm / 2, topY, arm, wallT);
        this.addWallBlock(rightX, topY + arm / 2, wallT, arm);

        // Bottom-left L
        this.addWallBlock(leftX, bottomY - arm / 2, wallT, arm);
        this.addWallBlock(leftX + arm / 2, bottomY, arm, wallT);

        // Bottom-right L
        this.addWallBlock(rightX, bottomY - arm / 2, wallT, arm);
        this.addWallBlock(rightX - arm / 2, bottomY, arm, wallT);
    }

    private addWallBlock (
        x: number,
        y: number,
        width: number,
        height: number,
        frame = 'tile_stone_wall',
        tint = 0xf0e6d2
    )
    {
        const wall = this.wallGroup.create(x, y, 'sprite-sheet', frame) as Phaser.Physics.Arcade.Sprite;

        wall.setDisplaySize(width, height)
            .setDepth(20)
            .setTint(tint)
            .setAlpha(0.95)
            .refreshBody();
    }

    private buildCosmetics ()
    {
        const cx = this.arena.x + this.arena.width / 2;
        const cy = this.arena.y + this.arena.height / 2;

        // Non-functional visual props and accents.
        this.add.image(cx - 520, cy - 360, 'sprite-sheet', 'tile_wood_fence')
            .setDisplaySize(260, 120)
            .setDepth(6)
            .setAlpha(0.45);

        this.add.image(cx + 520, cy - 360, 'sprite-sheet', 'tile_wood_fence')
            .setDisplaySize(260, 120)
            .setDepth(6)
            .setAlpha(0.45);

        this.add.image(cx - 520, cy + 360, 'sprite-sheet', 'tile_cliff_water_edge')
            .setDisplaySize(260, 120)
            .setDepth(6)
            .setAlpha(0.45);

        this.add.image(cx + 520, cy + 360, 'sprite-sheet', 'tile_cliff_water_edge')
            .setDisplaySize(260, 120)
            .setDepth(6)
            .setAlpha(0.45);

        this.add.image(cx, cy, 'sprite-sheet', 'tile_start_checker')
            .setDisplaySize(160, 120)
            .setDepth(7)
            .setAlpha(0.5);
    }

    private createPlayer ()
    {
        const spawnX = this.arena.x + this.arena.width / 2;
        const spawnY = this.arena.y + this.arena.height / 2;

        this.player = this.physics.add.sprite(spawnX, spawnY, 'sprite-sheet', 'kart_blue_01')
            .setScale(1.35)
            .setDepth(30);

        this.player.setCollideWorldBounds(true);

        const body = this.player.body as Phaser.Physics.Arcade.Body;
        body.setSize(56, 56, true);
        body.setOffset((this.player.width - 56) / 2, (this.player.height - 56) / 2);

        this.player.setFrame('kart_blue_01');
    }

    private setupInput ()
    {
        this.cursors = this.input.keyboard!.createCursorKeys();

        this.wasd = this.input.keyboard!.addKeys({
            W: Phaser.Input.Keyboard.KeyCodes.W,
            A: Phaser.Input.Keyboard.KeyCodes.A,
            S: Phaser.Input.Keyboard.KeyCodes.S,
            D: Phaser.Input.Keyboard.KeyCodes.D
        }) as {
            W: Phaser.Input.Keyboard.Key;
            A: Phaser.Input.Keyboard.Key;
            S: Phaser.Input.Keyboard.Key;
            D: Phaser.Input.Keyboard.Key;
        };
    }

    private setupCamera ()
    {
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this.cameras.main.setZoom(1.18);
        this.cameras.main.setDeadzone(220, 130);
    }

    private updateKartDirection (dx: number, dy: number)
    {
        // Convert movement vector into one of 8 sectors.
        const angle = Math.atan2(dy, dx);
        const sector = Math.round(angle / (Math.PI / 4));
        const index = (sector + 8) % 8;

        const direction = this.directionFrames[index];

        this.player.setFrame(direction.frame);
        this.player.setFlipX(direction.flipX);
    }
}
