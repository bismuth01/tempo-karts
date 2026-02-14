import { GameObjects, Scene } from 'phaser';
import { io } from 'socket.io-client';
import { EventBus } from '../EventBus';
import type {
    GameSocket,
    JoinAckResponse,
    JoinPayload,
    MultiplayerSession,
    RoomState
} from '../net/multiplayer';
import { applyDirectionPose, KART_SPIN_POSE_ORDER } from '../kartDirection';

type MenuMode = 'create' | 'join';

type PrivyStatusPayload = {
    ready: boolean;
    authenticated: boolean;
    walletAddress: string | null;
    playerName: string;
    buttonLabel: string;
};

type CreateRoomResponse = {
    room: RoomState;
    hostPlayer: {
        id: string;
    };
};

export class MainMenu extends Scene {
    private background!: GameObjects.TileSprite;
    private grassOverlay!: GameObjects.TileSprite;
    private dirtOverlay!: GameObjects.TileSprite;
    private stoneOverlay!: GameObjects.TileSprite;
    private topFenceBand!: GameObjects.TileSprite;
    private bottomFenceBand!: GameObjects.TileSprite;

    private kart!: GameObjects.Sprite;
    private kartSpinTimer?: Phaser.Time.TimerEvent;

    private playerNameValueText!: GameObjects.Text;
    private walletStatusText!: GameObjects.Text;
    private walletActionText!: GameObjects.Text;
    private walletButtonBase!: GameObjects.TileSprite;
    private walletButtonGlow!: GameObjects.TileSprite;

    private privyReady = false;
    private privyAuthenticated = false;
    private walletAddress: string | null = null;

    private popupOverlay?: GameObjects.Rectangle;
    private popupContainer?: GameObjects.Container;
    private backgroundBlurFx: Phaser.FX.Blur[] = [];
    private blurTargets: Array<GameObjects.TileSprite | GameObjects.Image> = [];

    private roomCodeInput: HTMLInputElement | null = null;
    private roomInputResizeHandler?: () => void;

    private activeSocket?: GameSocket;
    private popupBusy = false;

