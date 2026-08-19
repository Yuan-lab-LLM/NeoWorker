// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "NeoWorkerLocationHelper",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "NeoWorkerLocationHelper", targets: ["NeoWorkerLocationHelper"]),
    ],
    targets: [
        .executableTarget(
            name: "NeoWorkerLocationHelper",
            path: "Sources/NeoWorkerLocationHelper",
            swiftSettings: [
                .unsafeFlags(["-parse-as-library"])
            ]
        ),
    ]
)
