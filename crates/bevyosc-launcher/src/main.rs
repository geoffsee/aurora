use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use tao::dpi::LogicalSize;
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoop};
use tao::window::WindowBuilder;
use wry::WebViewBuilder;

#[cfg(target_os = "linux")]
use wry::WebViewBuilderExtUnix;

const VISUAL_PORT: u16 = 3000;
const CONTROLS_PORT: u16 = 3001;
const BRIDGE_START_TIMEOUT: Duration = Duration::from_secs(30);

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[cfg(windows)]
use std::os::windows::process::CommandExt;


fn main() {
    if let Err(error) = run() {
        eprintln!("bevyosc launcher failed: {error}");
        std::process::exit(1);
    }
}

struct BridgeChild(Child);

impl Drop for BridgeChild {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn run() -> Result<(), String> {
    let exe_dir = exe_dir()?;
    let resource_dir = resource_dir(&exe_dir)?;
    let bridge_path = bridge_path(&exe_dir)?;

    if !bridge_path.is_file() {
        return Err(format!(
            "bridge binary not found at {}",
            bridge_path.display()
        ));
    }
    if !resource_dir.is_dir() {
        return Err(format!(
            "resource directory not found at {}",
            resource_dir.display()
        ));
    }

    let _bridge = spawn_bridge(&bridge_path, &resource_dir)?;
    wait_for_ports(
        &[
            ("visual server", VISUAL_PORT),
            ("controls server", CONTROLS_PORT),
        ],
        BRIDGE_START_TIMEOUT,
    )?;

    let event_loop = EventLoop::new();

    let projector_window = WindowBuilder::new()
        .with_title("bevyosc VJ")
        .with_decorations(false)
        .with_inner_size(LogicalSize::new(1280.0, 720.0))
        .build(&event_loop)
        .map_err(|error| error.to_string())?;

    let controls_window = WindowBuilder::new()
        .with_title("bevyosc Controls")
        .with_inner_size(LogicalSize::new(440.0, 920.0))
        .build(&event_loop)
        .map_err(|error| error.to_string())?;

    let projector_url = format!("http://127.0.0.1:{VISUAL_PORT}/");
    let controls_url = format!("http://127.0.0.1:{CONTROLS_PORT}/");

    let _projector_webview = build_webview(&projector_window, &projector_url)?;
    let _controls_webview = build_webview(&controls_window, &controls_url)?;

    event_loop.run(move |event, _event_loop, control_flow| {
        *control_flow = ControlFlow::Wait;

        if let Event::WindowEvent {
            event: WindowEvent::CloseRequested,
            ..
        } = event
        {
            *control_flow = ControlFlow::Exit;
        }
    });
}

fn exe_dir() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    exe.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| format!("no parent directory for {}", exe.display()))
}

fn resource_dir(exe_dir: &Path) -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    {
        if exe_dir.file_name().and_then(|name| name.to_str()) == Some("MacOS") {
            return Ok(exe_dir
                .parent()
                .ok_or_else(|| "invalid .app layout: missing Contents".to_string())?
                .join("Resources"));
        }
    }

    Ok(exe_dir.to_path_buf())
}

fn bridge_path(exe_dir: &Path) -> Result<PathBuf, String> {
    let name = if cfg!(windows) {
        "bevyosc-bridge.exe"
    } else {
        "bevyosc-bridge"
    };
    Ok(exe_dir.join(name))
}

fn spawn_bridge(bridge_path: &Path, resource_dir: &Path) -> Result<BridgeChild, String> {
    let mut command = Command::new(bridge_path);
    command
        .env("BEVYOSC_ROOT", resource_dir)
        .env("PORT", VISUAL_PORT.to_string())
        .env("CONTROLS_PORT", CONTROLS_PORT.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    let child = command
        .spawn()
        .map_err(|error| format!("failed to spawn bridge: {error}"))?;

    Ok(BridgeChild(child))
}

fn wait_for_ports(services: &[(&str, u16)], timeout: Duration) -> Result<(), String> {
    let deadline = Instant::now() + timeout;
    let mut ready = vec![false; services.len()];

    while Instant::now() < deadline {
        for (index, (_, port)) in services.iter().enumerate() {
            if ready[index] {
                continue;
            }
            let address = SocketAddr::from(([127, 0, 0, 1], *port));
            if TcpStream::connect_timeout(&address, Duration::from_millis(200)).is_ok() {
                ready[index] = true;
            }
        }

        if ready.iter().all(|is_ready| *is_ready) {
            return Ok(());
        }

        thread::sleep(Duration::from_millis(100));
    }

    let pending = services
        .iter()
        .zip(ready.iter())
        .filter_map(|((name, port), is_ready)| {
            if *is_ready {
                None
            } else {
                Some(format!("{name} (:{port})"))
            }
        })
        .collect::<Vec<_>>()
        .join(", ");

    Err(format!(
        "bridge did not become ready within {}s ({pending})",
        timeout.as_secs()
    ))
}

fn build_webview(
    window: &tao::window::Window,
    url: &str,
) -> Result<wry::WebView, String> {
    let builder = WebViewBuilder::new().with_url(url);

    #[cfg(not(target_os = "linux"))]
    {
        builder
            .build(window)
            .map_err(|error| error.to_string())
    }

    #[cfg(target_os = "linux")]
    {
        builder
            .build_gtk(window.default_vbox().unwrap())
            .map_err(|error| error.to_string())
    }
}
