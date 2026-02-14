import { EventBus } from '../EventBus';
import { Scene } from 'phaser';
import type {
    AttackEvent,
    CrateSlotState,
    MultiplayerSession,
    PlayerState,
    PositionPayload,
    WeaponType,
    RoomState
} from '../net/multiplayer';
import { applyDirectionPose, getDirectionPoseIndex } from '../kartDirection';

type RemotePlayerHud = {
    walletText: Phaser.GameObjects.Text;
    healthBg: Phaser.GameObjects.Rectangle;
    healthFill: Phaser.GameObjects.Rectangle;
};

type DomHudRefs = {
    root: HTMLDivElement;
    leaderboardCard: HTMLDivElement;
    healthCard: HTMLDivElement;
    roomCard: HTMLDivElement;
    weaponCard: HTMLDivElement;
    leaderboard: HTMLDivElement;
    roomCode: HTMLDivElement;
    healthValue: HTMLDivElement;
    healthBarBg: HTMLDivElement;
    healthFill: HTMLDivElement;
    weaponLabel: HTMLDivElement;
    weaponIcon: HTMLCanvasElement;
    copyButton: HTMLButtonElement;
    copyFeedback: HTMLDivElement;
    respawnCountdown: HTMLDivElement;
};

type HudFrameName =
    | 'hud_panel_parchment'
    | 'hud_panel_wood_strip'
    | 'hud_panel_stone_strip'
    | 'hud_button_small_yellow'
    | 'hud_bar_bg_stone'
    | 'hud_bar_hp_high'
    | 'hud_bar_hp_mid'
    | 'hud_bar_hp_low'
    | 'hud_icon_none'
    | 'hud_icon_rocket'
    | 'hud_icon_bomb'
    | 'hud_icon_bullet';

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
    private readonly cratePickupRadius = 82;
    private readonly cratePickupRetryMs = 320;

    private multiplayerSession?: MultiplayerSession;
    private multiplayerTornDown = false;
    private remotePlayers = new Map<string, Phaser.GameObjects.Sprite>();
    private remotePlayerHud = new Map<string, RemotePlayerHud>();
    private crateSprites = new Map<string, Phaser.GameObjects.Image>();
    private cratePickupAttemptAt = new Map<string, number>();
    private lastPositionSentAt = 0;
    private readonly positionSendIntervalMs = 60;
    private roomCodeText?: Phaser.GameObjects.Text;
    private hudTopPanel?: Phaser.GameObjects.Rectangle;
    private hudBottomPanel?: Phaser.GameObjects.Rectangle;
    private leaderboardTitleText?: Phaser.GameObjects.Text;
    private leaderboardText?: Phaser.GameObjects.Text;
    private healthTitleText?: Phaser.GameObjects.Text;
    private healthValueText?: Phaser.GameObjects.Text;
    private healthBarBg?: Phaser.GameObjects.Rectangle;
    private healthBarFill?: Phaser.GameObjects.Rectangle;
    private copyRoomButtonText?: Phaser.GameObjects.Text;
    private copyRoomButtonBg?: Phaser.GameObjects.TileSprite;
    private copyRoomFeedbackText?: Phaser.GameObjects.Text;
    private weaponTitleText?: Phaser.GameObjects.Text;
    private localWeaponIcon?: Phaser.GameObjects.Image;
    private localWeaponText?: Phaser.GameObjects.Text;
    private controlsHintText?: Phaser.GameObjects.Text;
    private escapeKey?: Phaser.Input.Keyboard.Key;
    private fireKey?: Phaser.Input.Keyboard.Key;
    private isExiting = false;
    private hudDom?: DomHudRefs;
    private hudWeaponSheetImage?: HTMLImageElement;
    private hudCopyFeedbackTimer?: number;
    private hudWeaponType: WeaponType | null = null;
    private hudFrameCache = new Map<string, string>();
    private lastAimDirection = new Phaser.Math.Vector2(0, 1);
    private placedBombVisuals = new Map<string, Phaser.GameObjects.Image>();
    private localIsAlive = true;

    constructor ()
    {
        super('Game');
    }

    create ()
    {
        this.multiplayerTornDown = false;
        this.isExiting = false;

        this.physics.world.setBounds(0, 0, this.worldWidth, this.worldHeight);
        this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);

        this.buildGround();
        this.buildArenaWalls();
        this.buildCosmetics();
        this.createPlayer();
        this.setupInput();
        this.setupCamera();
        this.createHud();
        this.setupMultiplayer();

        this.physics.add.collider(this.player, this.wallGroup);
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

        const localState = this.getLocalPlayerState();
        if (localState)
        {
            this.syncLocalAliveVisibility(localState);
            this.updateRespawnCountdown(localState);
        }
        else
        {
            this.localIsAlive = true;
            this.player.setVisible(true);
            this.updateRespawnCountdown(null);
        }

        if (localState && !localState.isAlive)
        {
            this.player.setVelocity(0, 0);
            this.updateRemotePlayerHudPositions();
            this.updateLocalWeaponHudFromSession();
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
            this.tryPickupNearbyCrate(time);
        }
        else
        {
            const vector = new Phaser.Math.Vector2(rawX, rawY).normalize();
            this.player.setVelocity(vector.x * this.speed, vector.y * this.speed);
            this.lastAimDirection.set(vector.x, vector.y);
            this.applyDirectionToSprite(this.player, vector.x, vector.y);
            this.sendLocalPosition(time);
            this.tryPickupNearbyCrate(time);
        }

        this.tryUseActiveWeapon();
        this.updateRemotePlayerHudPositions();
        this.updateLocalWeaponHudFromSession();
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
        this.scene.start('MainMenu');
    }

    private setupMultiplayer ()
    {
        const session = this.registry.get('multiplayer:session') as MultiplayerSession | undefined;

        if (!session?.socket || !session.roomCode || !session.playerId)
        {
            return;
        }

        this.multiplayerSession = session;
        const localSnapshot = session.room.players.find((player) => player.id === session.playerId);
        if (localSnapshot)
        {
            this.player.setPosition(localSnapshot.position.x, localSnapshot.position.y);
            this.applyDirectionToSprite(this.player, localSnapshot.velocity.x, localSnapshot.velocity.y);
            this.syncLocalAliveVisibility(localSnapshot, true);
            this.updateRespawnCountdown(localSnapshot);
        }
        else
        {
            this.updateRespawnCountdown(null);
        }

        this.bindMultiplayerEvents();
        this.hydrateRemotePlayersFromRoom(session.room);
        this.syncCratesFromRoom(session.room);
        this.setRoomConnectionStatus(session.roomCode, true);
        this.refreshHudFromRoom(session.room);
        this.sendLocalPosition(this.time.now, true);
    }

    private bindMultiplayerEvents ()
    {
        if (!this.multiplayerSession)
        {
            return;
        }

        const { socket } = this.multiplayerSession;

        socket.on('room:position', this.handleRoomPosition);
        socket.on('room:attack', this.handleRoomAttack);
        socket.on('room:state', this.handleRoomState);
        socket.on('room:item', this.handleRoomItem);
        socket.on('room:player_joined', this.handlePlayerJoined);
        socket.on('room:player_left', this.handlePlayerLeft);
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
        socket.off('room:attack', this.handleRoomAttack);
        socket.off('room:state', this.handleRoomState);
        socket.off('room:item', this.handleRoomItem);
        socket.off('room:player_joined', this.handlePlayerJoined);
        socket.off('room:player_left', this.handlePlayerLeft);
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

        const remoteState = session.room.players.find((player) => player.id === payload.playerId);
        if (remoteState)
        {
            if (!remoteState.isAlive)
            {
                this.setRemoteEntityVisibility(payload.playerId, false);
                return;
            }

            this.setRemoteEntityVisibility(payload.playerId, true);
            remote.setPosition(payload.position.x, payload.position.y);
            this.applyDirectionToSprite(remote, deltaX, deltaY);
            this.syncRemotePlayerHud(remoteState);
        }
        else
        {
            this.setRemoteEntityVisibility(payload.playerId, true);
            remote.setPosition(payload.position.x, payload.position.y);
            this.applyDirectionToSprite(remote, deltaX, deltaY);
            this.updateRemoteHudPosition(payload.playerId);
        }
    };

    private handleRoomState = (payload: { room: RoomState; serverTime: number; tickRate: number }) =>
    {
        const session = this.multiplayerSession;
        if (!session || payload.room.code !== session.roomCode)
        {
            return;
        }

        session.room = payload.room;
        const me = payload.room.players.find((player) => player.id === session.playerId);
        if (me)
        {
            this.syncLocalAliveVisibility(me);
            this.updateRespawnCountdown(me);
        }
        else
        {
            this.updateRespawnCountdown(null);
        }

        this.hydrateRemotePlayersFromRoom(payload.room);
        this.syncCratesFromRoom(payload.room);
        this.refreshHudFromRoom(payload.room);
    };

    private handleRoomItem = (payload: {
        roomCode: string;
        playerId: string;
        kind: 'pickup' | 'use';
        itemType: string;
        slotId?: string;
        payload?: Record<string, unknown>;
        ts: number;
    }) =>
    {
        const session = this.multiplayerSession;
        if (!session || payload.roomCode !== session.roomCode)
        {
            return;
        }

        const room = session.room;
        if (payload.kind === 'use')
        {
            const user = room.players.find((player) => player.id === payload.playerId);
            if (user)
            {
                user.activeWeaponType = null;
                user.activeWeaponGrantedAt = null;
                user.activeWeaponExpiresAt = null;
                user.updatedAt = payload.ts;
            }

            this.refreshHudFromRoom(room);
            return;
        }

        if (payload.kind === 'pickup' && payload.slotId)
        {
            const slot = room.crateSlots.find((candidate) => candidate.id === payload.slotId);
            if (slot)
            {
                const respawnAt = payload.payload?.respawnAt;
                slot.isAvailable = false;
                slot.respawnAt = typeof respawnAt === 'number' ? respawnAt : Date.now() + 60_000;
                slot.updatedAt = payload.ts;
            }

            const picker = room.players.find((player) => player.id === payload.playerId);
            const weaponExpiresAt = payload.payload?.weaponExpiresAt;
            if (picker && this.isWeaponType(payload.itemType))
            {
                picker.activeWeaponType = payload.itemType;
                picker.activeWeaponExpiresAt = typeof weaponExpiresAt === 'number' ? weaponExpiresAt : Date.now() + 40_000;
                picker.activeWeaponGrantedAt = payload.ts;
                picker.updatedAt = payload.ts;
            }

            this.syncCratesFromRoom(room);
            this.refreshHudFromRoom(room);
        }
    };

    private handleRoomAttack = (payload: AttackEvent & { ts: number }) =>
    {
        const session = this.multiplayerSession;
        if (!session || payload.roomCode !== session.roomCode)
        {
            return;
        }

        this.renderAttackEvent(payload);
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
            this.syncRemotePlayerHud(joinedPlayer);
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
            if (player.id === session.playerId)
            {
                return;
            }

            remoteIds.add(player.id);
            const remote = this.ensureRemotePlayer(player.id, player.position.x, player.position.y);

            if (!player.isAlive)
            {
                this.setRemoteEntityVisibility(player.id, false);
                return;
            }

            this.setRemoteEntityVisibility(player.id, true);
            remote.setPosition(player.position.x, player.position.y);
            this.applyDirectionToSprite(remote, player.velocity.x, player.velocity.y);
            this.syncRemotePlayerHud(player);
        });

        for (const playerId of this.remotePlayers.keys())
        {
            if (!remoteIds.has(playerId))
            {
                this.removeRemotePlayer(playerId);
            }
        }

        for (const playerId of this.remotePlayerHud.keys())
        {
            if (remoteIds.has(playerId))
            {
                continue;
            }

            this.removeRemotePlayerHud(playerId);
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
            this.removeRemotePlayerHud(playerId);
            return;
        }

        remote.destroy();
        this.remotePlayers.delete(playerId);
        this.removeRemotePlayerHud(playerId);
    }

    private ensureRemotePlayerHud (playerId: string)
    {
        let hud = this.remotePlayerHud.get(playerId);
        if (!hud)
        {
            const walletText = this.add.text(0, 0, 'player...', {
                fontFamily: 'Cinzel',
                fontSize: '15px',
                color: '#fff2cf',
                stroke: '#2a170d',
                strokeThickness: 3
            }).setOrigin(0.5, 1).setDepth(62);

            const healthBg = this.add.rectangle(0, 0, 74, 10, 0x23120a, 0.9)
                .setOrigin(0.5, 0.5)
                .setDepth(61);

            const healthFill = this.add.rectangle(0, 0, 68, 6, 0x60d96d, 1)
                .setOrigin(0, 0.5)
                .setDepth(62);

            hud = { walletText, healthBg, healthFill };
            this.remotePlayerHud.set(playerId, hud);
        }

        return hud;
    }

    private syncRemotePlayerHud (player: PlayerState)
    {
        const remote = this.remotePlayers.get(player.id);
        if (!remote)
        {
            return;
        }

        if (!player.isAlive)
        {
            this.setRemoteEntityVisibility(player.id, false);
            return;
        }

        const hud = this.ensureRemotePlayerHud(player.id);
        hud.walletText.setText(this.getRemoteWalletLabel(player));
        this.applyHealthBar(hud.healthFill, player.hp, 68);
        this.updateRemoteHudPosition(player.id);
    }

    private updateRemotePlayerHudPositions ()
    {
        for (const playerId of this.remotePlayerHud.keys())
        {
            this.updateRemoteHudPosition(playerId);
        }
    }

    private updateRemoteHudPosition (playerId: string)
    {
        const remote = this.remotePlayers.get(playerId);
        const hud = this.remotePlayerHud.get(playerId);
        if (!remote || !hud)
        {
            return;
        }

        const labelOffsetY = 62;
        const barOffsetY = 48;
        const barWidth = 68;

        hud.walletText.setPosition(remote.x, remote.y - labelOffsetY);
        hud.healthBg.setPosition(remote.x, remote.y - barOffsetY);
        hud.healthFill.setPosition((remote.x - (barWidth / 2)), remote.y - barOffsetY);
    }

    private removeRemotePlayerHud (playerId: string)
    {
        const hud = this.remotePlayerHud.get(playerId);
        if (!hud)
        {
            return;
        }

        hud.walletText.destroy();
        hud.healthBg.destroy();
        hud.healthFill.destroy();
        this.remotePlayerHud.delete(playerId);
    }

    private setRemoteEntityVisibility (playerId: string, visible: boolean)
    {
        const remote = this.remotePlayers.get(playerId);
        if (remote)
        {
            remote.setVisible(visible);
        }

        const hud = this.remotePlayerHud.get(playerId);
        if (hud)
        {
            hud.walletText.setVisible(visible);
            hud.healthBg.setVisible(visible);
            hud.healthFill.setVisible(visible);
        }
    }

    private getLocalPlayerState ()
    {
        const session = this.multiplayerSession;
        if (!session)
        {
            return null;
        }

        return session.room.players.find((player) => player.id === session.playerId) ?? null;
    }

    private syncLocalAliveVisibility (player: PlayerState, forcePosition = false)
    {
        if (!player.isAlive)
        {
            this.player.setVisible(false);
            this.player.setVelocity(0, 0);
            this.localIsAlive = false;
            return;
        }

        const shouldSyncPosition = forcePosition || !this.localIsAlive;
        this.player.setVisible(true);
        if (shouldSyncPosition)
        {
            this.player.setPosition(player.position.x, player.position.y);
            this.applyDirectionToSprite(this.player, player.velocity.x, player.velocity.y);
        }
        this.localIsAlive = true;
    }

    private updateRespawnCountdown (player: PlayerState | null)
    {
        if (!this.hudDom)
        {
            return;
        }

        if (!player || player.isAlive || !player.respawnAt)
        {
            this.hudDom.respawnCountdown.style.display = 'none';
            this.hudDom.respawnCountdown.textContent = '';
            return;
        }

        const seconds = Math.max(0, Math.ceil((player.respawnAt - Date.now()) / 1000));
        this.hudDom.respawnCountdown.textContent = `RESPAWNING IN ${seconds}s`;
        this.hudDom.respawnCountdown.style.display = 'block';
    }

    private syncCratesFromRoom (room: RoomState)
    {
        const activeCrateIds = new Set<string>();

        room.crateSlots.forEach((slot) =>
        {
            activeCrateIds.add(slot.id);
            const crate = this.ensureCrateSprite(slot);
            crate.setPosition(slot.position.x, slot.position.y);
            crate.setVisible(slot.isAvailable);
            crate.setAlpha(slot.isAvailable ? 0.98 : 0);
            crate.setFrame(slot.weaponType === 'bomb' ? 'weapon_crate_b' : 'weapon_crate_a');
            crate.setTint(this.getCrateTint(slot));
        });

        for (const [crateId, crate] of this.crateSprites.entries())
        {
            if (activeCrateIds.has(crateId))
            {
                continue;
            }

            crate.destroy();
            this.crateSprites.delete(crateId);
            this.cratePickupAttemptAt.delete(crateId);
        }
    }

    private ensureCrateSprite (slot: CrateSlotState)
    {
        let crate = this.crateSprites.get(slot.id);
        if (!crate)
        {
            crate = this.add.image(slot.position.x, slot.position.y, 'sprite-sheet', 'weapon_crate_a')
                .setScale(0.67)
                .setDepth(24);

            this.crateSprites.set(slot.id, crate);
        }

        return crate;
    }

    private tryPickupNearbyCrate (time: number)
    {
        const session = this.multiplayerSession;
        if (!session || !session.socket.connected)
        {
            return;
        }

        const meState = session.room.players.find((player) => player.id === session.playerId);
        if (meState && !meState.isAlive)
        {
            return;
        }

        if (meState && this.hasActiveWeapon(meState))
        {
            return;
        }

        const pickupRangeSq = this.cratePickupRadius * this.cratePickupRadius;
        const me = this.player;

        for (const slot of session.room.crateSlots)
        {
            if (!slot.isAvailable)
            {
                continue;
            }

            const nextTryAt = this.cratePickupAttemptAt.get(slot.id) ?? 0;
            if (time < nextTryAt)
            {
                continue;
            }

            const dx = me.x - slot.position.x;
            const dy = me.y - slot.position.y;
            const distanceSq = (dx * dx) + (dy * dy);
            if (distanceSq > pickupRangeSq)
            {
                continue;
            }

            session.socket.emit('player:item', {
                roomCode: session.roomCode,
                playerId: session.playerId,
                kind: 'pickup',
                itemType: 'crate',
                slotId: slot.id,
                ts: Date.now()
            });

            // Optimistic hide to avoid rapid re-pickup attempts before next room tick.
            slot.isAvailable = false;
            slot.updatedAt = Date.now();
            this.syncCratesFromRoom(session.room);
            this.cratePickupAttemptAt.set(slot.id, time + this.cratePickupRetryMs);
            break;
        }
    }

    private tryUseActiveWeapon ()
    {
        if (!this.fireKey || !Phaser.Input.Keyboard.JustDown(this.fireKey))
        {
            return;
        }

        const session = this.multiplayerSession;
        if (!session || !session.socket.connected)
        {
            return;
        }

        const me = session.room.players.find((player) => player.id === session.playerId);
        if (!me || !me.isAlive || !me.activeWeaponType)
        {
            return;
        }

        const aimDirection = this.resolveAimDirection();

        session.socket.emit('player:attack', {
            roomCode: session.roomCode,
            playerId: session.playerId,
            weaponType: me.activeWeaponType,
            position: { x: this.player.x, y: this.player.y },
            direction: aimDirection,
            ts: Date.now()
        });

        // Optimistic consume so players can't spam while waiting for round-trip.
        me.activeWeaponType = null;
        me.activeWeaponGrantedAt = null;
        me.activeWeaponExpiresAt = null;
        me.updatedAt = Date.now();
        this.refreshHudFromRoom(session.room);
    }

    private resolveAimDirection ()
    {
        const body = this.player.body as Phaser.Physics.Arcade.Body | undefined;
        const vx = body?.velocity.x ?? 0;
        const vy = body?.velocity.y ?? 0;

        if (Math.abs(vx) > 0.1 || Math.abs(vy) > 0.1)
        {
            const velocityDirection = new Phaser.Math.Vector2(vx, vy).normalize();
            this.lastAimDirection.set(velocityDirection.x, velocityDirection.y);
        }

        if (this.lastAimDirection.lengthSq() < 0.0001)
        {
            this.lastAimDirection.set(0, 1);
        }

        return {
            x: this.lastAimDirection.x,
            y: this.lastAimDirection.y
        };
    }

    private renderAttackEvent (event: AttackEvent & { ts: number })
    {
        const payload = event.payload ?? {};
        const phase = typeof payload.phase === 'string' ? payload.phase : '';

        if (phase === 'rocket_fire')
        {
            const start = this.readVec2(payload.start, event.position);
            const end = this.readVec2(payload.end, event.position);
            const travelMs = this.readNumber(payload.travelMs, 260);
            this.animateRocketTrail(start, end, travelMs);
            return;
        }

        if (phase === 'bomb_place')
        {
            const bombId = typeof payload.bombId === 'string' ? payload.bombId : event.id;
            const position = this.readVec2(payload.position, event.position);
            this.spawnBombVisual(bombId, position);
            return;
        }

        if (phase === 'bomb_explode')
        {
            const bombId = typeof payload.bombId === 'string' ? payload.bombId : event.id;
            const position = this.readVec2(payload.position, event.position);
            const radius = this.readNumber(payload.radius, 140);
            this.explodeBombVisual(bombId, position, radius);
            return;
        }

        if (phase === 'bullet_trace')
        {
            const from = this.readVec2(payload.from, event.position);
            const to = this.readVec2(payload.to, event.position);
            this.spawnBulletTrace(from, to);
        }
    }

    private animateRocketTrail (from: { x: number; y: number }, to: { x: number; y: number }, travelMs: number)
    {
        const rocket = this.add.image(from.x, from.y, 'sprite-sheet', 'rocket_missile')
            .setDepth(47)
            .setScale(0.62);

        rocket.setRotation(Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y));

        this.tweens.add({
            targets: rocket,
            x: to.x,
            y: to.y,
            duration: Phaser.Math.Clamp(travelMs, 120, 1000),
            ease: 'Linear',
            onComplete: () =>
            {
                rocket.destroy();
                this.spawnExplosionVisual(to.x, to.y, 0.9);
            }
        });
    }

    private spawnBombVisual (bombId: string, position: { x: number; y: number })
    {
        const existing = this.placedBombVisuals.get(bombId);
        if (existing)
        {
            existing.destroy();
        }

        const bomb = this.add.image(position.x, position.y, 'sprite-sheet', 'bomb_state_01')
            .setDepth(33)
            .setScale(0.7);

        this.tweens.add({
            targets: bomb,
            scaleX: 0.76,
            scaleY: 0.76,
            duration: 420,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        this.placedBombVisuals.set(bombId, bomb);
    }

    private explodeBombVisual (bombId: string, position: { x: number; y: number }, radius: number)
    {
        const bomb = this.placedBombVisuals.get(bombId);
        if (bomb)
        {
            bomb.destroy();
            this.placedBombVisuals.delete(bombId);
        }

        const ring = this.add.circle(position.x, position.y, radius, 0xffca73, 0.2)
            .setDepth(42);

        this.tweens.add({
            targets: ring,
            alpha: 0,
            scaleX: 1.16,
            scaleY: 1.16,
            duration: 260,
            ease: 'Quad.out',
            onComplete: () => ring.destroy()
        });

        this.spawnExplosionVisual(position.x, position.y, 1.15);
    }

    private spawnBulletTrace (from: { x: number; y: number }, to: { x: number; y: number })
    {
        const trail = this.add.graphics().setDepth(44);
        trail.lineStyle(3, 0xffe5a8, 0.9);
        trail.beginPath();
        trail.moveTo(from.x, from.y);
        trail.lineTo(to.x, to.y);
        trail.strokePath();

        this.time.delayedCall(70, () => trail.destroy());

        const impact = this.add.image(to.x, to.y, 'sprite-sheet', 'projectile_spark_02')
            .setDepth(45)
            .setScale(0.64);

        this.tweens.add({
            targets: impact,
            alpha: 0,
            duration: 80,
            ease: 'Quad.out',
            onComplete: () => impact.destroy()
        });
    }

    private spawnExplosionVisual (x: number, y: number, scale = 1)
    {
        const frames = ['explosion_a_01', 'explosion_a_02', 'explosion_a_03'];
        const explosion = this.add.image(x, y, 'sprite-sheet', frames[0])
            .setDepth(46)
            .setScale(scale);

        let frameIndex = 0;
        const frameTimer = this.time.addEvent({
            delay: 72,
            repeat: frames.length - 1,
            callback: () =>
            {
                frameIndex += 1;
                if (frameIndex < frames.length)
                {
                    explosion.setFrame(frames[frameIndex]);
                }
            }
        });

        this.time.delayedCall(72 * (frames.length + 1), () =>
        {
            frameTimer.remove(false);
            explosion.destroy();
        });
    }

    private readVec2 (value: unknown, fallback: { x: number; y: number })
    {
        if (!value || typeof value !== 'object')
        {
            return { ...fallback };
        }

        const candidate = value as Record<string, unknown>;
        if (typeof candidate.x !== 'number' || typeof candidate.y !== 'number')
        {
            return { ...fallback };
        }

        return {
            x: candidate.x,
            y: candidate.y
        };
    }

    private readNumber (value: unknown, fallback: number)
    {
        return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
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
        this.removeHudDom();

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
        this.remotePlayerHud.forEach((hud) =>
        {
            hud.walletText.destroy();
            hud.healthBg.destroy();
            hud.healthFill.destroy();
        });
        this.remotePlayerHud.clear();
        this.crateSprites.forEach((crate) => crate.destroy());
        this.crateSprites.clear();
        this.cratePickupAttemptAt.clear();
        this.placedBombVisuals.forEach((bomb) => bomb.destroy());
        this.placedBombVisuals.clear();

        [
            this.hudTopPanel,
            this.hudBottomPanel,
            this.roomCodeText,
            this.leaderboardTitleText,
            this.leaderboardText,
            this.healthTitleText,
            this.healthValueText,
            this.healthBarBg,
            this.healthBarFill,
            this.copyRoomButtonText,
            this.copyRoomButtonBg,
            this.copyRoomFeedbackText,
            this.weaponTitleText,
            this.localWeaponIcon,
            this.localWeaponText,
            this.controlsHintText
        ].forEach((hudText) => hudText?.destroy());

        this.hudTopPanel = undefined;
        this.hudBottomPanel = undefined;
        this.roomCodeText = undefined;
        this.leaderboardTitleText = undefined;
        this.leaderboardText = undefined;
        this.healthTitleText = undefined;
        this.healthValueText = undefined;
        this.healthBarBg = undefined;
        this.healthBarFill = undefined;
        this.copyRoomButtonText = undefined;
        this.copyRoomButtonBg = undefined;
        this.copyRoomFeedbackText = undefined;
        this.weaponTitleText = undefined;
        this.localWeaponIcon = undefined;
        this.localWeaponText = undefined;
        this.controlsHintText = undefined;
        this.fireKey = undefined;
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
        this.fireKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

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
        this.removeHudDom();

        const parent = this.game.canvas.parentElement as HTMLElement | null;
        if (!parent)
        {
            return;
        }

        const parentPosition = window.getComputedStyle(parent).position;
        if (parentPosition === 'static')
        {
            parent.style.position = 'relative';
        }

        const root = document.createElement('div');
        Object.assign(root.style, {
            position: 'absolute',
            inset: '0',
            pointerEvents: 'none',
            zIndex: '9999',
            fontFamily: 'Inter, Segoe UI, system-ui, sans-serif',
            color: '#f2e8d2',
            textShadow: '0 1px 1px rgba(0, 0, 0, 0.58)',
            userSelect: 'none'
        });

        const leaderboardTitle = document.createElement('div');
        leaderboardTitle.textContent = 'LEADERBOARD';
        Object.assign(leaderboardTitle.style, {
            fontFamily: 'Cinzel, Georgia, serif',
            fontSize: '17px',
            fontWeight: '700',
            letterSpacing: '1.4px',
            color: '#1a1919',
            marginBottom: '8px'
        });

        const leaderboard = document.createElement('div');
        leaderboard.textContent = 'Waiting for players...';
        Object.assign(leaderboard.style, {
            fontSize: '14px',
            fontWeight: '600',
            lineHeight: '1.5',
            color: '#f1e4c2',
            letterSpacing: '0.3px',
            whiteSpace: 'pre-line'
        });

        const leaderboardCard = document.createElement('div');
        Object.assign(leaderboardCard.style, {
            position: 'absolute',
            left: '20px',
            top: '20px',
            width: '390px',
            minHeight: '128px',
            padding: '14px 16px',
            boxSizing: 'border-box',
            border: '1px solid rgba(255, 238, 196, 0.22)',
            borderRadius: '12px',
            background: 'rgba(58, 41, 28, 0.68)',
            boxShadow: '0 10px 24px rgba(0, 0, 0, 0.36), inset 0 1px 0 rgba(255, 245, 212, 0.15)',
            backdropFilter: 'blur(1.5px)'
        });
        leaderboardCard.appendChild(leaderboardTitle);
        leaderboardCard.appendChild(leaderboard);

        const healthTitle = document.createElement('div');
        healthTitle.textContent = 'HEALTH';
        Object.assign(healthTitle.style, {
            fontFamily: 'Cinzel, Georgia, serif',
            fontSize: '17px',
            fontWeight: '700',
            letterSpacing: '1.4px',
            color: '#000000',
            textAlign: 'right'
        });

        const healthValue = document.createElement('div');
        healthValue.textContent = '100 / 100';
        Object.assign(healthValue.style, {
            fontSize: '16px',
            fontWeight: '700',
            color: '#f1e4c2',
            textAlign: 'right',
            marginTop: '6px',
            marginBottom: '10px',
            fontVariantNumeric: 'tabular-nums'
        });

        const healthBarBg = document.createElement('div');
        Object.assign(healthBarBg.style, {
            width: '100%',
            height: '14px',
            background: 'rgba(36, 24, 17, 0.94)',
            border: '1px solid rgba(0, 0, 0, 0.55)',
            borderRadius: '999px',
            overflow: 'hidden',
            boxShadow: 'inset 0 2px 3px rgba(0, 0, 0, 0.45)'
        });

        const healthFill = document.createElement('div');
        Object.assign(healthFill.style, {
            width: '100%',
            height: '100%',
            background: '#63d86e',
            borderRadius: '999px',
            transformOrigin: 'left center'
        });
        healthBarBg.appendChild(healthFill);

        const healthCard = document.createElement('div');
        Object.assign(healthCard.style, {
            position: 'absolute',
            right: '20px',
            top: '20px',
            width: '300px',
            minHeight: '128px',
            padding: '14px 16px',
            boxSizing: 'border-box',
            border: '1px solid rgba(255, 238, 196, 0.22)',
            borderRadius: '12px',
            background: 'rgba(66, 63, 56, 0.66)',
            boxShadow: '0 10px 24px rgba(0, 0, 0, 0.36), inset 0 1px 0 rgba(255, 245, 212, 0.15)',
            backdropFilter: 'blur(1.5px)'
        });
        healthCard.appendChild(healthTitle);
        healthCard.appendChild(healthValue);
        healthCard.appendChild(healthBarBg);

        const roomCode = document.createElement('div');
        roomCode.textContent = 'ROOM: ---- • OFFLINE';
        Object.assign(roomCode.style, {
            fontSize: '16px',
            fontWeight: '700',
            letterSpacing: '0.6px',
            color: '#f3e7c7',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
        });

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.textContent = 'COPY';
        Object.assign(copyButton.style, {
            width: '82px',
            height: '34px',
            border: '1px solid rgba(40, 23, 12, 0.9)',
            borderRadius: '8px',
            background: 'linear-gradient(180deg, #d7a85f 0%, #b57935 100%)',
            color: '#fff4d8',
            fontFamily: 'Inter, Segoe UI, system-ui, sans-serif',
            fontWeight: '700',
            fontSize: '12px',
            letterSpacing: '1px',
            cursor: 'pointer',
            pointerEvents: 'auto',
            boxShadow: '0 3px 8px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
        });
        copyButton.addEventListener('click', () => {
            void this.copyRoomCodeToClipboard();
        });

        const copyFeedback = document.createElement('div');
        Object.assign(copyFeedback.style, {
            minWidth: '74px',
            textAlign: 'left',
            fontSize: '12px',
            fontWeight: '700',
            letterSpacing: '0.4px',
            color: '#d9f7b0'
        });

        const roomTextWrap = document.createElement('div');
        Object.assign(roomTextWrap.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            minWidth: '0',
            flex: '1'
        });
        roomTextWrap.appendChild(roomCode);

        const roomActionWrap = document.createElement('div');
        Object.assign(roomActionWrap.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        });
        roomActionWrap.appendChild(copyButton);
        roomActionWrap.appendChild(copyFeedback);

        const roomCard = document.createElement('div');
        Object.assign(roomCard.style, {
            position: 'absolute',
            left: '20px',
            bottom: '20px',
            width: '540px',
            minHeight: '72px',
            padding: '10px 13px',
            boxSizing: 'border-box',
            border: '1px solid rgba(255, 238, 196, 0.22)',
            borderRadius: '12px',
            background: 'rgba(62, 45, 30, 0.7)',
            boxShadow: '0 10px 24px rgba(0, 0, 0, 0.36), inset 0 1px 0 rgba(255, 245, 212, 0.15)',
            backdropFilter: 'blur(1.5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
        });
        roomCard.appendChild(roomTextWrap);
        roomCard.appendChild(roomActionWrap);

        const weaponTitle = document.createElement('div');
        weaponTitle.textContent = 'WEAPON';
        Object.assign(weaponTitle.style, {
            fontFamily: 'Cinzel, Georgia, serif',
            fontSize: '17px',
            fontWeight: '700',
            letterSpacing: '1.4px',
            color: '#f8eacd',
            marginBottom: '6px',
            textAlign: 'right'
        });

        const weaponIcon = document.createElement('canvas');
        weaponIcon.width = 64;
        weaponIcon.height = 64;
        Object.assign(weaponIcon.style, {
            width: '50px',
            height: '50px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 238, 196, 0.2)',
            background: 'rgba(28, 21, 15, 0.45)',
            imageRendering: 'pixelated'
        });

        const weaponLabel = document.createElement('div');
        weaponLabel.textContent = 'None';
        Object.assign(weaponLabel.style, {
            flex: '1',
            textAlign: 'left',
            fontSize: '15px',
            fontWeight: '700',
            letterSpacing: '0.4px',
            color: '#f2e3c1'
        });

        const weaponInfoRow = document.createElement('div');
        Object.assign(weaponInfoRow.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
        });
        weaponInfoRow.appendChild(weaponIcon);
        weaponInfoRow.appendChild(weaponLabel);

        const weaponCard = document.createElement('div');
        Object.assign(weaponCard.style, {
            position: 'absolute',
            right: '20px',
            bottom: '20px',
            width: '310px',
            minHeight: '72px',
            padding: '10px 13px',
            boxSizing: 'border-box',
            border: '1px solid rgba(255, 238, 196, 0.22)',
            borderRadius: '12px',
            background: 'rgba(66, 63, 56, 0.68)',
            boxShadow: '0 10px 24px rgba(0, 0, 0, 0.36), inset 0 1px 0 rgba(255, 245, 212, 0.15)',
            backdropFilter: 'blur(1.5px)'
        });
        weaponCard.appendChild(weaponTitle);
        weaponCard.appendChild(weaponInfoRow);

        const controlsHint = document.createElement('div');
        controlsHint.textContent = 'WASD / ARROWS TO DRIVE  •  SPACE TO FIRE  •  ESC TO RETURN TO MENU';
        Object.assign(controlsHint.style, {
            position: 'absolute',
            left: '50%',
            bottom: '12px',
            transform: 'translateX(-50%)',
            fontSize: '12px',
            fontWeight: '600',
            letterSpacing: '0.8px',
            color: '#efe1bc',
            padding: '5px 10px',
            borderRadius: '999px',
            border: '1px solid rgba(255, 238, 196, 0.2)',
            background: 'rgba(26, 18, 12, 0.56)',
            backdropFilter: 'blur(1.5px)'
        });

        const respawnCountdown = document.createElement('div');
        Object.assign(respawnCountdown.style, {
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'none',
            padding: '12px 18px',
            borderRadius: '10px',
            border: '1px solid rgba(255, 238, 196, 0.28)',
            background: 'rgba(28, 19, 12, 0.78)',
            fontFamily: 'Cinzel, Georgia, serif',
            fontSize: '38px',
            fontWeight: '700',
            letterSpacing: '1.2px',
            color: '#ffe6b2',
            textShadow: '0 2px 0 rgba(0, 0, 0, 0.8)',
            boxShadow: '0 12px 28px rgba(0, 0, 0, 0.38)'
        });

        [
            leaderboardCard,
            healthCard,
            roomCard,
            weaponCard,
            controlsHint,
            respawnCountdown
        ].forEach((element) => root.appendChild(element));

        parent.appendChild(root);

        this.hudDom = {
            root,
            leaderboardCard,
            healthCard,
            roomCard,
            weaponCard,
            leaderboard,
            roomCode,
            healthValue,
            healthBarBg,
            healthFill,
            weaponLabel,
            weaponIcon,
            copyButton,
            copyFeedback,
            respawnCountdown
        };

        this.applyHudSpritePanels();
        this.updateHudWeaponIcon(null);
    }

    private removeHudDom ()
    {
        if (this.hudCopyFeedbackTimer)
        {
            window.clearTimeout(this.hudCopyFeedbackTimer);
            this.hudCopyFeedbackTimer = undefined;
        }

        if (this.hudDom)
        {
            this.hudDom.root.remove();
            this.hudDom = undefined;
        }
    }

    private applyHudSpritePanels ()
    {
        if (!this.hudDom)
        {
            return;
        }

        this.applyHudPanelTexture(this.hudDom.leaderboardCard, 'hud_panel_parchment', false);
        this.applyHudPanelTexture(this.hudDom.healthCard, 'hud_panel_stone_strip', true);
        this.applyHudPanelTexture(this.hudDom.roomCard, 'hud_panel_wood_strip', true);
        this.applyHudPanelTexture(this.hudDom.weaponCard, 'hud_panel_stone_strip', true);
        this.applyHudPanelTexture(this.hudDom.copyButton, 'hud_button_small_yellow', false);
        this.applyHudPanelTexture(this.hudDom.healthBarBg, 'hud_bar_bg_stone', false);
        this.setHudHealthFillTextureByRatio(1);
    }

    private setHudHealthFillTextureByRatio (ratio: number)
    {
        if (!this.hudDom)
        {
            return;
        }

        const frameName: HudFrameName = ratio > 0.55
            ? 'hud_bar_hp_high'
            : ratio > 0.25
                ? 'hud_bar_hp_mid'
                : 'hud_bar_hp_low';

        this.applyHudPanelTexture(this.hudDom.healthFill, frameName, false);
    }

    private applyHudPanelTexture (
        element: HTMLElement,
        frameName: HudFrameName,
        repeatX: boolean
    )
    {
        const textureUrl = this.getHudFrameDataUrl(frameName);
        if (!textureUrl)
        {
            return;
        }

        element.style.backgroundImage = `url("${textureUrl}")`;
        element.style.backgroundRepeat = repeatX ? 'repeat-x' : 'no-repeat';
        element.style.backgroundSize = repeatX ? 'auto 100%' : '100% 100%';
        element.style.backgroundPosition = 'center center';
    }

    private getHudFrameDataUrl (frameName: HudFrameName)
    {
        const cacheKey = frameName;
        const cached = this.hudFrameCache.get(cacheKey);
        if (cached)
        {
            return cached;
        }

        const image = this.ensureHudSpriteSheetImage();
        if (!image.complete || !image.naturalWidth)
        {
            return null;
        }

        const frameRect = this.getHudFrameRect(frameName);
        const canvas = document.createElement('canvas');
        canvas.width = frameRect.w;
        canvas.height = frameRect.h;
        const context = canvas.getContext('2d');
        if (!context)
        {
            return null;
        }

        context.imageSmoothingEnabled = false;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(
            image,
            frameRect.x,
            frameRect.y,
            frameRect.w,
            frameRect.h,
            0,
            0,
            frameRect.w,
            frameRect.h
        );

        const dataUrl = canvas.toDataURL();
        this.hudFrameCache.set(cacheKey, dataUrl);
        return dataUrl;
    }

    private getHudFrameRect (frameName: HudFrameName)
    {
        const frameMap: Record<HudFrameName, { x: number; y: number; w: number; h: number }> = {
            hud_panel_parchment: { x: 687, y: 33, w: 448, h: 168 },
            hud_panel_wood_strip: { x: 128, y: 304, w: 344, h: 73 },
            hud_panel_stone_strip: { x: 509, y: 304, w: 340, h: 73 },
            hud_button_small_yellow: { x: 552, y: 760, w: 144, h: 56 },
            hud_bar_bg_stone: { x: 808, y: 595, w: 289, h: 61 },
            hud_bar_hp_high: { x: 128, y: 678, w: 344, h: 50 },
            hud_bar_hp_mid: { x: 488, y: 678, w: 297, h: 50 },
            hud_bar_hp_low: { x: 808, y: 677, w: 294, h: 51 },
            hud_icon_none: { x: 128, y: 847, w: 111, h: 97 },
            hud_icon_rocket: { x: 248, y: 848, w: 106, h: 96 },
            hud_icon_bomb: { x: 360, y: 848, w: 108, h: 96 },
            hud_icon_bullet: { x: 584, y: 848, w: 106, h: 96 }
        };

        return frameMap[frameName];
    }

    private ensureHudSpriteSheetImage ()
    {
        if (!this.hudWeaponSheetImage)
        {
            this.hudWeaponSheetImage = new Image();
            this.hudWeaponSheetImage.src = '/assets/hud-sheet.png';
            this.hudWeaponSheetImage.onload = () => {
                this.hudFrameCache.clear();
                this.applyHudSpritePanels();
                const session = this.multiplayerSession;
                const me = session?.room.players.find((player) => player.id === session.playerId);
                this.applyLocalHealth(me?.hp ?? 100);
                this.updateHudWeaponIcon(this.hudWeaponType);
            };
        }

        return this.hudWeaponSheetImage;
    }

    private setRoomConnectionStatus (roomCode: string, isOnline: boolean)
    {
        const status = isOnline ? 'ONLINE' : 'OFFLINE';
        this.roomCodeText?.setText(`ROOM: ${roomCode} • ${status}`);
        if (this.hudDom)
        {
            this.hudDom.roomCode.textContent = `ROOM: ${roomCode} • ${status}`;
        }
    }

    private async copyRoomCodeToClipboard ()
    {
        const roomCode = this.multiplayerSession?.roomCode;
        if (!roomCode)
        {
            this.showCopyFeedback('No room', '#ffd2ba');
            return;
        }

        try
        {
            if (!navigator.clipboard?.writeText)
            {
                throw new Error('Clipboard unavailable');
            }

            await navigator.clipboard.writeText(roomCode);
            this.showCopyFeedback('Copied!', '#d5f8b6');
        }
        catch (_error)
        {
            this.showCopyFeedback('Copy failed', '#ffd2ba');
        }
    }

    private showCopyFeedback (text: string, color: string)
    {
        if (this.copyRoomFeedbackText)
        {
            this.copyRoomFeedbackText.setColor(color);
            this.copyRoomFeedbackText.setText(text);
            this.time.delayedCall(1400, () =>
            {
                this.copyRoomFeedbackText?.setText('');
            });
        }

        if (!this.hudDom)
        {
            return;
        }

        this.hudDom.copyFeedback.textContent = text;
        this.hudDom.copyFeedback.style.color = color;

        if (this.hudCopyFeedbackTimer)
        {
            window.clearTimeout(this.hudCopyFeedbackTimer);
        }

        this.hudCopyFeedbackTimer = window.setTimeout(() =>
        {
            if (this.hudDom)
            {
                this.hudDom.copyFeedback.textContent = '';
            }
            this.hudCopyFeedbackTimer = undefined;
        }, 1400);
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
                return `${marker}${index + 1}. ${label}  K:${player.kills}`;
            });
            this.leaderboardText.setText(lines.length > 0 ? lines.join('\n') : 'No players in room');
        }

        if (this.hudDom)
        {
            const lines = rankedPlayers.map((player, index) => {
                const label = this.trimPlayerName(player.name, 12);
                const marker = player.id === session.playerId ? '>' : ' ';
                return `${marker}${index + 1}. ${label}  K:${player.kills}`;
            });
            this.hudDom.leaderboard.textContent = lines.length > 0 ? lines.join('\n') : 'No players in room';
        }

        const me = room.players.find((player) => player.id === session.playerId);
        if (!me)
        {
            this.applyLocalHealth(100);
            this.localWeaponText?.setText('None');
            this.localWeaponIcon?.setFrame('slot_small_question');
            if (this.hudDom)
            {
                this.hudDom.weaponLabel.textContent = 'None';
                this.updateHudWeaponIcon(null);
            }
            return;
        }

        this.applyLocalHealth(me.isAlive ? me.hp : 0);
        this.applyLocalWeapon(me);
    }

    private updateLocalWeaponHudFromSession ()
    {
        const session = this.multiplayerSession;
        if (!session)
        {
            return;
        }

        const me = session.room.players.find((player) => player.id === session.playerId);
        if (!me)
        {
            return;
        }

        this.applyLocalWeapon(me);
    }

    private applyLocalHealth (hp: number)
    {
        const clamped = Phaser.Math.Clamp(hp, 0, 100);
        if (this.healthValueText)
        {
            this.healthValueText.setText(`${clamped} / 100`);
        }

        if (this.healthBarFill)
        {
            this.applyHealthBar(this.healthBarFill, clamped, 228);
        }

        if (this.hudDom)
        {
            this.hudDom.healthValue.textContent = `${clamped} / 100`;
            const ratio = clamped / 100;
            this.hudDom.healthFill.style.transform = `scaleX(${ratio})`;
            this.setHudHealthFillTextureByRatio(ratio);
        }
    }

    private applyLocalWeapon (player: PlayerState)
    {
        const label = this.getWeaponStatusLabel(player);
        this.localWeaponText?.setText(label);
        this.localWeaponIcon?.setFrame(this.getWeaponIconFrame(player.activeWeaponType));
        if (this.hudDom)
        {
            this.hudDom.weaponLabel.textContent = label;
            this.updateHudWeaponIcon(player.activeWeaponType);
        }
    }

    private updateHudWeaponIcon (weaponType: WeaponType | null)
    {
        this.hudWeaponType = weaponType;
        if (!this.hudDom)
        {
            return;
        }

        const image = this.ensureHudSpriteSheetImage();
        if (!image.complete || !image.naturalWidth)
        {
            return;
        }

        const frameByWeapon: Record<'rocket' | 'bomb' | 'bullet' | 'none', HudFrameName> = {
            rocket: 'hud_icon_rocket',
            bomb: 'hud_icon_bomb',
            bullet: 'hud_icon_bullet',
            none: 'hud_icon_none'
        };

        const key = weaponType ?? 'none';
        const frame = this.getHudFrameRect(frameByWeapon[key]);

        const canvas = this.hudDom.weaponIcon;
        const context = canvas.getContext('2d');
        if (!context)
        {
            return;
        }

        context.imageSmoothingEnabled = false;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(
            image,
            frame.x,
            frame.y,
            frame.w,
            frame.h,
            4,
            4,
            canvas.width - 8,
            canvas.height - 8
        );
    }

    private getWeaponStatusLabel (player: PlayerState)
    {
        if (!player.isAlive)
        {
            if (player.respawnAt)
            {
                const secondsLeft = Math.max(0, Math.ceil((player.respawnAt - Date.now()) / 1000));
                return `RESPAWN ${secondsLeft}s`;
            }

            return 'RESPAWNING';
        }

        if (!player.activeWeaponType || !player.activeWeaponExpiresAt)
        {
            return 'None';
        }

        const secondsLeft = Math.max(0, Math.ceil((player.activeWeaponExpiresAt - Date.now()) / 1000));
        if (secondsLeft <= 0)
        {
            return 'None';
        }

        return `${player.activeWeaponType.toUpperCase()} (${secondsLeft}s)`;
    }

    private getWeaponIconFrame (weaponType: WeaponType | null)
    {
        if (weaponType === 'rocket')
        {
            return 'rocket_missile';
        }

        if (weaponType === 'bomb')
        {
            return 'bomb_state_01';
        }

        if (weaponType === 'bullet')
        {
            return 'projectile_spark_02';
        }

        return 'slot_small_question';
    }

    private hasActiveWeapon (player: PlayerState)
    {
        if (!player.activeWeaponType)
        {
            return false;
        }

        if (!player.activeWeaponExpiresAt)
        {
            return true;
        }

        return player.activeWeaponExpiresAt > Date.now();
    }

    private applyHealthBar (bar: Phaser.GameObjects.Rectangle, hp: number, maxWidth: number)
    {
        const ratio = Phaser.Math.Clamp(hp, 0, 100) / 100;
        bar.displayWidth = Math.max(0, maxWidth * ratio);
        bar.fillColor = ratio > 0.55 ? 0x60d96d : ratio > 0.25 ? 0xf2c24f : 0xd25d5d;
    }

    private getRemoteWalletLabel (player: PlayerState)
    {
        if (player.walletAddress)
        {
            return this.abbreviateWallet(player.walletAddress);
        }

        return `${this.trimPlayerName(player.name, 8)}...`;
    }

    private abbreviateWallet (walletAddress: string)
    {
        if (walletAddress.length <= 8)
        {
            return `${walletAddress}...`;
        }

        return `${walletAddress.slice(0, 8)}...`;
    }

    private getCrateTint (slot: CrateSlotState)
    {
        if (slot.weaponType === 'rocket')
        {
            return 0xffd0a2;
        }

        if (slot.weaponType === 'bomb')
        {
            return 0xe0dcc9;
        }

        return 0xb7d6ff;
    }

    private isWeaponType (value: string): value is CrateSlotState['weaponType']
    {
        return value === 'rocket' || value === 'bomb' || value === 'bullet';
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
