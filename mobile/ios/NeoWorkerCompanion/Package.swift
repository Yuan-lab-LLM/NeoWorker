// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "NeoWorkerCompanion",
    platforms: [.iOS(.v16)],
    targets: [
        .executableTarget(
            name: "NeoWorkerCompanion",
            path: "Sources"
        ),
    ]
)
