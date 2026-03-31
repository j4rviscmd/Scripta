fn main() {
    #[cfg(target_os = "macos")]
    {
        use swift_rs::SwiftLinker;
        SwiftLinker::new("15.0")
            .with_package("ScriptaTranslation", "ScriptaTranslation")
            .link();

        // Swift runtime libraries (libswift_Concurrency, etc.) live here
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    }
    tauri_build::build()
}