    private readonly serverBaseUrl = (process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:4000').replace(/\/$/, '');

    constructor () {
        super('MainMenu');
    }

    create () {
        const { width, height } = this.scale;

        this.background = this.add.tileSprite(width / 2, height / 2, width, height, 'sprite-sheet', 'tile_grass')
            .setDepth(0)
            .setTint(0x679d57)
            .setAlpha(0.46);

        this.grassOverlay = this.add.tileSprite(width / 2, height / 2, width, height, 'sprite-sheet', 'tile_grass')
            .setDepth(1)
            .setTint(0x87b870)
            .setAlpha(0.14);

        this.dirtOverlay = this.add.tileSprite(width / 2, height / 2, width, height, 'sprite-sheet', 'tile_dirt')
            .setDepth(2)
            .setTint(0xc28e57)
            .setAlpha(0.1);

        this.stoneOverlay = this.add.tileSprite(width / 2, height / 2, width, height, 'sprite-sheet', 'tile_stone_wall')
            .setDepth(3)
            .setTint(0x6e665f)
            .setAlpha(0.05);

        this.topFenceBand = this.add.tileSprite(width / 2, 210, width, 76, 'sprite-sheet', 'tile_wood_fence')
            .setDepth(3)
            .setTint(0xa17042)
            .setAlpha(0.08);

        this.bottomFenceBand = this.add.tileSprite(width / 2, height - 86, width, 96, 'sprite-sheet', 'tile_wood_fence')
            .setDepth(3)
            .setTint(0x8e6339)
            .setAlpha(0.1);

        this.blurTargets.push(
            this.background,
            this.grassOverlay,
            this.dirtOverlay,
            this.stoneOverlay,
            this.topFenceBand,
            this.bottomFenceBand
        );

        this.createBackdropDecor();

        this.add.rectangle(width / 2, 98, width, 150, 0x100904, 0.48).setDepth(4);
        this.add.rectangle(width / 2, 24, width, 3, 0xf2d7a2, 0.28).setDepth(5);
        this.add.rectangle(width / 2, 172, width, 2, 0xf2d7a2, 0.18).setDepth(5);

        this.add.text(width / 2, 96, 'TEMPO KARTS', {
            fontFamily: 'Cinzel',
            fontStyle: 'bold',
            fontSize: '92px',
            color: '#f8e6be',
            stroke: '#2f1c10',
            strokeThickness: 10,
            shadow: {
                offsetX: 0,
                offsetY: 5,
                color: '#000000',
                blur: 0,
                stroke: true,
                fill: true
            }
        }).setOrigin(0.5).setDepth(6);

        this.add.text(width / 2, 148, 'RUSTIC RACING • ON-CHAIN MAYHEM', {
            fontFamily: 'Cinzel',
            fontStyle: 'bold',
            fontSize: '20px',
            color: '#f3dfb2',
            stroke: '#2b170c',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(6).setAlpha(0.86);

        this.createCenterStage();
        this.createTopLeftPlayerName();
        this.createTopRightWallet();
        this.createSpinningKart();
        this.createMenuButtons();
        this.bindPrivyEvents();

        this.events.once('shutdown', this.onSceneShutdown);

        EventBus.emit('current-scene-ready', this);
    }

    private onSceneShutdown = () => {
        EventBus.removeListener('privy-status-changed', this.handlePrivyStatus);
        this.removeRoomCodeInput();
        this.clearBackgroundBlur();

        if (this.activeSocket) {
            this.activeSocket.disconnect();
            this.activeSocket = undefined;
        }

        this.kartSpinTimer?.remove(false);
        this.kartSpinTimer = undefined;
    };

    private createBackdropDecor () {
        const { width, height } = this.scale;

        this.add.rectangle(width / 2, height / 2, width, height, 0x0e0804, 0.16).setDepth(3);

        const sideShadeWidth = Math.max(90, width * 0.08);
        this.add.rectangle(sideShadeWidth / 2, height / 2, sideShadeWidth, height, 0x080402, 0.28).setDepth(4);
        this.add.rectangle(width - sideShadeWidth / 2, height / 2, sideShadeWidth, height, 0x080402, 0.28).setDepth(4);
        this.add.rectangle(width / 2, height - 18, width, 36, 0x050301, 0.18).setDepth(4);
    }

    private createCenterStage () {
        const { width, height } = this.scale;

        this.add.ellipse(width / 2, height * 0.71, 560, 340, 0x1d1008, 0.14).setDepth(7);
        this.add.ellipse(width / 2, height * 0.73, 470, 240, 0x2a170c, 0.1).setDepth(8);
    }

    changeScene () {
        this.scene.start('Game');
    }

    private createTopLeftPlayerName () {
        const panelX = 210;
        const panelY = 84;

        this.add.tileSprite(panelX, panelY, 360, 92, 'sprite-sheet', 'slot_small_wood')
            .setDepth(10)
            .setTint(0xf2d09c);

        this.add.rectangle(panelX, panelY, 326, 72, 0x120c08, 0.2).setDepth(11);

        this.add.text(panelX - 145, panelY - 21, 'PLAYER NAME', {
            fontFamily: 'Cinzel',
            fontStyle: 'bold',
            fontSize: '20px',
            color: '#f6e6c1',
            stroke: '#2a170d',
            strokeThickness: 4
        }).setDepth(12);

        this.playerNameValueText = this.add.text(panelX - 145, panelY + 6, 'VillageRacer', {
            fontFamily: 'Cinzel',
            fontStyle: 'bold',
            fontSize: '28px',
            color: '#fff5db',
            stroke: '#2a170d',
            strokeThickness: 5
        }).setDepth(12);
    }

    private createTopRightWallet () {
        const { width } = this.scale;
        const panelX = width - 230;
        const panelY = 84;

        this.add.tileSprite(panelX, panelY, 430, 92, 'sprite-sheet', 'slot_small_stone')
            .setDepth(10)
            .setTint(0xf0e4cf);

        this.add.rectangle(panelX, panelY, 390, 72, 0x140d09, 0.22).setDepth(11);

        this.add.text(panelX - 184, panelY - 21, 'PRIVY WALLET', {
            fontFamily: 'Cinzel',
            fontStyle: 'bold',
            fontSize: '20px',
            color: '#f8eacb',
            stroke: '#2a170d',
            strokeThickness: 4
        }).setDepth(12);

        this.walletStatusText = this.add.text(panelX - 184, panelY + 6, 'Initializing Privy...', {
            fontFamily: 'Cinzel',
            fontStyle: 'bold',
            fontSize: '21px',
            color: '#fff3d3',
            stroke: '#2a170d',
            strokeThickness: 4
        }).setDepth(12);

        const buttonX = panelX + 132;
        const buttonY = panelY;

        this.walletButtonBase = this.add.tileSprite(buttonX, buttonY, 138, 50, 'sprite-sheet', 'slot_small_question')
            .setDepth(13);

        this.walletButtonGlow = this.add.tileSprite(buttonX, buttonY, 138, 50, 'sprite-sheet', 'slot_small_question')
            .setDepth(14)
            .setAlpha(0);

        this.walletActionText = this.add.text(buttonX, buttonY, 'WAIT', {
            fontFamily: 'Cinzel',
            fontStyle: 'bold',
            fontSize: '20px',
            color: '#fff4d9',
            stroke: '#2a170d',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(15);

        const hitArea = this.add.rectangle(buttonX, buttonY, 138, 50, 0xffffff, 0.001)
            .setDepth(16)
            .setInteractive({ useHandCursor: true });

        hitArea.on('pointerover', () => {
            this.walletButtonGlow.setAlpha(0.2);
            this.walletButtonBase.setTint(0xffefc1);
        });

        hitArea.on('pointerout', () => {
            this.walletButtonGlow.setAlpha(0);
            this.walletButtonBase.clearTint();
        });

        hitArea.on('pointerup', () => {
            if (!this.privyReady) {
                return;
            }

            EventBus.emit('privy-connect-request');
        });
    }

    private createSpinningKart () {
        const { width, height } = this.scale;

        this.kart = this.add.sprite(width / 2, height / 2 + 70, 'kart-sheet', 'kart_blue_base_down')
            .setScale(0.96)
            .setDepth(20);

        applyDirectionPose(this.kart, 2);
        this.add.ellipse(width / 2, height / 2 + 178, 290, 58, 0x120904, 0.34).setDepth(19);

        let poseStep = 0;
        this.kartSpinTimer = this.time.addEvent({
            delay: 210,
            loop: true,
            callback: () => {
                poseStep = (poseStep + 1) % KART_SPIN_POSE_ORDER.length;
                const pose = KART_SPIN_POSE_ORDER[poseStep];
                applyDirectionPose(this.kart, pose);
            }
        });

        this.tweens.add({
            targets: this.kart,
            y: this.kart.y + 11,
            duration: 1600,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1
        });
    }

    private createMenuButtons () {
        const { width, height } = this.scale;
        const firstButtonY = height * 0.79;

        this.createMenuButton(width / 2, firstButtonY, 'CREATE GAME', 'slot_med_wood', () => {
            this.openPopup('create');
        });

        this.createMenuButton(width / 2, firstButtonY + 104, 'JOIN GAME', 'slot_med_stone', () => {
            this.openPopup('join');
        });
    }

    private createMenuButton (
        x: number,
        y: number,
        label: string,
        frame: string,
        onClick: () => void
    ) {
        const container = this.add.container(x, y).setDepth(25);
        const buttonWidth = 408;
        const buttonHeight = 92;

        const shadow = this.add.rectangle(0, 8, buttonWidth - 22, buttonHeight - 18, 0x0a0502, 0.42)
            .setDepth(-1);

        const base = this.add.tileSprite(0, 0, buttonWidth, buttonHeight, 'sprite-sheet', frame);

        const glow = this.add.tileSprite(0, 0, buttonWidth, buttonHeight, 'sprite-sheet', 'slot_small_question')
            .setAlpha(0);

        const text = this.add.text(0, 0, label, {
            fontFamily: 'Cinzel',
            fontStyle: 'bold',
            fontSize: '48px',
            color: '#fff1cd',
            stroke: '#2a160b',
            strokeThickness: 7,
            shadow: {
                offsetX: 0,
                offsetY: 3,
                color: '#000000',
                blur: 0,
                stroke: true,
                fill: true
            }
        }).setOrigin(0.5);

        const hitArea = this.add.rectangle(0, 0, buttonWidth, buttonHeight, 0xffffff, 0.001)
            .setInteractive({ useHandCursor: true });

        hitArea.on('pointerover', () => {
            base.setTint(0xffe9b3);
            glow.setAlpha(0.22);
            container.y = y - 4;
            shadow.y = 12;
        });

        hitArea.on('pointerout', () => {
            base.clearTint();
            glow.setAlpha(0);
            container.y = y;
            shadow.y = 8;
        });

        hitArea.on('pointerup', onClick);

        container.add([shadow, base, glow, text, hitArea]);

        this.tweens.add({
            targets: glow,
            alpha: { from: 0.02, to: 0.1 },
            duration: 1800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    private openPopup (mode: MenuMode) {
        if (this.popupContainer) {
            return;
        }

        this.popupBusy = false;

        const { width, height } = this.scale;

        this.popupOverlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.3)
            .setDepth(90)
            .setInteractive();

        this.popupOverlay.on('pointerdown', () => this.closePopup());

        this.applyBackgroundBlur();

        this.popupContainer = this.buildPopupContainer(mode);
        this.popupContainer.setDepth(100);
    }

    private buildPopupContainer (mode: MenuMode) {
        const { width, height } = this.scale;

        const panelWidth = 900;
        const panelHeight = 520;
        const container = this.add.container(width / 2, height / 2);

        const center = this.add.tileSprite(0, 0, panelWidth, panelHeight, 'sprite-sheet', 'tile_dirt');

        const topBorder = this.add.tileSprite(0, -panelHeight / 2 + 28, panelWidth, 56, 'sprite-sheet', 'tile_stone_wall');

        const bottomBorder = this.add.tileSprite(0, panelHeight / 2 - 28, panelWidth, 56, 'sprite-sheet', 'tile_stone_wall');

        const leftBorder = this.add.tileSprite(-panelWidth / 2 + 28, 0, 56, panelHeight - 56, 'sprite-sheet', 'slot_small_stone');

        const rightBorder = this.add.tileSprite(panelWidth / 2 - 28, 0, 56, panelHeight - 56, 'sprite-sheet', 'slot_small_stone');

        const title = this.add.text(0, -panelHeight / 2 + 86, mode === 'create' ? 'CREATE GAME' : 'JOIN GAME', {
            fontFamily: 'Cinzel',
            fontStyle: 'bold',
            fontSize: '64px',
            color: '#fff0cd',
            stroke: '#3c2415',
            strokeThickness: 10
        }).setOrigin(0.5);

        const subLabel = this.add.text(
            0,
            -40,
            mode === 'create' ? 'Set room details and start a new match' : 'Enter room code to join an existing match',
            {
                fontFamily: 'Cinzel',
                fontStyle: 'bold',
                fontSize: '34px',
                color: '#3d2314',
                stroke: '#ffeec8',
                strokeThickness: 3
            }
        ).setOrigin(0.5);

        const field = this.add.tileSprite(0, 58, 640, 92, 'sprite-sheet', 'timer_board_large');

        const fieldText = this.add.text(0, 58, mode === 'create' ? 'Room: (will be generated)' : 'Code:', {
            fontFamily: 'Cinzel',
            fontStyle: 'bold',
            fontSize: '34px',
            color: '#2d1a10',
            stroke: '#ffeac3',
            strokeThickness: 3
        }).setOrigin(0.5);

        const infoText = this.add.text(0, 124, '', {
            fontFamily: 'Cinzel',
            fontStyle: 'bold',
            fontSize: '22px',
            color: '#3d2314',
            stroke: '#ffeec8',
            strokeThickness: 2
        }).setOrigin(0.5);

        if (mode === 'join') {
            this.createRoomCodeInput(width / 2, height / 2 + 58);
            fieldText.setText('');
        }

        const primaryLabel = mode === 'create' ? 'CREATE' : 'JOIN';
        const primaryAction = this.createPopupButton(0, 188, primaryLabel, () => {
            void this.handlePopupPrimaryAction(mode, fieldText, infoText);
        });

        const closeAction = this.createPopupButton(0, 274, 'CANCEL', () => {
            this.closePopup();
        }, 'slot_med_stone');

        container.add([
            center,
            topBorder,
            bottomBorder,
            leftBorder,
            rightBorder,
            title,
            subLabel,
            field,
            fieldText,
            infoText,
            primaryAction,
            closeAction
        ]);

        return container;
    }

    private async handlePopupPrimaryAction (
        mode: MenuMode,
        fieldText: GameObjects.Text,
        infoText: GameObjects.Text
    ) {
        if (this.popupBusy) {
            return;
        }

        this.popupBusy = true;

        try {
            if (mode === 'create') {
                await this.createRoomFlow(fieldText, infoText);
                return;
            }

            await this.joinRoomFlow(infoText);
        } catch (error) {
            infoText.setText(this.getErrorMessage(error));
        } finally {
            this.popupBusy = false;
        }
    }

    private async createRoomFlow (fieldText: GameObjects.Text, infoText: GameObjects.Text) {
        infoText.setText('Creating room...');

        const response = await fetch(`${this.serverBaseUrl}/api/rooms`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                hostName: this.playerNameValueText.text || 'VillageRacer',
                walletAddress: this.walletAddress ?? undefined,
                maxPlayers: 4
            })
        });

        if (!response.ok) {
            const body = await response.json().catch(() => null) as { error?: string } | null;
            throw new Error(body?.error ?? `Create room failed (${response.status})`);
        }

        const created = await response.json() as CreateRoomResponse;
        const roomCode = created.room?.code;
        const hostPlayerId = created.hostPlayer?.id;

        if (!roomCode || !hostPlayerId) {
            throw new Error('Invalid create-room response');
        }

        fieldText.setText(`Room: ${roomCode}`);

        const joined = await this.connectAndJoin({
            roomCode,
            role: 'player',
            playerName: this.playerNameValueText.text || 'VillageRacer',
            walletAddress: this.walletAddress ?? undefined,
            playerId: hostPlayerId
        });

        infoText.setText('Room ready! Starting game...');
        this.promoteSessionAndStartGame(joined.socket, roomCode, joined.playerId, joined.room);
    }

    private async joinRoomFlow (infoText: GameObjects.Text) {
        const rawRoomCode = this.roomCodeInput?.value?.trim().toUpperCase() ?? '';
        const roomCode = this.normalizeRoomCode(rawRoomCode);

        if (!roomCode) {
            throw new Error('Enter a room code first');
        }

        if (!roomCode.startsWith('KART-')) {
            throw new Error('Room code format should be KART-XXXX or XXXX');
        }

        infoText.setText('Joining room...');

        const joined = await this.connectAndJoin({
            roomCode,
            role: 'player',
            playerName: this.playerNameValueText.text || 'VillageRacer',
            walletAddress: this.walletAddress ?? undefined
        });

        infoText.setText('Joined! Starting game...');
        this.promoteSessionAndStartGame(joined.socket, roomCode, joined.playerId, joined.room);
    }

    private normalizeRoomCode (rawCode: string) {
        const compact = rawCode.replace(/\s+/g, '').toUpperCase();

        if (compact.length === 4) {
            return `KART-${compact}`;
        }

        return compact;
    }

    private async connectAndJoin (payload: JoinPayload) {
        const socket = io(this.serverBaseUrl, {
            transports: ['websocket', 'polling']
        }) as GameSocket;

        this.activeSocket = socket;

        await this.waitForSocketConnect(socket);

        const ack = await new Promise<JoinAckResponse>((resolve) => {
            socket.emit('room:join', payload, resolve);
        });

        if (!ack.ok) {
            socket.disconnect();
            this.activeSocket = undefined;
            throw new Error(ack.error || 'Join failed');
        }

        if (ack.role !== 'player') {
            socket.disconnect();
            this.activeSocket = undefined;
            throw new Error('Only player role is supported right now');
        }

        const playerId = ack.player?.id ?? ack.playerId;

        if (!playerId) {
            socket.disconnect();
            this.activeSocket = undefined;
            throw new Error('Join response missing playerId');
        }

        return { socket, playerId, room: ack.room };
    }

    private waitForSocketConnect (socket: GameSocket) {
        return new Promise<void>((resolve, reject) => {
            const timeout = window.setTimeout(() => {
                cleanup();
                socket.disconnect();
                reject(new Error('Socket connection timed out'));
            }, 7000);

            const onConnect = () => {
                cleanup();
                resolve();
            };

            const onConnectError = (error: Error) => {
                cleanup();
                reject(error);
            };

            const cleanup = () => {
                window.clearTimeout(timeout);
                socket.off('connect', onConnect);
                socket.off('connect_error', onConnectError);
            };

            socket.on('connect', onConnect);
            socket.on('connect_error', onConnectError);
        });
    }

    private promoteSessionAndStartGame (socket: GameSocket, roomCode: string, playerId: string, room: RoomState) {
        const session: MultiplayerSession = {
            socket,
            roomCode,
            playerId,
            room
        };

        this.registry.set('multiplayer:session', session);
        this.activeSocket = undefined;

        this.closePopup();
        this.scene.start('Game');
    }

    private createRoomCodeInput (x: number, y: number) {
        this.removeRoomCodeInput();

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'ENTER CODE';
        input.maxLength = 12;
        input.autocomplete = 'off';
        input.style.position = 'fixed';
        input.style.width = '320px';
        input.style.height = '58px';
        input.style.fontSize = '30px';
        input.style.fontFamily = 'Cinzel, serif';
        input.style.textAlign = 'center';
        input.style.background = 'rgba(255, 240, 209, 0.55)';
        input.style.border = '2px solid rgba(61, 35, 20, 0.7)';
        input.style.borderRadius = '8px';
        input.style.color = '#2d1a10';
        input.style.outline = 'none';
        input.style.fontWeight = 'bold';
        input.style.letterSpacing = '1px';
        input.style.textTransform = 'uppercase';
        input.style.zIndex = '10000';

        const positionInput = () => {
            const canvas = this.game.canvas;
            const rect = canvas.getBoundingClientRect();
            const screenX = rect.left + (x / this.scale.width) * rect.width;
            const screenY = rect.top + (y / this.scale.height) * rect.height;

            input.style.left = `${screenX}px`;
            input.style.top = `${screenY}px`;
            input.style.transform = 'translate(-50%, -50%)';
        };

        positionInput();
        document.body.appendChild(input);
        input.focus();

        this.roomCodeInput = input;
        this.roomInputResizeHandler = positionInput;
        this.scale.on('resize', positionInput);
    }

    private removeRoomCodeInput () {
        if (this.roomCodeInput) {
            this.roomCodeInput.remove();
            this.roomCodeInput = null;
        }

        if (this.roomInputResizeHandler) {
            this.scale.off('resize', this.roomInputResizeHandler);
            this.roomInputResizeHandler = undefined;
        }
    }

    private closePopup () {
        this.popupBusy = false;
        this.removeRoomCodeInput();

        if (this.popupContainer) {
            this.popupContainer.destroy(true);
            this.popupContainer = undefined;
        }

        if (this.popupOverlay) {
            this.popupOverlay.destroy();
            this.popupOverlay = undefined;
        }

        this.clearBackgroundBlur();
    }

    private createPopupButton (
        x: number,
        y: number,
        label: string,
        onClick: () => void,
        frame = 'slot_med_wood'
    ) {
        const container = this.add.container(x, y);
        const buttonWidth = 360;
        const buttonHeight = 78;

        const base = this.add.tileSprite(0, 0, buttonWidth, buttonHeight, 'sprite-sheet', frame);

        const labelText = this.add.text(0, 0, label, {
            fontFamily: 'Cinzel',
            fontStyle: 'bold',
            fontSize: '40px',
            color: '#ffefc8',
            stroke: '#2a170d',
            strokeThickness: 6
        }).setOrigin(0.5);

        const hitArea = this.add.rectangle(0, 0, buttonWidth, buttonHeight, 0xffffff, 0.001)
            .setInteractive({ useHandCursor: true });

        hitArea.on('pointerover', () => {
            base.setTint(0xffefc0);
            container.y = y - 2;
        });

        hitArea.on('pointerout', () => {
            base.clearTint();
            container.y = y;
        });

        hitArea.on('pointerup', onClick);

        container.add([base, labelText, hitArea]);

        return container;
    }

    private bindPrivyEvents () {
        EventBus.on('privy-status-changed', this.handlePrivyStatus);
        EventBus.emit('privy-status-request');
    }

    private handlePrivyStatus = (payload: PrivyStatusPayload) => {
        this.privyReady = payload.ready;
        this.privyAuthenticated = payload.authenticated;
        this.walletAddress = payload.walletAddress;

        this.playerNameValueText.setText(payload.playerName || 'VillageRacer');

        const walletLine = payload.authenticated
            ? `Connected: ${this.shortenAddress(payload.walletAddress)}`
            : payload.ready
                ? 'Not Connected'
                : 'Initializing Privy...';

        this.walletStatusText.setText(walletLine);
        this.walletActionText.setText(payload.buttonLabel || 'CONNECT');

        if (!payload.ready) {
            this.walletButtonBase.setTint(0x9b8b79);
            this.walletActionText.setAlpha(0.9);

            return;
        }

        if (payload.authenticated) {
            this.walletButtonBase.setTint(0xf8dba0);
            this.walletActionText.setAlpha(1);

            return;
        }

        this.walletButtonBase.clearTint();
        this.walletActionText.setAlpha(1);
    };

    private shortenAddress (address: string | null): string {
        if (!address) {
            return 'No Wallet';
        }

        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }

    private applyBackgroundBlur () {
        this.clearBackgroundBlur();

        this.blurTargets.forEach((target) => {
            if (target.preFX) {
                this.backgroundBlurFx.push(target.preFX.addBlur(0, 1, 1, 1, 0xffffff, 3));
            }
        });
    }

    private clearBackgroundBlur () {
        this.blurTargets.forEach((target) => {
            if (target.preFX) {
                target.preFX.clear();
            }
        });

        this.backgroundBlurFx = [];
    }

    private getErrorMessage (error: unknown) {
        if (error instanceof Error && error.message) {
            return error.message;
        }

        return 'Something went wrong. Please try again.';
    }
}
