//! Keyboard transport + on-screen bus readout.

use bevy::prelude::*;

use crate::hot_reload::SketchWatch;
use crate::uniforms::StudioBus;

#[derive(Component)]
pub struct HudText;

pub fn spawn_hud(mut commands: Commands) {
    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                left: Val::Px(12.0),
                top: Val::Px(12.0),
                padding: UiRect::all(Val::Px(10.0)),
                ..default()
            },
            BackgroundColor(Color::srgba(0.0, 0.0, 0.0, 0.55)),
            GlobalZIndex(10),
        ))
        .with_children(|parent| {
            parent.spawn((
                Text::new("Preset Studio"),
                TextFont {
                    font_size: 14.0,
                    ..default()
                },
                TextColor(Color::srgb(0.85, 0.9, 0.8)),
                HudText,
            ));
        });
}

pub fn keyboard_bus(
    keys: Res<ButtonInput<KeyCode>>,
    mut bus: ResMut<StudioBus>,
    mut watch: ResMut<SketchWatch>,
) {
    if keys.just_pressed(KeyCode::Space) {
        bus.playing = !bus.playing;
    }
    if keys.just_pressed(KeyCode::KeyD) {
        bus.demo_audio = !bus.demo_audio;
        if !bus.demo_audio {
            // Idle sentinel like the show when nothing is driving audio.
            bus.energy = -1.0;
            bus.bass = 0.0;
            bus.mid = 0.0;
            bus.high = 0.0;
            bus.pulse = 0.0;
        } else if bus.energy < 0.0 {
            bus.energy = 0.4;
        }
    }
    if keys.just_pressed(KeyCode::KeyR) {
        watch.force_reload = true;
        watch.rescan();
    }
    if keys.just_pressed(KeyCode::BracketLeft) {
        watch.cycle(-1);
    }
    if keys.just_pressed(KeyCode::BracketRight) {
        watch.cycle(1);
    }

    let step = if keys.pressed(KeyCode::ShiftLeft) || keys.pressed(KeyCode::ShiftRight) {
        0.05
    } else {
        0.02
    };

    // Pack drive: I/K intensity, O/L depth, U/J feedback, Y/H speed
    nudge(
        &keys,
        KeyCode::KeyI,
        KeyCode::KeyK,
        step,
        &mut bus.intensity,
        0.0,
        1.0,
    );
    nudge(
        &keys,
        KeyCode::KeyO,
        KeyCode::KeyL,
        step,
        &mut bus.depth,
        0.0,
        1.0,
    );
    nudge(
        &keys,
        KeyCode::KeyU,
        KeyCode::KeyJ,
        step,
        &mut bus.feedback,
        0.0,
        1.0,
    );
    nudge(
        &keys,
        KeyCode::KeyY,
        KeyCode::KeyH,
        step,
        &mut bus.speed,
        0.0,
        1.0,
    );

    // Time scale
    if keys.pressed(KeyCode::Equal) || keys.pressed(KeyCode::NumpadAdd) {
        bus.time_scale = (bus.time_scale + step).min(4.0);
    }
    if keys.pressed(KeyCode::Minus) || keys.pressed(KeyCode::NumpadSubtract) {
        bus.time_scale = (bus.time_scale - step).max(0.0);
    }

    // Manual audio when demo off
    if !bus.demo_audio && bus.energy >= 0.0 {
        nudge(
            &keys,
            KeyCode::Digit1,
            KeyCode::Digit2,
            step,
            &mut bus.bass,
            0.0,
            1.0,
        );
        nudge(
            &keys,
            KeyCode::Digit3,
            KeyCode::Digit4,
            step,
            &mut bus.mid,
            0.0,
            1.0,
        );
        nudge(
            &keys,
            KeyCode::Digit5,
            KeyCode::Digit6,
            step,
            &mut bus.high,
            0.0,
            1.0,
        );
    }
    // Force live energy 0 when demo off but user wants driven zeros: Key0 toggles idle
    if keys.just_pressed(KeyCode::Digit0) {
        if bus.energy < 0.0 {
            bus.energy = 0.35;
        } else if !bus.demo_audio {
            bus.energy = -1.0;
        }
    }
}

fn nudge(
    keys: &ButtonInput<KeyCode>,
    up: KeyCode,
    down: KeyCode,
    step: f32,
    value: &mut f32,
    min: f32,
    max: f32,
) {
    if keys.pressed(up) {
        *value = (*value + step).clamp(min, max);
    }
    if keys.pressed(down) {
        *value = (*value - step).clamp(min, max);
    }
}

pub fn update_hud(
    bus: Res<StudioBus>,
    watch: Res<SketchWatch>,
    mut q: Query<&mut Text, With<HudText>>,
) {
    let sketch = watch
        .current()
        .and_then(|p| p.file_name())
        .and_then(|s| s.to_str())
        .unwrap_or("(none)");
    let play = if bus.playing { "play" } else { "pause" };
    let demo = if bus.demo_audio { "demo ON" } else { "demo OFF" };
    let energy_s = if bus.energy < 0.0 {
        "idle(-1)".into()
    } else {
        format!("{:.2}", bus.energy)
    };

    let body = format!(
        "Preset Studio  |  {sketch}  |  {play}  |  {demo}\n\
         status: {}\n\
         t={:.2}  scale={:.2}  energy={energy_s}  bass={:.2} mid={:.2} high={:.2} pulse={:.2}\n\
         pack_drive  I/K intensity={:.2}  O/L depth={:.2}  U/J trails={:.2}  Y/H speed={:.2}\n\
         [ ] sketch   R reload   Space play   D demo   RMB orbit   scroll zoom   0 idle",
        bus.status,
        bus.time,
        bus.time_scale,
        bus.bass,
        bus.mid,
        bus.high,
        bus.pulse,
        bus.intensity,
        bus.depth,
        bus.feedback,
        bus.speed,
    );

    for mut text in &mut q {
        *text = Text::new(body.clone());
    }
}
