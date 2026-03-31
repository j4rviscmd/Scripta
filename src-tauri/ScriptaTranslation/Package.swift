// swift-tools-version:6.0
import PackageDescription

let package = Package(
    name: "ScriptaTranslation",
    platforms: [.macOS(.v15)],
    products: [
        .library(name: "ScriptaTranslation", type: .static, targets: ["ScriptaTranslation"]),
    ],
    dependencies: [
        .package(url: "https://github.com/Brendonovich/swift-rs", from: "1.0.6"),
    ],
    targets: [
        .target(
            name: "ScriptaTranslation",
            dependencies: [.product(name: "SwiftRs", package: "swift-rs")]
        ),
    ]
)
