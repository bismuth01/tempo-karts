import { Scene } from 'phaser';

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    init ()
    {
        const { width, height } = this.scale;
        const centerX = width / 2;
        const centerY = height / 2;

        //  We loaded this image in our Boot Scene, so we can display it here
        this.add.image(centerX, centerY, 'background').setDisplaySize(width, height).setAlpha(0.35);

        //  A simple progress bar. This is the outline of the bar.
        this.add.rectangle(centerX, centerY, 468, 32).setStrokeStyle(1, 0xffffff);

        //  This is the progress bar itself. It will increase in size from the left based on the % of progress.
        const bar = this.add.rectangle(centerX - 230, centerY, 4, 28, 0xffffff);

        //  Use the 'progress' event emitted by the LoaderPlugin to update the loading bar
        this.load.on('progress', (progress: number) => {

            //  Update the progress bar (our bar is 464px wide, so 100% = 464px)
            bar.width = 4 + (460 * progress);

        });
    }

    preload ()
    {
        //  Load the assets for the game
        this.load.setPath('assets');

        this.load.image('logo', 'logo.png');
        this.load.image('star', 'star.png');
        this.load.image('sprite-sheet', 'sprite-sheet.png');
    }

    create ()
    {
        this.buildSpriteSheetFrames();

        this.scene.start('MainMenu');
    }

    private buildSpriteSheetFrames ()
    {
        const texture = this.textures.get('sprite-sheet');
        const frames: Array<[string, number, number, number, number]> = [
            ['kart_red_01', 16, 62, 136, 90],
            ['kart_red_02', 177, 62, 127, 96],
            ['kart_red_03', 320, 63, 122, 97],
            ['kart_red_04', 464, 56, 96, 104],
            ['kart_red_05', 578, 64, 134, 95],
            ['kart_red_06', 735, 63, 102, 96],
            ['kart_red_07', 870, 65, 130, 91],
            ['kart_blue_01', 16, 184, 148, 96],
            ['kart_blue_02', 177, 184, 130, 96],
            ['kart_blue_03', 319, 184, 131, 100],
            ['kart_blue_04', 462, 183, 99, 98],
            ['kart_blue_05', 571, 185, 138, 99],
            ['kart_blue_06', 735, 186, 105, 94],
            ['kart_blue_07', 863, 183, 138, 97],
            ['tile_grass', 24, 320, 147, 134],
            ['tile_dirt', 186, 321, 150, 135],
            ['tile_start_checker', 350, 322, 154, 133],
            ['tile_stone_wall', 520, 320, 150, 134],
            ['tile_wood_fence', 682, 320, 156, 135],
            ['tile_cliff_water_edge', 848, 320, 153, 134],
            ['weapon_crate_a', 32, 506, 104, 94],
            ['weapon_crate_b', 170, 506, 110, 94],
            ['rocket_missile', 318, 534, 140, 55],
            ['bomb_state_01', 487, 504, 78, 94],
            ['bomb_state_02', 581, 508, 67, 90],
            ['bomb_state_03', 680, 510, 86, 88],
            ['projectile_spark_01', 803, 560, 66, 28],
            ['projectile_spark_02', 888, 549, 49, 45],
            ['projectile_spark_03', 949, 550, 46, 46],
            ['aura_a_01', 32, 650, 118, 110],
            ['aura_a_02', 160, 650, 115, 110],
            ['explosion_a_01', 302, 650, 115, 110],
            ['explosion_a_02', 432, 649, 120, 111],
            ['explosion_a_03', 568, 650, 124, 111],
            ['smoke_a_01', 712, 651, 120, 109],
            ['smoke_a_02', 852, 651, 146, 109],
            ['heart_large_red', 39, 810, 65, 54],
            ['heart_large_gray', 121, 808, 69, 56],
            ['heart_large_white', 204, 810, 66, 53],
            ['dust_large_01', 320, 816, 56, 45],
            ['dust_large_02', 379, 816, 50, 46],
            ['dust_large_03', 442, 812, 66, 51],
            ['dust_large_04', 528, 811, 62, 52],
            ['dust_large_05', 606, 812, 61, 52],
            ['timer_board_large', 704, 808, 281, 76],
            ['heart_med_red', 32, 923, 62, 53],
            ['heart_med_dark', 104, 926, 57, 49],
            ['badge_med_shield', 176, 923, 48, 52],
            ['slot_med_wood', 278, 923, 77, 58],
            ['slot_med_stone', 380, 922, 80, 59],
            ['slot_med_crate', 480, 922, 49, 54],
            ['slot_med_question', 544, 924, 47, 53],
            ['arrow_med_01', 640, 937, 48, 34],
            ['arrow_med_02', 693, 936, 34, 38],
            ['arrow_med_03', 744, 936, 36, 35],
            ['arrow_med_04', 792, 936, 37, 37],
            ['arrow_med_05', 843, 936, 36, 35],
            ['arrow_med_06', 891, 936, 36, 34],
            ['arrow_med_07', 941, 937, 37, 35],
            ['explosion_b_01', 31, 1032, 154, 125],
            ['explosion_b_02', 200, 1032, 164, 126],
            ['explosion_b_03', 377, 1032, 183, 125],
            ['smoke_b_strip', 567, 1032, 429, 125],
            ['aura_c_01', 32, 1225, 128, 111],
            ['aura_c_02', 184, 1227, 139, 107],
            ['explosion_c_01', 343, 1227, 113, 107],
            ['smoke_c_01', 472, 1227, 138, 109],
            ['smoke_c_02', 631, 1227, 169, 109],
            ['smoke_c_03', 819, 1227, 178, 109],
            ['heart_small_red', 26, 1409, 64, 53],
            ['heart_small_dark', 96, 1409, 61, 52],
            ['heart_small_white', 165, 1409, 64, 52],
            ['slot_small_wood', 279, 1408, 98, 64],
            ['slot_small_stone', 403, 1408, 95, 64],
            ['slot_small_question', 512, 1408, 58, 63],
            ['arrow_small_01', 655, 1423, 33, 30],
            ['arrow_small_02', 697, 1420, 37, 36],
            ['arrow_small_03', 747, 1419, 36, 35],
            ['arrow_small_04', 808, 1418, 28, 36],
            ['arrow_small_05', 840, 1419, 32, 36],
            ['arrow_small_06', 896, 1421, 40, 35],
            ['arrow_small_07', 943, 1421, 41, 34]
        ];

        frames.forEach(([name, x, y, w, h]) => {
            if (!texture.has(name))
            {
                texture.add(name, 0, x, y, w, h);
            }
        });
    }
}
