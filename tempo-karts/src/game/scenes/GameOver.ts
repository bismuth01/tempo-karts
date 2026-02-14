import { EventBus } from '../EventBus';
import { Scene } from 'phaser';

export class GameOver extends Scene
{
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    gameOverText : Phaser.GameObjects.Text;

    constructor ()
    {
        super('GameOver');
    }

    create ()
    {
        const { width, height } = this.scale;
        const centerX = width / 2;
        const centerY = height / 2;

        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0x1e1208);

        this.background = this.add.image(centerX, centerY, 'background');
        this.background.setDisplaySize(width, height);
        this.background.setAlpha(0.4);

        this.gameOverText = this.add.text(centerX, centerY, 'Game Over', {
            fontFamily: 'Georgia', fontSize: 78, color: '#ffffff',
            stroke: '#000000', strokeThickness: 8,
            align: 'center'
        }).setOrigin(0.5).setDepth(100);

        EventBus.emit('current-scene-ready', this);
    }

    changeScene ()
    {
        this.scene.start('MainMenu');
    }
}
