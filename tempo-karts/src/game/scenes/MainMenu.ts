import { GameObjects, Scene } from 'phaser';
import { EventBus } from '../EventBus';

type MenuMode = 'create' | 'join';

type PrivyStatusPayload = {
    ready: boolean;
    authenticated: boolean;
    walletAddress: string | null;
    playerName: string;
    buttonLabel: string;
};

export class MainMenu extends Scene {
    private background!: GameObjects.Image;
    private grassOverlay!: GameObjects.Image;
    private kart!: GameObjects.Sprite;

    private playerNameValueText!: GameObjects.Text;
    private walletStatusText!: GameObjects.Text;
    private walletActionText!: GameObjects.Text;
    private walletButtonBase!: GameObjects.Image;
    private walletButtonGlow!: GameObjects.Image;

    private privyReady = false;
    private privyAuthenticated = false;

    private popupOverlay?: GameObjects.Rectangle;
    private popupContainer?: GameObjects.Container;
    private backgroundBlurFx?: Phaser.FX.Blur;

    constructor() {
        super('MainMenu');
    }

    create() {
        const { width, height } = this.scale;

        this.background = this.add.image(width / 2, height / 2, 'background')
            .setDisplaySize(width, height)
            .setAlpha(0.72)
            .setTint(0xa36f3d)
            .setDepth(0);

        this.grassOverlay = this.add.image(width / 2, height / 2, 'sprite-sheet', 'tile_grass')
            .setDisplaySize(width, height)
            .setAlpha(0.3)
            .setDepth(1);

        this.createBackdropDecor();

        this.add.rectangle(width / 2, 98, width, 150, 0x100904, 0.52).setDepth(4);
        this.add.rectangle(width / 2, 24, width, 3, 0xf2d7a2, 0.35).setDepth(5);
        this.add.rectangle(width / 2, 172, width, 2, 0xf2d7a2, 0.22).setDepth(5);

        this.add.text(width / 2, 96, 'TEMPO KARTS', {
            fontFamily: 'Firlest',
            fontStyle: 'normal',
            fontSize: '96px',
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

        EventBus.emit('current-scene-ready', this);
    }

    private createBackdropDecor() {
        const { width, height } = this.scale;

        this.add.rectangle(width / 2, height / 2, width, height, 0x0e0804, 0.12).setDepth(2);
        this.add.ellipse(width / 2, height / 2 + 72, width * 0.62, height * 0.56, 0xf4ddaf, 0.1).setDepth(3);

        const sideShadeWidth = Math.max(90, width * 0.08);
        this.add.rectangle(sideShadeWidth / 2, height / 2, sideShadeWidth, height, 0x080402, 0.32).setDepth(3);
        this.add.rectangle(width - sideShadeWidth / 2, height / 2, sideShadeWidth, height, 0x080402, 0.32).setDepth(3);
        this.add.rectangle(width / 2, height - 18, width, 36, 0x050301, 0.2).setDepth(3);
    }

    private createCenterStage() {
        const { width, height } = this.scale;

        this.add.image(width / 2, height * 0.66, 'sprite-sheet', 'tile_dirt')
            .setDisplaySize(620, 500)
            .setDepth(7)
            .setAlpha(0.16);

        this.add.rectangle(width / 2, height * 0.66, 586, 454, 0x1b110a, 0.24)
            .setDepth(8)
            .setStrokeStyle(2, 0xe8cb94, 0.2);
    }

    changeScene() {
        this.scene.start('Game');
    }

    private createTopLeftPlayerName() {
        const panelX = 210;
        const panelY = 84;

        this.add.image(panelX, panelY, 'sprite-sheet', 'slot_small_wood')
            .setDisplaySize(360, 92)
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

    private createTopRightWallet() {
        const { width } = this.scale;
        const panelX = width - 230;
        const panelY = 84;

        this.add.image(panelX, panelY, 'sprite-sheet', 'slot_small_stone')
            .setDisplaySize(430, 92)
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

        this.walletButtonBase = this.add.image(buttonX, buttonY, 'sprite-sheet', 'slot_small_question')
            .setDisplaySize(138, 50)
            .setDepth(13);

        this.walletButtonGlow = this.add.image(buttonX, buttonY, 'sprite-sheet', 'slot_small_question')
            .setDisplaySize(138, 50)
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

    private createSpinningKart() {
        const { width, height } = this.scale;

        const spinFrames = [
            'kart_blue_01',
            'kart_blue_02',
            'kart_blue_03',
            'kart_blue_04',
            'kart_blue_05',
            'kart_blue_06',
            'kart_blue_07',
            'kart_blue_06',
            'kart_blue_05',
            'kart_blue_04',
            'kart_blue_03',
            'kart_blue_02'
        ];

        if (!this.anims.exists('main-menu-kart-spin')) {
            this.anims.create({
                key: 'main-menu-kart-spin',
                frames: spinFrames.map((frame) => ({ key: 'sprite-sheet', frame })),
                frameRate: 4,
                repeat: -1
            });
        }

        this.kart = this.add.sprite(width / 2, height / 2 + 70, 'sprite-sheet', 'kart_blue_01')
            .setScale(2.55)
            .setDepth(20);

        this.add.ellipse(width / 2, height / 2 + 180, 260, 52, 0x120904, 0.34).setDepth(19);

        this.kart.play('main-menu-kart-spin');

        this.tweens.add({
            targets: this.kart,
            y: this.kart.y + 11,
            duration: 1600,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1
        });

        this.tweens.add({
            targets: this.kart,
            angle: { from: -2, to: 2 },
            duration: 1800,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1
        });
    }

    private createMenuButtons() {
        const { width, height } = this.scale;
        const firstButtonY = height * 0.79;

        this.createMenuButton(width / 2, firstButtonY, 'CREATE GAME', 'slot_med_wood', () => {
            this.openPopup('create');
        });

        this.createMenuButton(width / 2, firstButtonY + 104, 'JOIN GAME', 'slot_med_stone', () => {
            this.openPopup('join');
        });
    }

    private createMenuButton(
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

        const base = this.add.image(0, 0, 'sprite-sheet', frame)
            .setDisplaySize(buttonWidth, buttonHeight);

        const glow = this.add.image(0, 0, 'sprite-sheet', 'slot_small_question')
            .setDisplaySize(buttonWidth, buttonHeight)
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

    private openPopup(mode: MenuMode) {
        if (this.popupContainer) {
            return;
        }

        const { width, height } = this.scale;

        this.popupOverlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.3)
            .setDepth(90)
            .setInteractive();

        this.popupOverlay.on('pointerdown', () => this.closePopup());

        if (this.background.preFX) {
            this.backgroundBlurFx = this.background.preFX.addBlur(0, 1, 1, 1, 0xffffff, 3);
        }

        this.popupContainer = this.buildPopupContainer(mode);
        this.popupContainer.setDepth(100);
    }

    private buildPopupContainer(mode: MenuMode) {
        const { width, height } = this.scale;

        const panelWidth = 900;
        const panelHeight = 520;
        const container = this.add.container(width / 2, height / 2);

        const center = this.add.image(0, 0, 'sprite-sheet', 'tile_dirt')
            .setDisplaySize(panelWidth, panelHeight);

        const topBorder = this.add.image(0, -panelHeight / 2 + 28, 'sprite-sheet', 'tile_stone_wall')
            .setDisplaySize(panelWidth, 56);

        const bottomBorder = this.add.image(0, panelHeight / 2 - 28, 'sprite-sheet', 'tile_stone_wall')
            .setDisplaySize(panelWidth, 56);

        const leftBorder = this.add.image(-panelWidth / 2 + 28, 0, 'sprite-sheet', 'slot_small_stone')
            .setDisplaySize(56, panelHeight - 56);

        const rightBorder = this.add.image(panelWidth / 2 - 28, 0, 'sprite-sheet', 'slot_small_stone')
            .setDisplaySize(56, panelHeight - 56);

        const title = this.add.text(0, -panelHeight / 2 + 86, mode === 'create' ? 'CREATE GAME' : 'JOIN GAME', {
            fontFamily: 'Cinzel',
            fontStyle: 'bold',
            fontSize: '64px',
            color: '#fff0cd',
            stroke: '#3c2415',
            strokeThickness: 10
        }).setOrigin(0.5);

        const subLabel = this.add.text(0, -40, mode === 'create'
            ? 'Set room details and start a new match'
            : 'Enter room code to join an existing match', {
            fontFamily: 'Cinzel',
            fontStyle: 'bold',
            fontSize: '34px',
            color: '#3d2314',
            stroke: '#ffeec8',
            strokeThickness: 3
        }).setOrigin(0.5);

        const field = this.add.image(0, 58, 'sprite-sheet', 'timer_board_large')
            .setDisplaySize(640, 92);

        const fieldText = this.add.text(0, 58, mode === 'create' ? 'Room: Village-Circuit-01' : 'Code: KART-7X3F', {
            fontFamily: 'Cinzel',
            fontStyle: 'bold',
            fontSize: '34px',
            color: '#2d1a10',
            stroke: '#ffeac3',
            strokeThickness: 3
        }).setOrigin(0.5);

        const primaryLabel = mode === 'create' ? 'CREATE' : 'JOIN';
        const primaryAction = this.createPopupButton(0, 188, primaryLabel, () => {
            this.closePopup();
            this.scene.start('Game');
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
            primaryAction,
            closeAction
        ]);

        return container;
    }

    private createPopupButton(
        x: number,
        y: number,
        label: string,
        onClick: () => void,
        frame = 'slot_med_wood'
    ) {
        const container = this.add.container(x, y);
        const buttonWidth = 360;
        const buttonHeight = 78;

        const base = this.add.image(0, 0, 'sprite-sheet', frame)
            .setDisplaySize(buttonWidth, buttonHeight);

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

    private bindPrivyEvents() {
        EventBus.on('privy-status-changed', this.handlePrivyStatus);
        EventBus.emit('privy-status-request');

        this.events.once('shutdown', () => {
            EventBus.removeListener('privy-status-changed', this.handlePrivyStatus);
        });
    }

    private handlePrivyStatus = (payload: PrivyStatusPayload) => {
        this.privyReady = payload.ready;
        this.privyAuthenticated = payload.authenticated;

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

    private shortenAddress(address: string | null): string {
        if (!address) {
            return 'No Wallet';
        }

        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }

    private closePopup() {
        if (this.popupContainer) {
            this.popupContainer.destroy(true);
            this.popupContainer = undefined;
        }

        if (this.popupOverlay) {
            this.popupOverlay.destroy();
            this.popupOverlay = undefined;
        }

        if (this.background.preFX && this.backgroundBlurFx) {
            this.background.preFX.remove(this.backgroundBlurFx);
            this.backgroundBlurFx = undefined;
        }
    }
}
