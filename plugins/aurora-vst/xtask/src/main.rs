fn main() -> nih_plug_xtask::Result<()> {
    let workspace_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("xtask should live under the plugin workspace");
    std::env::set_current_dir(workspace_root)?;

    nih_plug_xtask::main()
}
