import { EventBus } from '../EventBus';
import { Scene } from 'phaser';
import type { MultiplayerSession, PlayerState, PositionPayload, RoomState, KillEvent } from '../net/multiplayer';
import { applyDirectionPose, getDirectionPoseIndex } from '../kartDirection';

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

    private multiplayerSession?: MultiplayerSession;
    private multiplayerTornDown = false;
    private remotePlayers = new Map<string, Phaser.GameObjects.Sprite>();
    private lastPositionSentAt = 0;
    private readonly positionSendIntervalMs = 60;
    private roomCodeText?: Phaser.GameObjects.Text;
    private leaderboardTitleText?: Phaser.GameObjects.Text;
    private leaderboardText?: Phaser.GameObjects.Text;
    private localScoreTitleText?: Phaser.GameObjects.Text;
    private localScoreText?: Phaser.GameObjects.Text;
    private controlsHintText?: Phaser.GameObjects.Text;
    private spectatorBannerText?: Phaser.GameObjects.Text;
    private timerText?: Phaser.GameObjects.Text;
    private killFeedTexts: Phaser.GameObjects.Text[] = [];
    private escapeKey?: Phaser.Input.Keyboard.Key;
    private isExiting = false;
    private isSpectator = false;
    private spectatorCamTarget?: Phaser.GameObjects.Rectangle;

    constructor ()
    {
        super('Game');
    }

    create ()
    {
        this.multiplayerTornDown = false;
        this.isExiting = false;

        // Determine if spectator
        const session = this.registry.get('multiplayer:session') as MultiplayerSession | undefined;
        this.isSpectator = session?.role === 'spectator';

        this.physics.world.setBounds(0, 0, this.worldWidth, this.worldHeight);
        this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);

        this.buildGround();
        this.buildArenaWalls();
        this.buildCosmetics();

        if (!this.isSpectator) {
            this.createPlayer();
            this.setupInput();
            this.setupCamera();
            this.physics.add.collider(this.player, this.wallGroup);
        } else {
            this.setupSpectatorCamera();
        }

        this.createHud();
        this.setupMultiplayer();

        this.events.once('shutdown', this.onSceneShutdown);

        EventBus.emit('current-scene-ready', this);
    }

    update (time: number)
    {
        if (this.escapeKey && Phaser.Input.Keyboard.JustDown(this.escapeKey))
        {
            this.exitToMainMenu();
            return;
        }

        // Spectators don't have a player to move
        if (this.isSpectator) {
            this.updateSpectatorCamera();
            return;
        }

        const movingLeft = this.cursors.left.isDown || this.wasd.A.isDown;
        const movingRight = this.cursors.right.isDown || this.wasd.D.isDown;
        const movingUp = this.cursors.up.isDown || this.wasd.W.isDown;
        const movingDown = this.cursors.down.isDown || this.wasd.S.isDown;

        const rawX = Number(movingRight) - Number(movingLeft);
        const rawY = Number(movingDown) - Number(movingUp);

        if (rawX === 0 && rawY === 0)
        {
            this.player.setVelocity(0, 0);
            this.sendLocalPosition(time);
            return;
        }

        const vector = new Phaser.Math.Vector2(rawX, rawY).normalize();
        this.player.setVelocity(vector.x * this.speed, vector.y * this.speed);
        this.applyDirectionToSprite(this.player, vector.x, vector.y);
        this.sendLocalPosition(time);
    }

    changeScene ()
    {
        this.scene.start('GameOver');
    }

    private onSceneShutdown = () =>
    {
        this.teardownMultiplayer();
    };

    private exitToMainMenu ()
    {
        if (this.isExiting)
        {
            return;
        }

        this.isExiting = true;
        this.teardownMultiplayer();
        EventBus.emit('game-session-ended');
        this.scene.start('MainMenu');
    }

    private setupMultiplayer ()
    {
        const session = this.registry.get('multiplayer:session') as MultiplayerSession | undefined;

        if (!session?.socket || !session.roomCode)
        {
            return;
        }

        this.multiplayerSession = session;

        if (!this.isSpectator) {
            const localSnapshot = session.room.players.find((player) => player.id === session.playerId);
            if (localSnapshot && this.player)
            {
                this.player.setPosition(localSnapshot.position.x, localSnapshot.position.y);
                this.applyDirectionToSprite(this.player, localSnapshot.velocity.x, localSnapshot.velocity.y);
            }
        }

        this.bindMultiplayerEvents();
        this.hydrateRemotePlayersFromRoom(session.room);
        this.setRoomConnectionStatus(session.roomCode, true);
        this.refreshHudFromRoom(session.room);

        if (!this.isSpectator) {
            this.sendLocalPosition(this.time.now, true);
        }
    }

    private bindMultiplayerEvents ()
    {
        if (!this.multiplayerSession)
        {
            return;
        }

        const { socket } = this.multiplayerSession;

        socket.on('room:position', this.handleRoomPosition);
        socket.on('room:state', this.handleRoomState);
        socket.on('room:player_joined', this.handlePlayerJoined);
        socket.on('room:player_left', this.handlePlayerLeft);
        socket.on('room:kill', this.handleKillEvent);
        socket.on('room:game_ended', this.handleGameEnded);
        socket.on('disconnect', this.handleSocketDisconnect);
    }

    private unbindMultiplayerEvents ()
    {
        if (!this.multiplayerSession)
        {
            return;
        }

        const { socket } = this.multiplayerSession;

        socket.off('room:position', this.handleRoomPosition);
        socket.off('room:state', this.handleRoomState);
        socket.off('room:player_joined', this.handlePlayerJoined);
        socket.off('room:player_left', this.handlePlayerLeft);
        socket.off('room:kill', this.handleKillEvent);
        socket.off('room:game_ended', this.handleGameEnded);
        socket.off('disconnect', this.handleSocketDisconnect);
    }

    private handleRoomPosition = (payload: PositionPayload) =>
    {
        const session = this.multiplayerSession;
        if (!session || payload.roomCode !== session.roomCode || payload.playerId === session.playerId)
        {
            return;
        }

        const remote = this.ensureRemotePlayer(payload.playerId, payload.position.x, payload.position.y);
        const deltaX = payload.velocity?.x ?? payload.position.x - remote.x;
        const deltaY = payload.velocity?.y ?? payload.position.y - remote.y;

        remote.setPosition(payload.position.x, payload.position.y);
        this.applyDirectionToSprite(remote, deltaX, deltaY);
    };

    private handleRoomState = (payload: { room: RoomState; serverTime: number; tickRate: number }) =>
    {
        const session = this.multiplayerSession;
        if (!session || payload.room.code !== session.roomCode)
        {
            return;
        }

        session.room = payload.room;
        this.hydrateRemotePlayersFromRoom(payload.room);
        this.refreshHudFromRoom(payload.room);
    };

    private handlePlayerJoined = (payload: { roomCode: string; player?: PlayerState; playerId?: string }) =>
    {
        const session = this.multiplayerSession;
        if (!session || payload.roomCode !== session.roomCode)
        {
            return;
        }

        const joinedPlayer = payload.player;
        if (joinedPlayer && joinedPlayer.id !== session.playerId)
        {
            const alreadyInRoom = session.room.players.some((player) => player.id === joinedPlayer.id);
            if (!alreadyInRoom)
            {
                session.room.players.push(joinedPlayer);
            }

            const remote = this.ensureRemotePlayer(joinedPlayer.id, joinedPlayer.position.x, joinedPlayer.position.y);
            this.applyDirectionToSprite(remote, joinedPlayer.velocity.x, joinedPlayer.velocity.y);
        }

        this.refreshHudFromRoom(session.room);
    };

    private handlePlayerLeft = (payload: { roomCode: string; playerId: string }) =>
    {
        const session = this.multiplayerSession;
        if (!session || payload.roomCode !== session.roomCode)
        {
            return;
        }

        this.removeRemotePlayer(payload.playerId);
        session.room.players = session.room.players.filter((player) => player.id !== payload.playerId);
        this.refreshHudFromRoom(session.room);
    };

    private handleSocketDisconnect = () =>
    {
        const roomCode = this.multiplayerSession?.roomCode ?? '----';
        this.setRoomConnectionStatus(roomCode, false);
    };

    private hydrateRemotePlayersFromRoom (room: RoomState)
    {
        const session = this.multiplayerSession;
        if (!session)
        {
            return;
        }

        const remoteIds = new Set<string>();

        room.players.forEach((player) => {
            // Spectators see all players as remote; regular players skip themselves
            if (!this.isSpectator && player.id === session.playerId)
            {
                return;
            }

            remoteIds.add(player.id);
            const remote = this.ensureRemotePlayer(player.id, player.position.x, player.position.y);
            this.applyDirectionToSprite(remote, player.velocity.x, player.velocity.y);
        });

        for (const playerId of this.remotePlayers.keys())
        {
            if (!remoteIds.has(playerId))
            {
                this.removeRemotePlayer(playerId);
            }
        }
    }

    private ensureRemotePlayer (playerId: string, x: number, y: number)
    {
        let remote = this.remotePlayers.get(playerId);
        if (!remote)
        {
            remote = this.add.sprite(x, y, 'kart-sheet', 'kart_blue_base_down')
                .setScale(0.56)
                .setDepth(28);
            this.remotePlayers.set(playerId, remote);
        }

        return remote;
    }

    private removeRemotePlayer (playerId: string)
    {
        const remote = this.remotePlayers.get(playerId);
        if (!remote)
        {
            return;
        }

        remote.destroy();
        this.remotePlayers.delete(playerId);
    }

    private sendLocalPosition (time: number, force = false)
    {
        const session = this.multiplayerSession;
        if (!session || !session.socket.connected)
        {
            return;
        }

        if (!force && time - this.lastPositionSentAt < this.positionSendIntervalMs)
        {
            return;
        }

        const body = this.player.body as Phaser.Physics.Arcade.Body;

        const payload: PositionPayload = {
            roomCode: session.roomCode,
            playerId: session.playerId,
            position: {
                x: this.player.x,
                y: this.player.y
            },
            velocity: {
                x: body.velocity.x,
                y: body.velocity.y
            },
            rotation: this.player.rotation,
            ts: Date.now()
        };

        session.socket.emit('player:position', payload);
        this.lastPositionSentAt = time;
    }

    private teardownMultiplayer ()
    {
        if (this.multiplayerTornDown)
        {
            return;
        }

        this.multiplayerTornDown = true;
        this.unbindMultiplayerEvents();

        if (this.multiplayerSession?.socket.connected)
        {
            this.multiplayerSession.socket.emit('room:leave', {
                roomCode: this.multiplayerSession.roomCode,
                playerId: this.multiplayerSession.playerId
            });
            this.multiplayerSession.socket.disconnect();
        }

        this.registry.remove('multiplayer:session');
        this.multiplayerSession = undefined;
        this.lastPositionSentAt = 0;

        this.remotePlayers.forEach((remotePlayer) => remotePlayer.destroy());
        this.remotePlayers.clear();

        [
            this.roomCodeText,
            this.leaderboardTitleText,
            this.leaderboardText,
            this.localScoreTitleText,
            this.localScoreText,
            this.controlsHintText
        ].forEach((hudText) => hudText?.destroy());

        this.roomCodeText = undefined;
        this.leaderboardTitleText = undefined;
        this.leaderboardText = undefined;
        this.localScoreTitleText = undefined;
        this.localScoreText = undefined;
        this.controlsHintText = undefined;
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

        this.player = this.physics.add.sprite(spawnX, spawnY, 'kart-sheet', 'kart_blue_base_down')
            .setScale(0.56)
            .setDepth(30);

        this.player.setCollideWorldBounds(true);

        const body = this.player.body as Phaser.Physics.Arcade.Body;
        body.setSize(68, 68, true);
        body.setOffset((this.player.width - 68) / 2, (this.player.height - 68) / 2);

        this.player.setFrame('kart_blue_base_down');
    }

    private setupInput ()
    {
        this.cursors = this.input.keyboard!.createCursorKeys();
        this.escapeKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

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

    private createHud ()
    {
        const { width, height } = this.scale;

        this.add.rectangle(width / 2, 60, width, 120, 0x0a0503, 0.42)
            .setDepth(110)
            .setScrollFactor(0);
        this.add.rectangle(width / 2, height - 22, width, 44, 0x0a0503, 0.34)
            .setDepth(110)
            .setScrollFactor(0);

        this.roomCodeText = this.add.text(22, height - 22, 'ROOM: ---- • OFFLINE', {
            fontFamily: 'Cinzel',
            fontSize: '20px',
            color: '#f9e6bd',
            stroke: '#2a170d',
            strokeThickness: 4
        }).setOrigin(0, 0.5).setDepth(120).setScrollFactor(0);

        this.controlsHintText = this.add.text(width / 2, height - 22,
            this.isSpectator
                ? 'SPECTATOR MODE  \u2022  ESC to return menu'
                : 'WASD / Arrow Keys to drive  \u2022  ESC to return menu', {
            fontFamily: 'Cinzel',
            fontSize: '19px',
            color: '#f9e6bd',
            stroke: '#2a170d',
            strokeThickness: 4
        }).setOrigin(0.5, 0.5).setDepth(120).setScrollFactor(0);

        if (this.isSpectator) {
            this.spectatorBannerText = this.add.text(width / 2, 126, '\uD83D\uDCFA SPECTATING', {
                fontFamily: 'Cinzel',
                fontStyle: 'bold',
                fontSize: '28px',
                color: '#66bb6a',
                stroke: '#2a170d',
                strokeThickness: 5
            }).setOrigin(0.5).setDepth(125).setScrollFactor(0);
        }

        this.leaderboardTitleText = this.add.text(22, 12, 'LEADERBOARD', {
            fontFamily: 'Cinzel',
            fontStyle: 'bold',
            fontSize: '24px',
            color: '#f9e6bd',
            stroke: '#2a170d',
            strokeThickness: 4
        }).setOrigin(0, 0).setDepth(120).setScrollFactor(0);

        this.leaderboardText = this.add.text(22, 40, 'Waiting for players...', {
            fontFamily: 'Cinzel',
            fontSize: '18px',
            color: '#f2d9aa',
            stroke: '#2a170d',
            strokeThickness: 3,
            lineSpacing: 2
        }).setOrigin(0, 0).setDepth(120).setScrollFactor(0);

        this.localScoreTitleText = this.add.text(width - 22, 12, 'YOUR SCORE', {
            fontFamily: 'Cinzel',
            fontStyle: 'bold',
            fontSize: '24px',
            color: '#f9e6bd',
            stroke: '#2a170d',
            strokeThickness: 4
        }).setOrigin(1, 0).setDepth(120).setScrollFactor(0);

        this.localScoreText = this.add.text(width - 22, 40, 'Kills: 0\nDeaths: 0\nK/D: 0.00', {
            fontFamily: 'Cinzel',
            fontSize: '19px',
            color: '#f2d9aa',
            stroke: '#2a170d',
            strokeThickness: 3,
            align: 'right',
            lineSpacing: 2
        }).setOrigin(1, 0).setDepth(120).setScrollFactor(0);
    }

    private setRoomConnectionStatus (roomCode: string, isOnline: boolean)
    {
        if (!this.roomCodeText)
        {
            return;
        }

        const status = isOnline ? 'ONLINE' : 'OFFLINE';
        this.roomCodeText.setText(`ROOM: ${roomCode} • ${status}`);
    }

    private refreshHudFromRoom (room: RoomState)
    {
        const session = this.multiplayerSession;
        if (!session)
        {
            return;
        }

        this.setRoomConnectionStatus(room.code, session.socket.connected);

        const rankedPlayers = [...room.players].sort((a, b) =>
            (b.kills - a.kills) ||
            (a.deaths - b.deaths) ||
            a.name.localeCompare(b.name)
        );

        if (this.leaderboardText)
        {
            const lines = rankedPlayers.map((player, index) => {
                const label = this.trimPlayerName(player.name, 12);
                const marker = player.id === session.playerId ? '>' : ' ';
                return `${marker}${index + 1}. ${label}  K:${player.kills} D:${player.deaths}`;
            });
            this.leaderboardText.setText(lines.length > 0 ? lines.join('\n') : 'No players in room');
        }

        if (this.localScoreText)
        {
            const me = room.players.find((player) => player.id === session.playerId);
            if (!me)
            {
                this.localScoreText.setText('Kills: 0\nDeaths: 0\nK/D: 0.00');
                return;
            }

            const kd = me.deaths === 0 ? me.kills : me.kills / me.deaths;
            this.localScoreText.setText(
                `Kills: ${me.kills}\nDeaths: ${me.deaths}\nK/D: ${kd.toFixed(2)}`
            );
        }
    }

    private trimPlayerName (name: string, maxChars: number)
    {
        if (name.length <= maxChars)
        {
            return name;
        }

        return `${name.slice(0, Math.max(1, maxChars - 3))}...`;
    }

    private setupCamera ()
    {
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this.cameras.main.setZoom(1.18);
        this.cameras.main.setDeadzone(220, 130);
    }

    private setupSpectatorCamera ()
    {
        // Create an invisible target for the spectator camera at arena center
        const cx = this.arena.x + this.arena.width / 2;
        const cy = this.arena.y + this.arena.height / 2;
        this.spectatorCamTarget = this.add.rectangle(cx, cy, 1, 1, 0x000000, 0).setDepth(0);
        this.cameras.main.startFollow(this.spectatorCamTarget, true, 0.05, 0.05);
        this.cameras.main.setZoom(0.82);

        // Setup minimal input for spectator (just escape)
        this.escapeKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    }

    private updateSpectatorCamera ()
    {
        // Auto-follow the player with the most recent action
        if (!this.spectatorCamTarget) return;

        const session = this.multiplayerSession;
        if (!session || session.room.players.length === 0) return;

        // Follow the player with the most kills (most interesting)
        const topPlayer = [...session.room.players].sort((a, b) => b.kills - a.kills)[0];
        const remote = this.remotePlayers.get(topPlayer.id);
        if (remote) {
            this.spectatorCamTarget.setPosition(
                Phaser.Math.Linear(this.spectatorCamTarget.x, remote.x, 0.03),
                Phaser.Math.Linear(this.spectatorCamTarget.y, remote.y, 0.03)
            );
        }
    }

    private handleKillEvent = (payload: KillEvent) =>
    {
        const session = this.multiplayerSession;
        if (!session || payload.roomCode !== session.roomCode) return;

        // Show kill in kill feed
        this.addKillFeedEntry(`${payload.attackerName} killed ${payload.victimName}`);

        // Camera shake effect for spectators on kill
        if (this.isSpectator) {
            this.cameras.main.shake(200, 0.005);
        }

        // Forward kill to React for prediction market updates
        EventBus.emit('game:kill-event', payload);
    };

    private handleGameEnded = (payload: { room: RoomState; winner?: string; mostDeaths?: string }) =>
    {
        const session = this.multiplayerSession;
        if (!session) return;

        session.room = payload.room;
        EventBus.emit('game:ended', payload);

        // Show game over overlay
        this.time.delayedCall(2000, () => {
            this.teardownMultiplayer();
            this.scene.start('GameOver');
        });
    };

    private addKillFeedEntry (text: string)
    {
        const { width } = this.scale;

        const entry = this.add.text(width - 22, 80, text, {
            fontFamily: 'Cinzel',
            fontSize: '18px',
            color: '#ff6b6b',
            stroke: '#2a170d',
            strokeThickness: 3
        }).setOrigin(1, 0).setDepth(130).setScrollFactor(0).setAlpha(1);

        // Push existing entries down
        this.killFeedTexts.forEach((t, i) => {
            t.y += 24;
            if (i > 3) { t.destroy(); }
        });
        this.killFeedTexts = [entry, ...this.killFeedTexts.slice(0, 4)];

        // Fade out after 4 seconds
        this.tweens.add({
            targets: entry,
            alpha: 0,
            delay: 4000,
            duration: 1000,
            onComplete: () => {
                entry.destroy();
                this.killFeedTexts = this.killFeedTexts.filter(t => t !== entry);
            }
        });
    }

    private applyDirectionToSprite (sprite: Phaser.GameObjects.Sprite, dx: number, dy: number)
    {
        const poseIndex = getDirectionPoseIndex(dx, dy);
        if (poseIndex === null)
        {
            return;
        }

        applyDirectionPose(sprite, poseIndex);
    }
}
